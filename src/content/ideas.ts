/** How date ideas are grouped. The built-in ideas themselves live in supabase/together.sql. */

export type IdeaCategory = 'home' | 'out' | 'adventure' | 'romantic' | 'nairobi' | 'ours';

export const CATEGORIES: { category: IdeaCategory; label: string; emoji: string }[] = [
  { category: 'home', label: 'At home', emoji: '🏡' },
  { category: 'out', label: 'Going out', emoji: '🍽️' },
  { category: 'adventure', label: 'Adventure', emoji: '🧗' },
  { category: 'romantic', label: 'Romantic', emoji: '🌹' },
  { category: 'nairobi', label: 'Nairobi', emoji: '🦒' },
  { category: 'ours', label: 'Our ideas', emoji: '💌' },
];

export function categoryInfo(category: string) {
  return CATEGORIES.find((c) => c.category === category) ?? CATEGORIES[0];
}

const COSTS = ['Free', 'Low cost', 'Mid-range', 'Splurge'];

export function costLabel(cost: number | null): string | null {
  return cost == null ? null : (COSTS[cost] ?? null);
}
