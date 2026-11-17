import type { IdeaCategory } from '@/content/ideas';

export type BubbleStyle = 'hearts' | 'roses';

export type Profile = {
  id: string;
  name: string;
  couple_id: string | null;
  /** Chat bubble look: fuchsia with hearts, or thorny vines with roses. Null until chosen. */
  bubble?: BubbleStyle | null;
  /** Extra question decks switched on: 0 off, 1 flirty, 2 flirty and erotic. */
  heat?: number | null;
};

export type Couple = {
  id: string;
  invite_code: string | null;
  invite_expires_at: string | null;
  together_since: string | null;
};

export type Plan = {
  id: string;
  couple_id: string;
  title: string;
  /** YYYY-MM-DD */
  day: string;
  /** HH:MM:SS, or null for all day */
  time: string | null;
  note: string | null;
  remind: boolean;
  created_by: string;
  created_at: string;
};

export type Message = {
  id: string;
  couple_id: string;
  sender_id: string;
  body: string | null;
  image_path: string | null;
  hearted: boolean;
  read_at: string | null;
  created_at: string;
};

export type Memory = {
  id: string;
  couple_id: string;
  happened_on: string;
  caption: string;
  place: string | null;
  photo_path: string | null;
  created_by: string;
  created_at: string;
  memory_loves?: { user_id: string }[];
};

export type Question = { id: number; text: string };

export type Answer = {
  day: string;
  question_id: number;
  user_id: string;
  /** Null when it's your partner's answer and you haven't answered yet. */
  body: string | null;
  created_at: string;
};

export type DateIdea = {
  id: string;
  /** Set for built-in ideas. */
  slug: string | null;
  /** Set for ideas you two added. */
  couple_id: string | null;
  title: string;
  details: string | null;
  category: IdeaCategory;
  /** 0 free to 3 splurge, or null for your own ideas. */
  cost: number | null;
  created_by: string | null;
  created_at: string;
};

export type DateMatch = {
  couple_id: string;
  idea_id: string;
  matched_at: string;
  event_id: string | null;
  memory_id: string | null;
  done_on: string | null;
  date_ideas: DateIdea | null;
  events: Pick<Plan, 'id' | 'day' | 'time'> | null;
};

/** One question in a game, from get_game_answers(). Your partner's picks stay null until you've answered. */
export type GameAnswer = {
  question_key: string;
  my_choice: number | null;
  my_guess: number | null;
  partner_answered: boolean;
  partner_choice: number | null;
  partner_guess: number | null;
};
