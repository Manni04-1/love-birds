/** Animals you can pick to stand for you. Keys are saved on your profile, so never change one. */
export const ANIMALS: { key: string; emoji: string; label: string }[] = [
  { key: 'lion', emoji: '🦁', label: 'Lion' },
  { key: 'giraffe', emoji: '🦒', label: 'Giraffe' },
  { key: 'elephant', emoji: '🐘', label: 'Elephant' },
  { key: 'flamingo', emoji: '🦩', label: 'Flamingo' },
  { key: 'cheetah', emoji: '🐆', label: 'Cheetah' },
  { key: 'zebra', emoji: '🦓', label: 'Zebra' },
  { key: 'love-bird', emoji: '🦜', label: 'Love bird' },
  { key: 'hippo', emoji: '🦛', label: 'Hippo' },
  { key: 'rhino', emoji: '🦏', label: 'Rhino' },
  { key: 'monkey', emoji: '🐒', label: 'Monkey' },
  { key: 'tiger', emoji: '🐯', label: 'Tiger' },
  { key: 'bear', emoji: '🐻', label: 'Bear' },
  { key: 'panda', emoji: '🐼', label: 'Panda' },
  { key: 'koala', emoji: '🐨', label: 'Koala' },
  { key: 'kangaroo', emoji: '🦘', label: 'Kangaroo' },
  { key: 'fox', emoji: '🦊', label: 'Fox' },
  { key: 'bunny', emoji: '🐰', label: 'Bunny' },
  { key: 'cat', emoji: '🐱', label: 'Cat' },
  { key: 'dog', emoji: '🐶', label: 'Dog' },
  { key: 'owl', emoji: '🦉', label: 'Owl' },
  { key: 'swan', emoji: '🦢', label: 'Swan' },
  { key: 'penguin', emoji: '🐧', label: 'Penguin' },
  { key: 'dolphin', emoji: '🐬', label: 'Dolphin' },
  { key: 'turtle', emoji: '🐢', label: 'Turtle' },
  { key: 'butterfly', emoji: '🦋', label: 'Butterfly' },
  { key: 'bee', emoji: '🐝', label: 'Bee' },
  { key: 'unicorn', emoji: '🦄', label: 'Unicorn' },
];

export function animalEmoji(key: string | null | undefined): string | null {
  return ANIMALS.find((a) => a.key === key)?.emoji ?? null;
}
