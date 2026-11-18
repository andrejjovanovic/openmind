"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createBrain, deleteBrain, renameBrain } from "@/app/actions";
import { mindHref } from "@/lib/params";
import type { Brain } from "@/lib/types";

const quiet = "rounded-full px-3 py-1 text-muted hover:bg-card hover:text-fg";

export function BrainBar({ brains, active }: { brains: Brain[]; active: Brain }) {
  // "new" shows the create field; a brain id shows the rename field in its place.
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameForm = (initial: string, submit: (name: string) => Promise<unknown>) => (
    <form
      action={(data) => {
        const name = String(data.get("name") ?? "").trim();
        setEditing(null);
        if (name && name !== initial) startTransition(() => void submit(name));
      }}
    >
      <input
        name="name"
        autoFocus
        defaultValue={initial}
        maxLength={40}
        aria-label="Brain name"
        placeholder="Name this brain"
        onBlur={() => setEditing(null)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
        className="w-40 rounded-full border border-accent bg-transparent px-3 py-1 outline-none placeholder:text-muted"
      />
    </form>
  );

  return (
    <nav aria-label="Brains" className={`flex flex-wrap items-center gap-1 ${pending ? "opacity-60" : ""}`}>
      {brains.map((brain) =>
        editing === brain.id ? (
          <div key={brain.id}>{nameForm(brain.name, (name) => renameBrain(brain.id, name))}</div>
        ) : brain.id === active.id ? (
          <span key={brain.id} className="flex items-center rounded-full bg-fg text-bg">
            <button title="Rename" onClick={() => setEditing(brain.id)} className="py-1 pl-3 pr-1 font-medium">
              {brain.name}
            </button>
            <button
              title={brains.length > 1 ? "Delete this brain" : "You need at least one brain"}
              aria-label="Delete this brain"
              disabled={brains.length <= 1}
              onClick={() => {
                if (confirm(`Delete "${brain.name}" and everything in it? This cannot be undone.`)) {
                  startTransition(() => void deleteBrain(brain.id));
                }
              }}
              className="py-1 pl-1 pr-3 opacity-50 hover:opacity-100 disabled:hidden"
            >
              ×
            </button>
          </span>
        ) : (
          <Link key={brain.id} href={mindHref({ b: brain.id })} className={quiet}>
            {brain.name}
          </Link>
        ),
      )}
      {editing === "new" ? (
        nameForm("", createBrain)
      ) : (
        <button onClick={() => setEditing("new")} className={quiet}>
          + New brain
        </button>
      )}
    </nav>
  );
}
