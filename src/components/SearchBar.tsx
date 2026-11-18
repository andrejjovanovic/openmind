"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { mindHref, type MindParams } from "@/lib/params";

export function SearchBar({ params }: { params: MindParams }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  return (
    <input
      type="search"
      name="q"
      autoComplete="off"
      aria-label="Search"
      placeholder="Search my mind…"
      defaultValue={params.q ?? ""}
      onChange={(e) => {
        const q = e.target.value;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => router.replace(mindHref({ ...params, q, shuffle: undefined })), 200);
      }}
      className="w-full bg-transparent font-serif text-5xl italic text-fg outline-none placeholder:text-muted/70 sm:text-7xl [&::-webkit-search-cancel-button]:hidden"
    />
  );
}
