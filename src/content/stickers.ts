import { ANIMALS } from './animals';

/** Sticker captions. A sticker is saved as animal:caption, so never change a key. */
export const STICKER_CAPTIONS: { key: string; text: string; extra: string }[] = [
  { key: 'miss-you', text: 'Miss you!', extra: '🥺' },
  { key: 'love-you', text: 'Love you', extra: '❤️' },
  { key: 'good-morning', text: 'Good morning', extra: '☀️' },
  { key: 'good-night', text: 'Good night', extra: '🌙' },
  { key: 'hugs', text: 'Hugs', extra: '🤗' },
  { key: 'kisses', text: 'Kisses', extra: '💋' },
  { key: 'sorry', text: 'Sorry…', extra: '🥀' },
  { key: 'proud-of-you', text: 'Proud of you', extra: '🏆' },
  { key: 'on-my-way', text: 'On my way', extra: '🏃' },
  { key: 'hungry', text: 'Hungry!', extra: '🍕' },
  { key: 'thinking-of-you', text: 'Thinking of you', extra: '💭' },
  { key: 'yay', text: 'Yay!', extra: '🎉' },
  { key: 'busy', text: 'Busy, talk soon', extra: '💼' },
  { key: 'come-home', text: 'Come home', extra: '🏠' },
  { key: 'you-got-this', text: 'You got this', extra: '💪' },
  { key: 'hehe', text: 'Hehe', extra: '😜' },
];

export type ParsedSticker = { animal: string; emoji: string; text: string; extra: string };

/** Reads a saved sticker such as lion:miss-you. Unknown parts fall back gently. */
export function parseSticker(sticker: string | null | undefined): ParsedSticker | null {
  if (!sticker) return null;
  const [animal, caption] = sticker.split(':');
  const a = ANIMALS.find((x) => x.key === animal);
  const cap = STICKER_CAPTIONS.find((x) => x.key === caption);
  return {
    animal,
    emoji: a?.emoji ?? '🦜',
    text: cap?.text ?? (caption ? caption.replace(/-/g, ' ') : ''),
    extra: cap?.extra ?? '💕',
  };
}
