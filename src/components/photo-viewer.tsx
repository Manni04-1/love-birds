import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/components/hero';
import { Glyph, Row, T } from '@/components/ui';
import { useSignedUrl } from '@/lib/photos';

export type ViewerPhoto = { path: string; caption?: string | null; note?: string | null };

const MAX_ZOOM = 4;
const SWIPE = 70;

const distance = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
};

/**
 * One photo you can pinch to zoom, drag around once zoomed, and double tap to zoom in or out.
 * Swiping left or right (when not zoomed) moves to the next or previous photo.
 * Built on React Native's own touch handling, so it needs no extra native code.
 */
const clock = () => Date.now();

function ZoomablePhoto({ photo, onSwipe, onTap, onTouch }: { photo: ViewerPhoto; onSwipe: (dir: 1 | -1) => void; onTap: () => void; onTouch: () => void }) {
  const { width, height } = useWindowDimensions();
  const url = useSignedUrl(photo.path);
  const [anim] = useState(() => ({ scale: new Animated.Value(1), x: new Animated.Value(0), y: new Animated.Value(0) }));
  const st = useRef({ scale: 1, x: 0, y: 0, startScale: 1, startDist: 0, startX: 0, startY: 0, lastTap: 0, moved: false, pinched: false });
  const latest = useRef({ onSwipe, onTap, onTouch, width, height });
  useEffect(() => {
    latest.current = { onSwipe, onTap, onTouch, width, height };
  });

  const responder = useMemo(() => {
    const clampPan = (v: number, size: number, scale: number) => {
      const limit = ((scale - 1) * size) / 2;
      return Math.max(-limit, Math.min(limit, v));
    };
    const setZoom = (scale: number, x: number, y: number, animate: boolean) => {
      st.current.scale = scale;
      st.current.x = x;
      st.current.y = y;
      if (animate) {
        Animated.parallel([
          Animated.spring(anim.scale, { toValue: scale, useNativeDriver: true, friction: 7 }),
          Animated.spring(anim.x, { toValue: x, useNativeDriver: true, friction: 7 }),
          Animated.spring(anim.y, { toValue: y, useNativeDriver: true, friction: 7 }),
        ]).start();
      } else {
        anim.scale.setValue(scale);
        anim.x.setValue(x);
        anim.y.setValue(y);
      }
    };
    // The gesture handlers read `st` and `latest` only while a finger is down, never during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const s = st.current;
        s.startX = s.x;
        s.startY = s.y;
        s.startDist = 0;
        s.moved = false;
        s.pinched = false;
        latest.current.onTouch();
      },
      onPanResponderMove: (e, g) => {
        const s = st.current;
        const { width: w, height: h } = latest.current;
        if (e.nativeEvent.touches.length >= 2) {
          const d = distance(e);
          if (!s.startDist) {
            s.startDist = d;
            s.startScale = s.scale;
          }
          s.pinched = true;
          s.moved = true;
          const scale = Math.max(1, Math.min(MAX_ZOOM, (s.startScale * d) / s.startDist));
          setZoom(scale, clampPan(s.x, w, scale), clampPan(s.y, h, scale), false);
          return;
        }
        if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) s.moved = true;
        if (s.scale > 1.01) {
          setZoom(s.scale, clampPan(s.startX + g.dx, w, s.scale), clampPan(s.startY + g.dy, h, s.scale), false);
        } else if (!s.pinched) {
          anim.x.setValue(g.dx);
        }
      },
      onPanResponderRelease: (_e, g) => {
        const s = st.current;
        s.startDist = 0;
        if (s.scale <= 1.01) {
          if (!s.pinched && Math.abs(g.dx) > SWIPE && Math.abs(g.dx) > Math.abs(g.dy)) {
            setZoom(1, 0, 0, false);
            latest.current.onSwipe(g.dx < 0 ? 1 : -1);
            return;
          }
          setZoom(1, 0, 0, true);
        }
        if (!s.moved) {
          const now = clock();
          if (now - s.lastTap < 280) {
            s.lastTap = 0;
            if (s.scale > 1.01) setZoom(1, 0, 0, true);
            else setZoom(2.5, 0, 0, true);
          } else {
            s.lastTap = now;
            setTimeout(() => {
              if (st.current.lastTap === now) latest.current.onTap();
            }, 290);
          }
        }
      },
      onPanResponderTerminate: () => {
        st.current.startDist = 0;
        if (st.current.scale <= 1.01) setZoom(1, 0, 0, true);
      },
    });
  }, [anim]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} {...responder.panHandlers}>
      <Animated.View style={{ width, height, transform: [{ translateX: anim.x }, { translateY: anim.y }, { scale: anim.scale }] }}>
        {url ? (
          <Image source={{ uri: url, cacheKey: photo.path }} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={150} accessibilityLabel={photo.caption ?? 'Photo'} />
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * Photos shown full screen on black. Swipe between them, pinch or double tap to zoom,
 * tap to hide the captions. With slideshow on, they play by themselves.
 */
export function PhotoViewer({ photos, start, onClose, slideshow }: { photos: ViewerPhoto[]; start: number | null; onClose: () => void; slideshow?: boolean }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(start ?? 0);
  const [chrome, setChrome] = useState(true);
  const [playing, setPlaying] = useState(!!slideshow);
  const [fade] = useState(() => new Animated.Value(1));
  const [shown, setShown] = useState<number | null>(null);
  const open = start !== null && photos.length > 0;

  // Start where you tapped each time the viewer opens.
  if (open && shown !== start) {
    setShown(start);
    setIndex(Math.min(start, photos.length - 1));
    setPlaying(!!slideshow);
    setChrome(true);
  }
  if (!open && shown !== null) setShown(null);

  const go = (dir: 1 | -1) => {
    const next = (index + dir + photos.length) % photos.length;
    if (reduced) return setIndex(next);
    fade.setValue(0.2);
    setIndex(next);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  useEffect(() => {
    if (!open || !playing || photos.length < 2) return;
    const t = setInterval(() => goRef.current(1), 4000);
    return () => clearInterval(t);
  }, [open, playing, photos.length]);

  if (!open) return null;
  const photo = photos[Math.min(index, photos.length - 1)];

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <ZoomablePhoto
            key={`${photo.path}-${index}`}
            photo={photo}
            onSwipe={(dir) => {
              setPlaying(false);
              go(dir);
            }}
            onTap={() => setChrome((v) => !v)}
            onTouch={() => setPlaying(false)}
          />
        </Animated.View>
        {chrome && (
          <>
            <Row style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, justifyContent: 'space-between' }}>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name="close" color="#FFFFFF" />
              </Pressable>
              <Row gap={8}>
                {photos.length > 1 && (
                  <T variant="small" color="#FFFFFF" style={{ fontWeight: '700' }}>
                    {index + 1} of {photos.length}
                  </T>
                )}
                {photos.length > 1 && (
                  <Pressable
                    onPress={() => setPlaying((p) => !p)}
                    accessibilityRole="button"
                    accessibilityLabel={playing ? 'Pause slideshow' : 'Play slideshow'}
                    hitSlop={12}
                    style={{ height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                    <T variant="small" color="#FFFFFF" style={{ fontWeight: '700' }}>
                      {playing ? 'Pause' : 'Play'}
                    </T>
                  </Pressable>
                )}
              </Row>
            </Row>
            {(photo.caption || photo.note) && (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 24, backgroundColor: 'rgba(0,0,0,0.5)', gap: 4 }}>
                {photo.caption ? <T color="#FFFFFF" style={{ fontWeight: '600' }}>{photo.caption}</T> : null}
                {photo.note ? <T variant="small" color="rgba(255,255,255,0.8)">{photo.note}</T> : null}
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}
