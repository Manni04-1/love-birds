import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export type PickedPhoto = { uri: string; base64: string; mimeType: string };

/** Opens the phone's photo library. Returns null if the person cancels. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.base64) return null;
  return { uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/** Uploads into the couple's private folder and returns the storage path. */
export async function uploadPhoto(coupleId: string, photo: PickedPhoto): Promise<string> {
  const ext = photo.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${coupleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, decode(photo.base64), {
    contentType: photo.mimeType,
  });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; expires: number }>();

/** A short-lived link to a private photo, cached for the session. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [fetched, setFetched] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now()) return;
    let active = true;
    supabase.storage
      .from('photos')
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        cache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
        if (active) setFetched({ path, url: data.signedUrl });
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return null;
  if (fetched?.path === path) return fetched.url;
  return cache.get(path)?.url ?? null;
}
