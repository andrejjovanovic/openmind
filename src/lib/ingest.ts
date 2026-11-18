import "server-only";
import * as cheerio from "cheerio";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { UPLOAD_DIR, createCard, type NewCard } from "./db";
import { suggest } from "./ai";
import type { Card, ColorName } from "./types";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 (compatible; OpenMind/0.1; +https://github.com/openmind)";

function colorName(r: number, g: number, b: number): ColorName {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.12) return "black";
  if (s < 0.12) return l > 0.85 ? "white" : l < 0.25 ? "black" : "gray";
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 15 && h < 50 && (l < 0.4 || s < 0.45)) return "brown";
  if (h < 15) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  if (h < 345) return "pink";
  return "red";
}

type StoredImage = Pick<NewCard, "image" | "image_w" | "image_h" | "color" | "color_name"> & {
  /** Small JPEG for the optional AI tagger. */
  preview: Buffer;
};

/** Normalise an image to WebP in the uploads dir and read its size and dominant colour. */
export async function storeImage(input: Buffer): Promise<StoredImage> {
  const { data, info } = await sharp(input, { animated: true })
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const { dominant } = await sharp(data).stats();
  const preview = await sharp(data).resize({ width: 768, withoutEnlargement: true }).jpeg().toBuffer();
  const image = `${randomUUID()}.webp`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, image), data);
  const hex = [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return {
    image,
    image_w: info.width,
    // Animated images report the height of all frames stacked.
    image_h: info.pageHeight ?? info.height,
    color: `#${hex}`,
    color_name: colorName(dominant.r, dominant.g, dominant.b),
    preview,
  };
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
    return v6 === "::1" || v6 === "::" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * fetch() for user-supplied URLs: http(s) only, bounded time, and no requests to
 * private or loopback addresses (checked on every redirect hop) unless
 * OPENMIND_ALLOW_PRIVATE_URLS is set.
 */
async function safeFetch(input: string): Promise<Response> {
  let url = new URL(input);
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs can be saved");
    if (!process.env.OPENMIND_ALLOW_PRIVATE_URLS) {
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
      if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("That address is not reachable");
    }
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": USER_AGENT, accept: "text/html,image/*;q=0.9,*/*;q=0.5" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

async function readBody(res: Response, limit: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchImage(url: string): Promise<StoredImage | null> {
  try {
    const res = await safeFetch(url);
    if (!res.ok) return null;
    return await storeImage(await readBody(res, MAX_IMAGE_BYTES));
  } catch {
    return null;
  }
}

export function parseUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : null;
  return candidate && URL.canParse(candidate) ? candidate : null;
}

/** Tags from the optional AI pass are merged in; failures never block a save. */
async function withSuggestions(card: NewCard, preview?: Buffer): Promise<NewCard> {
  const s = await suggest({ ...card, preview });
  if (!s) return card;
  return {
    ...card,
    title: card.title || s.title,
    description: card.description || s.summary,
    tags: [...(card.tags ?? []), ...s.tags],
  };
}

export async function saveNote(brain_id: string, text: string): Promise<Card> {
  return createCard(await withSuggestions({ brain_id, type: "note", content: text }));
}

export async function saveImage(brain_id: string, data: Buffer, filename?: string): Promise<Card> {
  const { preview, ...stored } = await storeImage(data);
  const title = filename ? filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") : "";
  return createCard(await withSuggestions({ brain_id, type: "image", title, ...stored }, preview));
}

export async function saveLink(brain_id: string, url: string): Promise<Card> {
  const host = new URL(url).hostname.replace(/^www\./, "");
  let res: Response;
  try {
    res = await safeFetch(url);
  } catch {
    // Unreachable pages are still worth keeping as a bare bookmark.
    return createCard({ brain_id, type: "link", url, site: host, title: url });
  }
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.startsWith("image/")) {
    const { preview, ...stored } = await storeImage(await readBody(res, MAX_IMAGE_BYTES));
    return createCard(await withSuggestions({ brain_id, type: "image", url, site: host, ...stored }, preview));
  }
  if (!res.ok || !contentType.includes("html")) {
    return createCard({ brain_id, type: "link", url, site: host, title: url });
  }

  const $ = cheerio.load((await readBody(res, MAX_HTML_BYTES)).toString("utf8"));
  const meta = (...names: string[]) => {
    for (const name of names) {
      const value = $(`meta[property="${name}"], meta[name="${name}"]`).attr("content")?.trim();
      if (value) return value;
    }
    return "";
  };
  const imageUrl = meta("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src");
  const stored = imageUrl ? await fetchImage(new URL(imageUrl, res.url || url).href) : null;
  const { preview, ...image } = stored ?? { preview: undefined };
  const keywords = meta("keywords", "article:tag")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && k.length <= 30)
    .slice(0, 5);

  return createCard(
    await withSuggestions(
      {
        brain_id,
        type: "link",
        url,
        site: meta("og:site_name") || host,
        title: meta("og:title", "twitter:title") || $("title").first().text().trim() || url,
        description: meta("og:description", "description", "twitter:description").slice(0, 600),
        tags: keywords,
        ...image,
      },
      preview,
    ),
  );
}

export async function saveText(brainId: string, text: string): Promise<Card> {
  const url = parseUrl(text);
  return url ? saveLink(brainId, url) : saveNote(brainId, text.trim());
}
