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
  /** App theme: rose, steampunk, meadow, serengeti, diani or starry. */
  theme?: string | null;
  /** YYYY-MM-DD */
  birthday?: string | null;
  /** The animal that stands for you, from src/content/animals.ts. Null shows your initial. */
  animal?: string | null;
  /** classic, playful or handwritten. */
  font?: string | null;
  /** What you call your partner in the app, such as "Babe". */
  partner_nickname?: string | null;
  /** Set on your partner's profile only: their own name, when you've given them a pet name. */
  real_name?: string;
  /** Notifications say "New message" instead of showing what your partner wrote. */
  private_notifications?: boolean | null;
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
  /** The last day of a plan that lasts several days. Missing until calendar.sql has run. */
  end_day?: string | null;
  /** daily, weekly, fortnightly, monthly or yearly. */
  repeats?: string | null;
  /** The last day a repeating plan can start. */
  repeat_until?: string | null;
  /** Start days of times that were skipped. */
  skip_days?: string[] | null;
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
  /** The message this one answers. */
  reply_to?: string | null;
  /** Set when the message waits to be delivered later. */
  deliver_at?: string | null;
  delivered_at?: string | null;
  edited_at?: string | null;
  unsent_at?: string | null;
  audio_path?: string | null;
  audio_ms?: number | null;
  /** An animal sticker, such as lion:miss-you. */
  sticker?: string | null;
};

/** One person's reaction to a message. A null emoji means it was taken back. */
export type Reaction = { message_id: string; user_id: string; emoji: string | null; updated_at: string };

/**
 * An open-when letter. The body (and photo) are null for a letter to you that you haven't opened yet.
 * A time capsule has an unlock_at and can't be opened before then.
 */
export type Letter = {
  id: string;
  from_user: string;
  occasion: string;
  body: string | null;
  opened_at: string | null;
  created_at: string;
  unlock_at?: string | null;
  photo_path?: string | null;
};

export type BucketItem = {
  id: string;
  couple_id: string;
  title: string;
  emoji: string | null;
  created_by: string;
  done_on: string | null;
  memory_id: string | null;
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
  /** Set once the answer has been changed (it can be changed once). */
  edited_at?: string | null;
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

/** Tonight: the latest thing you're deciding together, from get_tonight(). */
export type Decider = {
  id: string;
  kind: 'eat' | 'watch' | 'do';
  options: { key: string; emoji: string; label: string }[];
  created_by: string;
  /** Who has swiped through every option. */
  done_by: string[];
  winner: string | null;
  decided_at: string | null;
  created_at: string;
  /** Your own swipes: option key to liked. */
  mine: Record<string, boolean>;
};

export type ListName = 'groceries' | 'todo' | 'watch';

export type ListItem = {
  id: string;
  couple_id: string;
  list: ListName;
  text: string;
  done_at: string | null;
  done_by: string | null;
  created_by: string;
  created_at: string;
};

export type HomeSafe = { id: number; from_user: string; kind: 'ask' | 'safe'; created_at: string };

export type Wish = {
  id: string;
  couple_id: string;
  user_id: string;
  title: string;
  emoji: string | null;
  note: string | null;
  link: string | null;
  received_on: string | null;
  created_at: string;
};

export type Milestone = {
  id: string;
  couple_id: string;
  title: string;
  emoji: string | null;
  /** YYYY-MM-DD */
  happened_on: string;
  note: string | null;
  yearly: boolean;
  created_by: string;
  created_at: string;
};

export type Coupon = {
  id: string;
  couple_id: string;
  from_user: string;
  title: string;
  emoji: string | null;
  note: string | null;
  redeemed_at: string | null;
  done_at: string | null;
  created_at: string;
};

export type Fund = {
  id: string;
  couple_id: string;
  title: string;
  emoji: string | null;
  /** Kenyan shillings. */
  target: number;
  bucket_item: string | null;
  reached_at: string | null;
  created_by: string;
  created_at: string;
};

export type FundEntry = { id: string; fund_id: string; user_id: string; amount: number; note: string | null; created_at: string };
