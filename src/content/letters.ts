/** Ready-made occasions for open-when letters. You can also write your own. */
export const OCCASIONS: { emoji: string; text: string }[] = [
  { emoji: '🥺', text: 'Open when you miss me' },
  { emoji: '🌙', text: "Open when you can't sleep" },
  { emoji: '🌧️', text: 'Open when you feel sad' },
  { emoji: '😂', text: 'Open when you need a laugh' },
  { emoji: '😤', text: "Open when we've had a fight" },
  { emoji: '💪', text: 'Open when you need courage' },
  { emoji: '😩', text: "Open when you've had a long day" },
  { emoji: '🎂', text: "Open when it's your birthday" },
  { emoji: '🥂', text: 'Open when we celebrate something' },
  { emoji: '🤔', text: 'Open when you doubt us' },
];

export function occasionEmoji(occasion: string): string {
  return OCCASIONS.find((o) => o.text === occasion)?.emoji ?? '💌';
}
