import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { COLORS, type Brain, type Card, type CardType, type ColorName, type User } from "./types";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.OPENMIND_DATA_DIR ?? "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS brains (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS brains_user ON brains(user_id, created_at);
CREATE TABLE IF NOT EXISTS cards (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  url         TEXT,
  site        TEXT,
  description TEXT NOT NULL DEFAULT '',
  image       TEXT,
  image_w     INTEGER,
  image_h     INTEGER,
  color       TEXT,
  color_name  TEXT,
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_created ON cards(created_at DESC);
CREATE TABLE IF NOT EXISTS tags (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  PRIMARY KEY (card_id, tag)
);
CREATE INDEX IF NOT EXISTS tags_tag ON tags(tag);
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  id UNINDEXED, title, body, tags, tokenize = 'porter unicode61'
);
`;

// Survive dev hot reloads with a single connection.
const g = globalThis as unknown as { __openmindDb?: Database.Database };

function db(): Database.Database {
  if (!g.__openmindDb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const conn = new Database(path.join(DATA_DIR, "openmind.db"));
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    conn.exec(SCHEMA);
    // Databases from before brains existed: their cards have no brain until the
    // first account is created and claims them (see createUser).
    const columns = conn.pragma("table_info(cards)") as { name: string }[];
    if (!columns.some((c) => c.name === "brain_id")) {
      conn.exec("ALTER TABLE cards ADD COLUMN brain_id TEXT REFERENCES brains(id) ON DELETE CASCADE");
    }
    const userColumns = conn.pragma("table_info(users)") as { name: string }[];
    if (!userColumns.some((c) => c.name === "oidc_sub")) {
      // The subject identifier of the SSO identity linked to this account, if any.
      conn.exec("ALTER TABLE users ADD COLUMN oidc_sub TEXT");
    }
    conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_sub ON users(oidc_sub) WHERE oidc_sub IS NOT NULL");
    conn.exec("CREATE INDEX IF NOT EXISTS cards_brain ON cards(brain_id, created_at DESC)");
    g.__openmindDb = conn;
  }
  return g.__openmindDb;
}

type Row = Omit<Card, "tags"> & { tags: string | null };

const SELECT = `
  SELECT c.*, (SELECT group_concat(tag, char(31)) FROM tags t WHERE t.card_id = c.id) AS tags
  FROM cards c`;

function toCard(row: Row): Card {
  return { ...row, tags: row.tags ? row.tags.split("\x1f").sort() : [] };
}

function reindex(id: string) {
  const card = getCard(id);
  db().prepare("DELETE FROM cards_fts WHERE id = ?").run(id);
  if (!card) return;
  const body = [card.content, card.description, card.note, card.url, card.site]
    .filter(Boolean)
    .join("\n");
  db()
    .prepare("INSERT INTO cards_fts (id, title, body, tags) VALUES (?, ?, ?, ?)")
    .run(id, card.title, body, card.tags.join(" "));
}

export type NewCard = {
  brain_id: string;
  type: CardType;
  title?: string;
  content?: string;
  url?: string | null;
  site?: string | null;
  description?: string;
  image?: string | null;
  image_w?: number | null;
  image_h?: number | null;
  color?: string | null;
  color_name?: ColorName | null;
  tags?: string[];
};

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 40);
}

export function createCard(input: NewCard): Card {
  const id = randomUUID();
  const insert = db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO cards (id, brain_id, type, title, content, url, site, description, image, image_w, image_h, color, color_name, created_at)
         VALUES (@id, @brain_id, @type, @title, @content, @url, @site, @description, @image, @image_w, @image_h, @color, @color_name, @created_at)`,
      )
      .run({
        id,
        brain_id: input.brain_id,
        type: input.type,
        title: input.title ?? "",
        content: input.content ?? "",
        url: input.url ?? null,
        site: input.site ?? null,
        description: input.description ?? "",
        image: input.image ?? null,
        image_w: input.image_w ?? null,
        image_h: input.image_h ?? null,
        color: input.color ?? null,
        color_name: input.color_name ?? null,
        created_at: Date.now(),
      });
    const addTag = db().prepare("INSERT OR IGNORE INTO tags (card_id, tag) VALUES (?, ?)");
    for (const tag of new Set((input.tags ?? []).map(normalizeTag))) {
      if (tag) addTag.run(id, tag);
    }
    reindex(id);
  });
  insert();
  return getCard(id)!;
}

export function getCard(id: string): Card | null {
  const row = db().prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  return row ? toCard(row) : null;
}

export type CardQuery = {
  brainId: string;
  q?: string;
  tag?: string;
  type?: CardType;
  color?: ColorName;
  shuffle?: boolean;
};

/** Turn free text into a prefix-matching FTS5 query; every term must match. */
function ftsQuery(q: string): string | null {
  const terms = q.match(/[\p{L}\p{N}]+/gu);
  if (!terms) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}

export function listCards(query: CardQuery): Card[] {
  const where = ["c.brain_id = @brain"];
  const params: Record<string, string> = { brain: query.brainId };
  const match = query.q ? ftsQuery(query.q) : null;
  if (match) {
    where.push("c.id IN (SELECT id FROM cards_fts WHERE cards_fts MATCH @match)");
    params.match = match;
  }
  if (query.tag) {
    where.push("EXISTS (SELECT 1 FROM tags t WHERE t.card_id = c.id AND t.tag = @tag)");
    params.tag = normalizeTag(query.tag);
  }
  if (query.type) {
    where.push("c.type = @type");
    params.type = query.type;
  }
  if (query.color) {
    where.push("c.color_name = @color");
    params.color = query.color;
  }
  const sql = `${SELECT} WHERE ${where.join(" AND ")}
    ORDER BY ${query.shuffle ? "random()" : "c.created_at DESC"} LIMIT 500`;
  return (db().prepare(sql).all(params) as Row[]).map(toCard);
}

export function topTags(brainId: string, limit = 12): { tag: string; count: number }[] {
  return db()
    .prepare(
      `SELECT tag, count(*) AS count FROM tags t JOIN cards c ON c.id = t.card_id
       WHERE c.brain_id = ? GROUP BY tag ORDER BY count DESC, tag LIMIT ?`,
    )
    .all(brainId, limit) as { tag: string; count: number }[];
}

export function updateCard(id: string, patch: { title?: string; note?: string; content?: string }) {
  const sets = Object.keys(patch)
    .filter((k) => ["title", "note", "content"].includes(k))
    .map((k) => `${k} = @${k}`);
  if (!sets.length) return;
  db().prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = @id`).run({ ...patch, id });
  reindex(id);
}

export function addTags(id: string, tags: string[]) {
  const stmt = db().prepare("INSERT OR IGNORE INTO tags (card_id, tag) VALUES (?, ?)");
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag) stmt.run(id, tag);
  }
  reindex(id);
}

export function removeTag(id: string, tag: string) {
  db().prepare("DELETE FROM tags WHERE card_id = ? AND tag = ?").run(id, tag);
  reindex(id);
}

export function deleteCard(id: string) {
  const card = getCard(id);
  if (!card) return;
  db().prepare("DELETE FROM cards WHERE id = ?").run(id);
  db().prepare("DELETE FROM cards_fts WHERE id = ?").run(id);
  if (card.image) fs.rmSync(path.join(UPLOAD_DIR, card.image), { force: true });
}

/** Pin a colour on a card by hand, or clear it with null. */
export function setCardColor(id: string, name: ColorName | null) {
  db()
    .prepare("UPDATE cards SET color_name = ?, color = ? WHERE id = ?")
    .run(name, name ? COLORS[name] : null, id);
}

export function moveCard(id: string, brainId: string) {
  db().prepare("UPDATE cards SET brain_id = ? WHERE id = ?").run(brainId, id);
}

/** The card, but only if it lives in one of this user's brains. */
export function getOwnedCard(userId: string, id: string): Card | null {
  const row = db()
    .prepare(`${SELECT} JOIN brains b ON b.id = c.brain_id WHERE c.id = ? AND b.user_id = ?`)
    .get(id, userId) as Row | undefined;
  return row ? toCard(row) : null;
}

export function userOwnsImage(userId: string, image: string): boolean {
  return Boolean(
    db()
      .prepare("SELECT 1 FROM cards c JOIN brains b ON b.id = c.brain_id WHERE c.image = ? AND b.user_id = ?")
      .get(image, userId),
  );
}

// --- brains ---

export function listBrains(userId: string): Brain[] {
  return db()
    .prepare("SELECT id, name FROM brains WHERE user_id = ? ORDER BY created_at, rowid")
    .all(userId) as Brain[];
}

export function getOwnedBrain(userId: string, id: string): Brain | null {
  return (db().prepare("SELECT id, name FROM brains WHERE id = ? AND user_id = ?").get(id, userId) as Brain) ?? null;
}

export function createBrain(userId: string, name: string): Brain {
  const brain = { id: randomUUID(), name };
  db()
    .prepare("INSERT INTO brains (id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
    .run(brain.id, userId, name, Date.now());
  return brain;
}

export function renameBrain(id: string, name: string) {
  db().prepare("UPDATE brains SET name = ? WHERE id = ?").run(name, id);
}

/** Deletes the brain and everything in it, including stored images. */
export function deleteBrain(id: string) {
  const ids = db().prepare("SELECT id FROM cards WHERE brain_id = ?").all(id) as { id: string }[];
  for (const card of ids) deleteCard(card.id);
  db().prepare("DELETE FROM brains WHERE id = ?").run(id);
}

// --- users and sessions ---

/** Cheap liveness check: throws if the database cannot be opened or queried. */
export function ping() {
  db().prepare("SELECT 1").get();
}

export function userCount(): number {
  return (db().prepare("SELECT count(*) AS n FROM users").get() as { n: number }).n;
}

export function findUserByEmail(email: string): (User & { password_hash: string }) | null {
  return (
    (db().prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as
      | (User & { password_hash: string })
      | undefined) ?? null
  );
}

export function findUserBySub(sub: string): User | null {
  return (db().prepare("SELECT id, email FROM users WHERE oidc_sub = ?").get(sub) as User | undefined) ?? null;
}

export function linkUserSub(userId: string, sub: string) {
  db().prepare("UPDATE users SET oidc_sub = ? WHERE id = ?").run(sub, userId);
}

/**
 * Creates the account with a first brain. Throws if the email is taken.
 * SSO-only accounts pass an empty password hash, which no password can match.
 */
export function createUser(email: string, passwordHash: string, oidcSub: string | null = null): User {
  const user = { id: randomUUID(), email };
  db().transaction(() => {
    const first = userCount() === 0;
    db()
      .prepare("INSERT INTO users (id, email, password_hash, oidc_sub, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, email, passwordHash, oidcSub, Date.now());
    const brain = createBrain(user.id, "My mind");
    // Cards saved before accounts existed go to whoever sets the instance up.
    if (first) db().prepare("UPDATE cards SET brain_id = ? WHERE brain_id IS NULL").run(brain.id);
  })();
  return user;
}

export function createSession(tokenHash: string, userId: string, expiresAt: number) {
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash, userId, expiresAt);
}

export function findSessionUser(tokenHash: string): User | null {
  return (
    (db()
      .prepare(
        `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, Date.now()) as User | undefined) ?? null
  );
}

export function deleteSession(tokenHash: string) {
  db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}
