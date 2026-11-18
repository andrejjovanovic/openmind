import type { CardType, ColorName } from "./types";

/** The home page's state as it appears in the URL: the open brain (`b`) and its filters. */
export type MindParams = { b?: string; q?: string; tag?: string; type?: CardType; color?: ColorName; shuffle?: "1" };

export function mindHref(params: MindParams): string {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return search ? `/?${search}` : "/";
}
