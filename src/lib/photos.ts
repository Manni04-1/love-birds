import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageManipulatorContext, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { whileAway } from './lock';
import { supabase } from './supabase';

export type PickedPhoto = { uri: string; mimeType: string };

/** A photo picked for the chat but not sent yet: it can still be cropped or rotated. */
export type DraftPhoto = PickedPhoto & { id: string; width: number; height: number };

// Photos go up with their long side at most this many pixels: sharp enough to fill a phone
// screen or print a 6×4, and about five times smaller than a camera's full size.
const LONGEST = 2048;
const QUALITY = 0.75;

const web = Platform.OS === 'web';

/** A smaller JPEG copy of a picked photo, or the photo as it is if it can't be made smaller. */
async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto & { width: number; height: number }> {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const asIs = { uri: asset.uri, mimeType, width: asset.width, height: asset.height };
  // A GIF would lose its animation.
  if (mimeType === 'image/gif') return asIs;
  let context: ImageManipulatorContext | undefined;
  let image: ImageRef | undefined;
  try {
    // Big photos are scaled down while they're read, so the full size never sits in memory.
    context = ImageManipulator.manipulate(asset.uri, { maxWidth: LONGEST, maxHeight: LONGEST });
    image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: 'image/jpeg', width: saved.width, height: saved.height };
  } catch {
    return asIs;
  } finally {
    image?.release();
    context?.release();
  }
}

/** How many photos you can send at once. */
export const MAX_PHOTOS = 10;

let draftCount = 0;

/**
 * Opens the photo library to pick up to `limit` photos, in the order you tap them. Each comes back already
 * made smaller, ready to crop or send. An empty list if the person cancels.
 */
export async function pickPhotos(limit = MAX_PHOTOS): Promise<DraftPhoto[]> {
  const result = await whileAway(() =>
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: limit > 1, selectionLimit: limit, orderedSelection: true }),
  );
  if (result.canceled) return [];
  const picked = await Promise.all(result.assets.slice(0, limit).map(shrink));
  return picked.map((p) => ({ ...p, id: `draft-${Date.now()}-${draftCount++}` }));
}

/** Rotates a photo a quarter turn clockwise, or crops it to a rectangle in its own pixels. */
export async function editPhoto(photo: DraftPhoto, change: { rotate: 90 } | { crop: { originX: number; originY: number; width: number; height: number } }): Promise<DraftPhoto> {
  const context = ImageManipulator.manipulate(photo.uri);
  let image: ImageRef | undefined;
  try {
    if ('rotate' in change) context.rotate(change.rotate);
    else context.crop(change.crop);
    image = await context.renderAsync();
    // Edits are saved at a high quality, so cropping and rotating a few times doesn't blur the photo.
    const saved = await image.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
    return { ...photo, uri: saved.uri, mimeType: 'image/jpeg', width: saved.width, height: saved.height };
  } finally {
    image?.release();
    context.release();
  }
}

async function toPicked(result: ImagePicker.ImagePickerResult): Promise<PickedPhoto | null> {
  if (result.canceled || !result.assets[0]) return null;
  return shrink(result.assets[0]);
}

/** Opens the phone's photo library. Returns null if the person cancels. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await whileAway(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 }));
  return toPicked(result);
}

/** Opens the camera. Returns null if the person cancels, or throws if the camera isn't allowed. */
export async function takePhoto(): Promise<PickedPhoto | null> {
  const perm = await whileAway(() => ImagePicker.requestCameraPermissionsAsync());
  if (!perm.granted) {
    throw new Error(perm.canAskAgain ? 'Allow the camera to take a photo.' : 'The camera is turned off for Love Birds. Turn it on in your phone\'s settings.');
  }
  const result = await whileAway(() => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }));
  return toPicked(result);
}

/** Uploads into the couple's private folder and returns the storage path. */
export async function uploadPhoto(coupleId: string, photo: PickedPhoto): Promise<string> {
  const ext = photo.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${coupleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const data = web ? await (await fetch(photo.uri)).arrayBuffer() : await new File(photo.uri).arrayBuffer();
  const { error } = await supabase.storage.from('photos').upload(path, data, { contentType: photo.mimeType });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; expires: number }>();

/** A short-lived link to a private photo or voice note, cached for the session. Null when offline. */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('photos').createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

/** A short-lived link to a private photo, cached for the session. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [fetched, setFetched] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now()) return;
    let active = true;
    signedUrl(path).then((url) => {
      if (url && active) setFetched({ path, url });
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return null;
  if (fetched?.path === path) return fetched.url;
  return cache.get(path)?.url ?? null;
}

/** Saves a copy of a private photo to the phone's gallery. Throws a sentence a person can act on. */
export async function savePhoto(path: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Saving photos works in the app on your phone.');
  // Only asks to add photos, not to see the ones already on the phone.
  const perm = await whileAway(() => requestPermissionsAsync(true, ['photo']));
  if (!perm.granted) {
    throw new Error(perm.canAskAgain ? 'Allow Love Birds to save photos to your phone.' : 'Saving photos is off for Love Birds. Turn it on in your phone\'s settings.');
  }
  const url = await signedUrl(path);
  if (!url) throw new Error('No connection. Check your internet and try again.');
  const name = path.split('/').pop() ?? `${Date.now()}.jpg`;
  const file = await File.downloadFileAsync(url, new File(Paths.cache, `love-birds-${name}`), { idempotent: true });
  try {
    await Asset.create(file.uri);
  } finally {
    try {
      file.delete();
    } catch {
      // The phone clears its cache folder by itself in the end.
    }
  }
}
