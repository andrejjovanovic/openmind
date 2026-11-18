"use client";

import { useState } from "react";

export function Composer({ onSave }: { onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!text.trim() || saving) return;
    setSaving(true);
    if (await onSave(text)) setText("");
    setSaving(false);
  }

  return (
    <form
      className="mb-5 flex break-inside-avoid flex-col rounded-xl bg-card p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="composer" className="text-xs font-semibold uppercase tracking-widest text-accent">
        Add a new note
      </label>
      <textarea
        id="composer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        rows={7}
        placeholder="Start typing here, or paste a link…"
        className="mt-3 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={!text.trim() || saving}
        className="mt-2 self-end rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-0"
      >
        {saving ? "Saving…" : "Save ⌘↵"}
      </button>
    </form>
  );
}
