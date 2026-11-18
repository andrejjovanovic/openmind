import Link from "next/link";
import { mindHref, type MindParams } from "@/lib/params";
import { CARD_TYPES, COLORS, type ColorName } from "@/lib/types";

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm transition-colors ${
    active ? "bg-fg text-bg" : "text-muted hover:bg-card hover:text-fg"
  }`;

export function Filters({ params, tags }: { params: MindParams; tags: { tag: string; count: number }[] }) {
  // Clicking the active filter clears it.
  const toggle = <K extends keyof MindParams>(key: K, value: MindParams[K]) =>
    mindHref({ ...params, [key]: params[key] === value ? undefined : value });

  return (
    <nav className="mb-8 mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-line pt-4">
      {CARD_TYPES.map((type) => (
        <Link key={type} href={toggle("type", type)} className={pill(params.type === type)}>
          {type}s
        </Link>
      ))}
      <span className="mx-2 h-4 w-px bg-line" />
      {(Object.entries(COLORS) as [ColorName, string][]).map(([name, hex]) => (
        <Link
          key={name}
          href={toggle("color", name)}
          title={name}
          aria-label={`Colour: ${name}`}
          style={{ background: hex }}
          className={`mx-0.5 size-4 rounded-full border border-line transition-transform hover:scale-125 ${
            params.color === name ? "scale-125 ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""
          }`}
        />
      ))}
      <span className="mx-2 h-4 w-px bg-line" />
      {tags.map(({ tag }) => (
        <Link key={tag} href={toggle("tag", tag)} className={pill(params.tag === tag)}>
          #{tag}
        </Link>
      ))}
      {params.tag && !tags.some((t) => t.tag === params.tag) && (
        <Link href={toggle("tag", params.tag)} className={pill(true)}>
          #{params.tag}
        </Link>
      )}
      <Link href={toggle("shuffle", "1")} className={`${pill(params.shuffle === "1")} ml-auto`}>
        serendipity
      </Link>
    </nav>
  );
}
