import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Glyph, Row, T } from '@/components/ui';
import { editPhoto, type DraftPhoto } from '@/lib/photos';
import { radius, space, useColors } from '@/lib/theme';

type Rect = { x: number; y: number; w: number; h: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Drag = { mode: 'move' } | { mode: 'corner'; corner: Corner };

const SHAPES: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: 'Square', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
];

/** The smallest crop box, on screen. */
const MIN = 48;
/** How close to a corner a touch has to start to resize from it. */
const GRAB = 36;
/** Dark tint over the part of the photo that will be cut off. */
const SHADE = 'rgba(0,0,0,0.55)';

/** The biggest box of this shape that fits the photo, centred. */
function fullRect(w: number, h: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w, h };
  const bw = Math.min(w, h * ratio);
  const bh = bw / ratio;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

/** Moves one corner of `start` by (dx, dy), keeping the opposite corner still, the box inside the photo, and its shape. */
function dragCorner(start: Rect, corner: Corner, dx: number, dy: number, W: number, H: number, ratio: number | null): Rect {
  const left = corner === 'tl' || corner === 'bl';
  const top = corner === 'tl' || corner === 'tr';
  // The corner that stays put.
  const ax = left ? start.x + start.w : start.x;
  const ay = top ? start.y + start.h : start.y;
  // How much room there is from the fixed corner to the photo's edge, in each direction.
  const roomW = left ? ax : W - ax;
  const roomH = top ? ay : H - ay;
  let w = Math.min(roomW, Math.max(MIN, start.w + (left ? -dx : dx)));
  let h = Math.min(roomH, Math.max(MIN, start.h + (top ? -dy : dy)));
  if (ratio) {
    // Follow whichever way the finger moved further, then fit it in the room there is.
    if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
    if (w > roomW) {
      w = roomW;
      h = w / ratio;
    }
    if (h > roomH) {
      h = roomH;
      w = h * ratio;
    }
  }
  return { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
}

/**
 * Full-screen crop and rotate for a photo before it's sent. Drag inside the box to move it, drag a corner
 * to resize it, pick a shape, or rotate a quarter turn. Done hands back the edited copy.
 */
export function PhotoEditor({ photo, onDone, onClose }: { photo: DraftPhoto | null; onDone: (photo: DraftPhoto) => void; onClose: () => void }) {
  return (
    <Modal visible={!!photo} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {photo ? <Editor key={photo.id + photo.uri} start={photo} onDone={onDone} onClose={onClose} /> : null}
    </Modal>
  );
}

function Editor({ start, onDone, onClose }: { start: DraftPhoto; onDone: (photo: DraftPhoto) => void; onClose: () => void }) {
  const c = useColors();
  const [photo, setPhoto] = useState(start);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The photo, fitted inside the space it has on screen.
  const scale = box ? Math.min(box.w / photo.width, box.h / photo.height) : 0;
  const shown = { w: photo.width * scale, h: photo.height * scale };
  const crop = rect ?? fullRect(shown.w, shown.h, ratio);

  // What the drag handlers need, kept current outside of rendering.
  const live = useRef({ crop, shown, ratio });
  useEffect(() => {
    live.current = { crop, shown, ratio };
  });
  const drag = useRef<{ how: Drag; from: Rect } | null>(null);

  // The gesture handlers read `live` and `drag` only while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { crop: r } = live.current;
        const { locationX: px, locationY: py } = e.nativeEvent;
        const near = (x: number, y: number) => Math.abs(px - x) < GRAB && Math.abs(py - y) < GRAB;
        let how: Drag | null = null;
        if (near(r.x, r.y)) how = { mode: 'corner', corner: 'tl' };
        else if (near(r.x + r.w, r.y)) how = { mode: 'corner', corner: 'tr' };
        else if (near(r.x, r.y + r.h)) how = { mode: 'corner', corner: 'bl' };
        else if (near(r.x + r.w, r.y + r.h)) how = { mode: 'corner', corner: 'br' };
        else if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) how = { mode: 'move' };
        drag.current = how ? { how, from: r } : null;
      },
      onPanResponderMove: (_e, g) => {
        const d = drag.current;
        if (!d) return;
        const { shown: s, ratio: q } = live.current;
        if (d.how.mode === 'move') {
          const x = Math.min(s.w - d.from.w, Math.max(0, d.from.x + g.dx));
          const y = Math.min(s.h - d.from.h, Math.max(0, d.from.y + g.dy));
          setRect({ ...d.from, x, y });
        } else {
          setRect(dragCorner(d.from, d.how.corner, g.dx, g.dy, s.w, s.h, q));
        }
      },
      onPanResponderRelease: () => {
        drag.current = null;
      },
      onPanResponderTerminate: () => {
        drag.current = null;
      },
    }),
  );

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
    setRect(null);
  }

  async function rotate() {
    setBusy(true);
    setError('');
    try {
      setPhoto(await editPhoto(photo, { rotate: 90 }));
      setRect(null);
    } catch {
      setError("Couldn't rotate this photo.");
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    const whole = Math.abs(crop.w - shown.w) < 1 && Math.abs(crop.h - shown.h) < 1;
    if (whole || !scale) return onDone(photo);
    setBusy(true);
    setError('');
    try {
      const k = 1 / scale;
      const originX = Math.max(0, Math.round(crop.x * k));
      const originY = Math.max(0, Math.round(crop.y * k));
      const width = Math.min(photo.width - originX, Math.round(crop.w * k));
      const height = Math.min(photo.height - originY, Math.round(crop.h * k));
      onDone(await editPhoto(photo, { crop: { originX, originY, width, height } }));
    } catch {
      setError("Couldn't crop this photo.");
      setBusy(false);
    }
  }

  const edited = photo.uri !== start.uri || !!rect || !!ratio;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0B0D' }}>
      <Row
        style={{
          justifyContent: 'space-between',
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
        }}>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10} style={{ padding: space.sm }}>
          <T color="#FFFFFF">Cancel</T>
        </Pressable>
        <T variant="strong" color="#FFFFFF">
          Crop and rotate
        </T>
        <Pressable onPress={done} disabled={busy} accessibilityRole="button" hitSlop={10} style={{ padding: space.sm }}>
          <T color={c.accent} style={{ fontWeight: '800' }}>
            Done
          </T>
        </Pressable>
      </Row>

      <View style={{ flex: 1, margin: space.lg }} onLayout={onLayout}>
        {box && scale ? (
          <View
            style={{
              position: 'absolute',
              left: (box.w - shown.w) / 2,
              top: (box.h - shown.h) / 2,
              width: shown.w,
              height: shown.h,
            }}
            {...pan.panHandlers}>
            <Image source={{ uri: photo.uri }} style={{ width: shown.w, height: shown.h }} contentFit="fill" pointerEvents="none" />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                right: 0,
                height: crop.y,
                backgroundColor: SHADE,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: crop.y + crop.h,
                right: 0,
                bottom: 0,
                backgroundColor: SHADE,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: crop.y,
                width: crop.x,
                height: crop.h,
                backgroundColor: SHADE,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: crop.x + crop.w,
                top: crop.y,
                right: 0,
                height: crop.h,
                backgroundColor: SHADE,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
                borderWidth: 1.5,
                borderColor: '#FFFFFF',
              }}>
              {/* Thirds, to help line things up. */}
              {[1, 2].map((i) => (
                <View
                  key={`v${i}`}
                  style={{
                    position: 'absolute',
                    left: (crop.w * i) / 3,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: 'rgba(255,255,255,0.45)',
                  }}
                />
              ))}
              {[1, 2].map((i) => (
                <View
                  key={`h${i}`}
                  style={{
                    position: 'absolute',
                    top: (crop.h * i) / 3,
                    left: 0,
                    right: 0,
                    height: 1,
                    backgroundColor: 'rgba(255,255,255,0.45)',
                  }}
                />
              ))}
              {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
                <View
                  key={k}
                  style={{
                    position: 'absolute',
                    width: 22,
                    height: 22,
                    borderColor: '#FFFFFF',
                    left: k === 'tl' || k === 'bl' ? -3 : undefined,
                    right: k === 'tr' || k === 'br' ? -3 : undefined,
                    top: k === 'tl' || k === 'tr' ? -3 : undefined,
                    bottom: k === 'bl' || k === 'br' ? -3 : undefined,
                    borderLeftWidth: k === 'tl' || k === 'bl' ? 4 : 0,
                    borderRightWidth: k === 'tr' || k === 'br' ? 4 : 0,
                    borderTopWidth: k === 'tl' || k === 'tr' ? 4 : 0,
                    borderBottomWidth: k === 'bl' || k === 'br' ? 4 : 0,
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
        {busy && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        )}
      </View>

      {error ? (
        <T variant="small" color="#FF8A8A" style={{ textAlign: 'center' }}>
          {error}
        </T>
      ) : null}
      <View
        style={{
          paddingHorizontal: space.lg,
          paddingBottom: space.lg,
          gap: space.md,
        }}>
        <Row gap={space.sm} style={{ justifyContent: 'center' }}>
          {SHAPES.map((s) => {
            const on = ratio === s.ratio;
            return (
              <Pressable
                key={s.label}
                onPress={() => {
                  setRatio(s.ratio);
                  setRect(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                }}>
                <T variant="small" color={on ? '#0B0B0D' : '#FFFFFF'} style={{ fontWeight: '700' }}>
                  {s.label}
                </T>
              </Pressable>
            );
          })}
        </Row>
        <Row gap={space.sm} style={{ justifyContent: 'center' }}>
          <Pressable
            onPress={rotate}
            disabled={busy}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: radius.pill,
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}>
            <Glyph name="rotate" color="#FFFFFF" size={18} />
            <T variant="small" color="#FFFFFF" style={{ fontWeight: '700' }}>
              Rotate
            </T>
          </Pressable>
          {edited && (
            <Pressable
              onPress={() => {
                setPhoto(start);
                setRatio(null);
                setRect(null);
              }}
              disabled={busy}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(255,255,255,0.12)',
              }}>
              <T variant="small" color="#FFFFFF" style={{ fontWeight: '700' }}>
                Start over
              </T>
            </Pressable>
          )}
        </Row>
      </View>
    </SafeAreaView>
  );
}
