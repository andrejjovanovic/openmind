"use client";

import { useEffect, useEffectEvent, useTransition } from "react";
import { addTag, deleteCard, moveCard, removeTag, setCardColor, updateCard } from "@/app/actions";
import { COLORS, type Brain, type Card, type ColorName } from "@/lib/types";

const label = "text-xs font-semibold uppercase tracking-widest text-accent";

export function CardModal({ card, brains, onClose }: { card: Card; brains: Brain[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  const saveField = (field: "title" | "note" | "content", value: string) => {
    if (value !== card[field]) startTransition(() => updateCard(card.id, { [field]: value }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.title || "Card"}
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-md sm:p-10"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl md:h-[80vh] md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-48 flex-1 items-center justify-center overflow-auto bg-bg/60">
          {card.image ? (
            <img
              src={`/files/${card.image}`}
              alt={card.title}
              className="max-h-full max-w-full object-contain md:max-h-[80vh]"
            />
          ) : card.type === "note" ? (
            <textarea
              defaultValue={card.content}
              aria-label="Note"
              onBlur={(e) => saveField("content", e.target.value)}
              className="h-full min-h-64 w-full resize-none bg-transparent p-8 text-lg leading-relaxed outline-none sm:p-14"
            />
          ) : (
            <p className="p-10 text-center font-serif text-4xl">{card.title}</p>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto p-6 md:w-96">
          <input
            defaultValue={card.title}
            aria-label="Title"
            placeholder="Untitled"
            onBlur={(e) => saveField("title", e.target.value)}
            className="w-full bg-transparent font-serif text-3xl leading-tight outline-none placeholder:text-muted"
          />

          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noreferrer noopener"
              className="-mt-3 truncate text-sm text-muted underline-offset-2 hover:text-accent hover:underline"
            >
              {card.site ?? card.url} ↗
            </a>
          )}

          {card.description && <p className="text-sm leading-relaxed text-muted">{card.description}</p>}

          <section>
            <h3 className={label}>Mind tags</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <button
                  key={tag}
                  title="Remove tag"
                  onClick={() => startTransition(() => removeTag(card.id, tag))}
                  className="rounded-full bg-bg px-3 py-1 text-sm hover:bg-accent hover:text-white hover:line-through"
                >
                  {tag}
                </button>
              ))}
              <form
                action={(data) => {
                  const tag = String(data.get("tag") ?? "");
                  if (tag.trim()) startTransition(() => addTag(card.id, tag));
                }}
              >
                <input
                  name="tag"
                  aria-label="Add tag"
                  placeholder="+ Add tag"
                  autoComplete="off"
                  className="w-28 rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted focus:border-accent"
                />
              </form>
            </div>
          </section>

          <section>
            <h3 className={label}>Colour</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.entries(COLORS) as [ColorName, string][]).map(([name, hex]) => {
                const active = card.color_name === name;
                return (
                  <button
                    key={name}
                    title={active ? `Remove ${name}` : name}
                    aria-label={`Colour: ${name}`}
                    aria-pressed={active}
                    onClick={() => startTransition(() => setCardColor(card.id, active ? null : name))}
                    style={{ background: hex }}
                    className={`size-5 rounded-full border border-line transition-transform hover:scale-125 ${
                      active ? "scale-125 ring-2 ring-fg ring-offset-2 ring-offset-card" : ""
                    }`}
                  />
                );
              })}
            </div>
          </section>

          <section className="flex flex-1 flex-col">
            <h3 className={label}>Mind notes</h3>
            <textarea
              defaultValue={card.note}
              aria-label="Notes"
              placeholder="Type here to add a note…"
              onBlur={(e) => saveField("note", e.target.value)}
              className="mt-3 min-h-28 w-full flex-1 resize-none rounded-lg bg-bg p-3 text-sm leading-relaxed outline-none placeholder:text-muted"
            />
          </section>

          {brains.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted">
              Brain
              <select
                value={card.brain_id}
                onChange={(e) => {
                  const target = e.target.value;
                  startTransition(async () => {
                    await moveCard(card.id, target);
                    onClose();
                  });
                }}
                className="flex-1 rounded-lg bg-bg px-2 py-1.5 text-sm text-fg outline-none"
              >
                {brains.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <footer className="flex items-center justify-between text-xs text-muted">
            <time dateTime={new Date(card.created_at).toISOString()}>
              {pending
                ? "Saving…"
                : `Saved ${new Date(card.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`}
            </time>
            <button
              onClick={() => {
                if (confirm("Remove this from your mind? This cannot be undone.")) {
                  startTransition(async () => {
                    await deleteCard(card.id);
                    onClose();
                  });
                }
              }}
              className="rounded-full px-3 py-1 hover:bg-red-600 hover:text-white"
            >
              Delete
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}
