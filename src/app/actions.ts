"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as db from "@/lib/db";
import { saveText } from "@/lib/ingest";
import { mindHref } from "@/lib/params";
import { COLORS, type ColorName } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Every action re-checks that the thing being touched belongs to the signed-in user;
// ids arriving from the client are never trusted on their own.
async function ownedCard(id: string) {
  const user = await requireUser();
  const card = db.getOwnedCard(user.id, id);
  if (!card) throw new Error("Card not found");
  return { user, card };
}

async function ownedBrain(id: string) {
  const user = await requireUser();
  const brain = db.getOwnedBrain(user.id, id);
  if (!brain) throw new Error("Brain not found");
  return { user, brain };
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 40);

export async function addCard(brainId: string, text: string): Promise<ActionResult> {
  const { brain } = await ownedBrain(brainId);
  if (!text.trim()) return { ok: false, error: "Nothing to save" };
  try {
    await saveText(brain.id, text.slice(0, 100_000));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save that" };
  }
  refresh();
  return { ok: true };
}

export async function updateCard(id: string, patch: { title?: string; note?: string; content?: string }) {
  await ownedCard(id);
  db.updateCard(id, patch);
  refresh();
}

export async function addTag(id: string, tag: string) {
  await ownedCard(id);
  db.addTags(id, [tag]);
  refresh();
}

export async function removeTag(id: string, tag: string) {
  await ownedCard(id);
  db.removeTag(id, tag);
  refresh();
}

export async function setCardColor(id: string, color: ColorName | null) {
  await ownedCard(id);
  if (color !== null && !(color in COLORS)) throw new Error("Unknown colour");
  db.setCardColor(id, color);
  refresh();
}

export async function moveCard(id: string, brainId: string) {
  const { user } = await ownedCard(id);
  if (!db.getOwnedBrain(user.id, brainId)) throw new Error("Brain not found");
  db.moveCard(id, brainId);
  refresh();
}

export async function deleteCard(id: string) {
  await ownedCard(id);
  db.deleteCard(id);
  refresh();
}

export async function createBrain(name: string) {
  const user = await requireUser();
  const brain = db.createBrain(user.id, cleanName(name) || "Untitled");
  redirect(mindHref({ b: brain.id }));
}

export async function renameBrain(id: string, name: string) {
  await ownedBrain(id);
  if (cleanName(name)) db.renameBrain(id, cleanName(name));
  refresh();
}

export async function deleteBrain(id: string): Promise<ActionResult> {
  const { user } = await ownedBrain(id);
  if (db.listBrains(user.id).length <= 1) return { ok: false, error: "You need at least one brain" };
  db.deleteBrain(id);
  redirect("/");
}
