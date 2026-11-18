export const CARD_TYPES = ["note", "link", "image"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const COLORS = {
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#f5d90a",
  green: "#30a46c",
  teal: "#12a594",
  blue: "#3e63dd",
  purple: "#8e4ec6",
  pink: "#e93d82",
  brown: "#8d6e4f",
  black: "#1b1b1b",
  gray: "#8b8d98",
  white: "#f4f4f4",
} as const;
export type ColorName = keyof typeof COLORS;

export type User = { id: string; email: string };

/** A separate library of cards; every user has at least one. */
export type Brain = { id: string; name: string };

export type Card = {
  id: string;
  brain_id: string;
  type: CardType;
  title: string;
  /** Note text. */
  content: string;
  url: string | null;
  site: string | null;
  description: string;
  /** Filename under the uploads dir, served from /files/<image>. */
  image: string | null;
  image_w: number | null;
  image_h: number | null;
  /** Dominant colour of the image as hex, and its nearest named bucket. */
  color: string | null;
  color_name: ColorName | null;
  /** The user's own annotation. */
  note: string;
  created_at: number;
  tags: string[];
};
