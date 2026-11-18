import { connection } from "next/server";
import { Suspense } from "react";
import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth";
import { listBrains, listCards, topTags } from "@/lib/db";
import type { MindParams } from "@/lib/params";
import { CARD_TYPES, COLORS, type ColorName } from "@/lib/types";
import { BrainBar } from "@/components/BrainBar";
import { Filters } from "@/components/Filters";
import { MindGrid } from "@/components/MindGrid";
import { SearchBar } from "@/components/SearchBar";

async function Mind({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  // SQLite reads are synchronous, so opt in to request-time rendering explicitly.
  await connection();
  const raw = await searchParams;
  const one = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : undefined);
  const user = await requireUser();
  const brains = listBrains(user.id);
  const brain = brains.find((b) => b.id === one("b")) ?? brains[0];
  const params: MindParams = {
    b: brain.id,
    q: one("q") || undefined,
    tag: one("tag") || undefined,
    type: CARD_TYPES.find((t) => t === one("type")),
    color: (Object.keys(COLORS) as ColorName[]).find((c) => c === one("color")),
    shuffle: one("shuffle") === "1" ? "1" : undefined,
  };
  const cards = listCards({ ...params, brainId: brain.id, shuffle: params.shuffle === "1" });
  const filtered = Boolean(params.q || params.tag || params.type || params.color);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <BrainBar brains={brains} active={brain} />
        <form action={logout} className="ml-auto flex items-center gap-3 text-muted">
          <span className="hidden sm:inline">{user.email}</span>
          <button className="rounded-full px-3 py-1 hover:bg-card hover:text-fg">Log out</button>
        </form>
      </header>
      {/* Keyed by brain so the search box resets when switching. */}
      <SearchBar key={brain.id} params={params} />
      <Filters params={params} tags={topTags(brain.id)} />
      <MindGrid cards={cards} filtered={filtered} brain={brain} brains={brains} />
    </>
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-[1800px] px-5 pb-24 pt-8 sm:px-10">
      <Suspense>
        <Mind searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
