"use client";

import { useEffect, useState } from "react";

type Hit = { symbol: string; name: string; exchange: string; kind: string };
const KIND_HE: Record<string, string> = { EQUITY: "מניה", ETF: "קרן סל", INDEX: "מדד", CURRENCY: "מטבע" };

/** חיפוש נייר. מחזיר את הסימול שנבחר */
export default function SymbolSearch({ value, onPick, placeholder }: { value?: string; onPick: (symbol: string, name: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      // רק מניות וקרנות סל (לא מדדים ומטבעות, שאי אפשר לקנות ישירות)
      setHits(Array.isArray(j) ? j.filter((h: Hit) => h.kind === "EQUITY" || h.kind === "ETF") : []);
      setOpen(true);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <input
        className="input"
        value={q}
        placeholder={value ? `${value} · לחץ כדי לחפש נייר אחר` : (placeholder ?? "🔍 חפש מניה או קרן סל: Apple, טבע, S&P 500…")}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 inset-x-0 mt-1 bg-white border border-line rounded-lg shadow-lg max-h-72 overflow-auto">
          {hits.map((h) => (
            <li key={h.symbol}>
              <button
                type="button"
                className="w-full text-start px-3 py-2 hover:bg-brand-soft flex gap-2 items-baseline"
                onClick={() => {
                  onPick(h.symbol, h.name);
                  setQ("");
                  setOpen(false);
                }}
              >
                <b className="num">{h.symbol}</b>
                <span className="flex-1 truncate">{h.name}</span>
                <span className="text-xs text-muted">
                  {KIND_HE[h.kind] ?? h.kind} · {h.exchange}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
