/** What you can decide together tonight. Keys are saved with your swipes, so never change one. */
export type TonightKind = 'eat' | 'watch' | 'do';

export type TonightOption = { key: string; emoji: string; label: string };

export const TONIGHT_KINDS: { kind: TonightKind; emoji: string; title: string; question: string }[] = [
  { kind: 'eat', emoji: '🍽️', title: 'What to eat', question: 'What should we eat tonight?' },
  { kind: 'watch', emoji: '🍿', title: 'What to watch', question: 'What should we watch tonight?' },
  { kind: 'do', emoji: '✨', title: 'What to do', question: 'What should we do tonight?' },
];

export const TONIGHT_OPTIONS: Record<TonightKind, TonightOption[]> = {
  eat: [
    { key: 'nyama-choma', emoji: '🍖', label: 'Nyama choma' },
    { key: 'pizza', emoji: '🍕', label: 'Pizza' },
    { key: 'pilau', emoji: '🍚', label: 'Pilau' },
    { key: 'chapati-beans', emoji: '🫓', label: 'Chapati and beans' },
    { key: 'burgers', emoji: '🍔', label: 'Burgers' },
    { key: 'indian', emoji: '🍛', label: 'Indian curry' },
    { key: 'chinese', emoji: '🥡', label: 'Chinese takeaway' },
    { key: 'sushi', emoji: '🍣', label: 'Sushi' },
    { key: 'ethiopian', emoji: '🥘', label: 'Ethiopian' },
    { key: 'swahili', emoji: '🥥', label: 'Swahili food' },
    { key: 'chips-chicken', emoji: '🍗', label: 'Chips and chicken' },
    { key: 'pasta', emoji: '🍝', label: 'Pasta' },
    { key: 'tacos', emoji: '🌮', label: 'Tacos' },
    { key: 'ugali-sukuma', emoji: '🥬', label: 'Ugali, sukuma and fish' },
    { key: 'street-food', emoji: '🌽', label: 'Street food' },
    { key: 'breakfast-dinner', emoji: '🥞', label: 'Breakfast for dinner' },
    { key: 'cook-together', emoji: '👩‍🍳', label: 'Cook something together' },
    { key: 'leftovers', emoji: '🍲', label: 'Leftovers and a film' },
  ],
  watch: [
    { key: 'romcom', emoji: '💘', label: 'A romcom' },
    { key: 'action', emoji: '💥', label: 'Something with explosions' },
    { key: 'comedy', emoji: '😂', label: 'A comedy' },
    { key: 'horror', emoji: '👻', label: 'A scary one' },
    { key: 'thriller', emoji: '🕵️', label: 'A thriller' },
    { key: 'drama', emoji: '🎭', label: 'A good drama' },
    { key: 'animated', emoji: '🧸', label: 'An animated film' },
    { key: 'documentary', emoji: '🌍', label: 'A documentary' },
    { key: 'series', emoji: '📺', label: 'Our series' },
    { key: 'reality', emoji: '💅', label: 'Reality TV' },
    { key: 'nollywood', emoji: '🎬', label: 'Nollywood or Kenyan film' },
    { key: 'old-favourite', emoji: '⭐', label: 'An old favourite' },
    { key: 'youtube', emoji: '▶️', label: 'YouTube rabbit hole' },
    { key: 'anime', emoji: '🐉', label: 'Anime' },
  ],
  do: [
    { key: 'walk', emoji: '🌇', label: 'An evening walk' },
    { key: 'games', emoji: '🎲', label: 'Game night' },
    { key: 'cook', emoji: '🍳', label: 'Cook together' },
    { key: 'dance', emoji: '💃', label: 'Dance in the kitchen' },
    { key: 'spa', emoji: '🛁', label: 'Spa night' },
    { key: 'drinks', emoji: '🍹', label: 'Go out for drinks' },
    { key: 'live-game', emoji: '🎮', label: 'Play a live game in the app' },
    { key: 'deep-talk', emoji: '💬', label: 'A deep talk' },
    { key: 'stargaze', emoji: '🌌', label: 'Stargaze' },
    { key: 'karaoke', emoji: '🎤', label: 'Karaoke' },
    { key: 'early-night', emoji: '😴', label: 'An early night together' },
    { key: 'photos', emoji: '📸', label: 'Look through old photos' },
    { key: 'massage', emoji: '💆', label: 'Massages' },
    { key: 'plan-trip', emoji: '🗺️', label: 'Plan our next trip' },
  ],
};

export function tonightKind(kind: string) {
  return TONIGHT_KINDS.find((k) => k.kind === kind) ?? TONIGHT_KINDS[0];
}
