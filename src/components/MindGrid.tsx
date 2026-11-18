"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { addCard } from "@/app/actions";
import type { Brain, Card } from "@/lib/types";
import { CardModal } from "./CardModal";
import { CardTile } from "./CardTile";
import { Composer } from "./Composer";

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName));
}

export function MindGrid({
  cards,
  filtered,
  brain,
  brains,
}: {
  cards: Card[];
  filtered: boolean;
  brain: Brain;
  brains: Brain[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "busy" | "error"; text: string } | null>(null);
  const open = cards.find((c) => c.id === openId);

  async function save(text: string): Promise<boolean> {
    setStatus({ kind: "busy", text: "Saving to your mind…" });
    const result = await addCard(brain.id, text);
    setStatus(result.ok ? null : { kind: "error", text: result.error });
    return result.ok;
  }

  async function upload(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      setStatus({ kind: "error", text: "Only images can be dropped in for now" });
      return;
    }
    setStatus({ kind: "busy", text: `Saving ${images.length === 1 ? "image" : `${images.length} images`}…` });
    const body = new FormData();
    body.append("brain", brain.id);
    for (const image of images) body.append("file", image);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      setStatus(res.ok ? null : { kind: "error", text: json.error ?? "Upload failed" });
    } catch {
      setStatus({ kind: "error", text: "Upload failed" });
    }
    router.refresh();
  }

  // Paste or drop anywhere on the page to save, like dropping something into a drawer.
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (isEditable(e.target) || !e.clipboardData) return;
    const files = [...e.clipboardData.files];
    const text = e.clipboardData.getData("text/plain");
    if (files.length) void upload(files);
    else if (text.trim()) void save(text);
    else return;
    e.preventDefault();
  });
  const onDrop = useEffectEvent((e: DragEvent) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (files.length) void upload(files);
    else if (text.trim()) void save(text);
  });

  useEffect(() => {
    const paste = (e: ClipboardEvent) => onPaste(e);
    const drop = (e: DragEvent) => onDrop(e);
    const dragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener("paste", paste);
    window.addEventListener("drop", drop);
    window.addEventListener("dragover", dragOver);
    return () => {
      window.removeEventListener("paste", paste);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragover", dragOver);
    };
  }, []);

  return (
    <>
      <div className="columns-2 gap-5 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
        {!filtered && <Composer onSave={save} />}
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onOpen={() => setOpenId(card.id)} />
        ))}
      </div>

      {cards.length === 0 && (
        <p className="mt-16 text-center font-serif text-2xl italic text-muted">
          {filtered
            ? "Nothing in this brain matches that."
            : "This brain is empty. Write a note, paste a link, or drop an image anywhere."}
        </p>
      )}

      {open && <CardModal key={open.id} card={open} brains={brains} onClose={() => setOpenId(null)} />}

      {status && (
        <button
          role="status"
          onClick={() => setStatus(null)}
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm shadow-lg ${
            status.kind === "error" ? "bg-red-600 text-white" : "bg-fg text-bg"
          }`}
        >
          {status.text}
        </button>
      )}
    </>
  );
}
