import type { Card } from "@/lib/types";

export function CardTile({ card, onOpen }: { card: Card; onOpen: () => void }) {
  // A link without an image already shows its title on the face of the card.
  const titled = card.image ? card.title : "";
  const site = card.type === "link" ? card.site : null;

  return (
    <button onClick={onOpen} className="group mb-5 block w-full break-inside-avoid text-left outline-none">
      <div className="relative overflow-hidden rounded-xl bg-card shadow-sm ring-accent transition-shadow group-hover:shadow-md group-hover:ring-2 group-focus-visible:ring-2">
        {/* Images already show their colour; text cards get a dot for a pinned one. */}
        {!card.image && card.color && (
          <span
            title={card.color_name ?? undefined}
            style={{ background: card.color }}
            className="absolute right-3 top-3 size-2.5 rounded-full ring-1 ring-line"
          />
        )}
        {card.image ? (
          <img
            src={`/files/${card.image}`}
            alt={card.title}
            width={card.image_w ?? undefined}
            height={card.image_h ?? undefined}
            loading="lazy"
            style={{ background: card.color ?? undefined }}
            className="h-auto w-full"
          />
        ) : card.type === "note" ? (
          <p className="line-clamp-[12] whitespace-pre-wrap break-words p-5 text-[15px] leading-relaxed">
            {card.content}
          </p>
        ) : (
          <div className="p-5">
            <p className="line-clamp-5 break-words font-serif text-2xl leading-tight">{card.title}</p>
            {card.description && <p className="mt-3 line-clamp-4 text-sm text-muted">{card.description}</p>}
          </div>
        )}
      </div>
      {(titled || site) && (
        <p className="mt-2 truncate px-1 text-center text-xs text-muted">
          {titled}
          {titled && site && " · "}
          {site && <span className="opacity-60">{site}</span>}
        </p>
      )}
    </button>
  );
}
