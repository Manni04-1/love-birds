export type Profile = {
  id: string;
  name: string;
  couple_id: string | null;
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
