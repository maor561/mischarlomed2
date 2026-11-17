"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SymbolSearch from "@/components/symbol-search";
import SymbolDot from "@/components/symbol-dot";
import { api, dateHe, money } from "@/lib/format";
import { LESSON_BY_N } from "@/lib/lessons/content";
import type { StoreItem, StoreView } from "@/lib/store/store";

const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
const tone = (n: number | null) => (n == null ? "text-muted" : n >= 0 ? "text-up" : "text-down");

/**
 * החנות (חבילה 12): חיפוש, אוספים בקרוסלה, "הפעילים ביותר" ביום הסימולציה, ודף אוסף עם קנייה בחלוקה שווה.
 */
export default function StorePanel({ id, version, onBought, onPlan }: { id: string; version: string; onBought: (msg: string) => Promise<void> | void; onPlan: (name: string, symbols: string[]) => void }) {
  const router = useRouter();
  const [data, setData] = useState<StoreView | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<StoreView>(`/api/portfolios/${id}/store`)
      .then((d) => live && setData(d))
      .catch((e) => live && setErr((e as Error).message));
    return () => {
      live = false;
    };
  }, [id, version]);

  const goStock = (s: string) => router.push(`/p/${id}/stock/${encodeURIComponent(s)}`);
  const col = data?.collections.find((c) => c.id === open) ?? null;

  return (
    <div className="space-y-4">
      <div className="card">
        <SymbolSearch placeholder="🔍 משהו ספציפי? חפש מניה או קרן" onPick={(s) => goStock(s)} />
      </div>

      {err && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{err}</div>}
      {!data && !err && <div className="card text-sm text-muted">טוען את החנות… (בפעם הראשונה זה לוקח כמה שניות)</div>}

      {data && (
        <>
          <section>
            <h3 className="font-semibold mb-2">אוספים לפי נושא</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
              {data.collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className={`snap-start shrink-0 w-40 h-44 rounded-[22px] p-3 text-start text-ink flex flex-col ${open === c.id ? "ring-4 ring-ink/30" : ""}`}
                  style={{ background: c.color }}
                >
                  <span className="text-3xl">{c.emoji}</span>
                  <b className="mt-auto text-lg leading-tight">{c.title}</b>
                  <span className="text-xs text-ink-2">{c.availableCount} ניירות · שנה <span className="num">{pct(c.yearPct)}</span></span>
                </button>
              ))}
            </div>
          </section>

          {col && <CollectionCard id={id} col={col} goStock={goStock} onBought={onBought} onPlan={onPlan} />}

          <section>
            <h3 className="font-semibold mb-2">🔥 הפעילים ביותר {data.asOf === "" ? "" : <span className="text-xs text-muted font-normal">ב-<span className="num">{dateHe(data.asOf)}</span></span>}</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.active.map((x) => (
                <button key={x.symbol} onClick={() => goStock(x.symbol)} className="card shrink-0 w-32 text-start space-y-1 hover:border-brand">
                  <SymbolDot symbol={x.symbol} size={30} />
                  <b className="block num text-sm">{x.symbol}</b>
                  <span className="block text-xs text-muted truncate"><bdi>{x.name}</bdi></span>
                  <span className={`block text-sm num ${tone(x.dayPct)}`}>{pct(x.dayPct)}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">לפי מחזור המסחר בדולרים ביום האחרון. &quot;פעיל&quot; זה לא &quot;טוב&quot;: הרבה מסחר מסמן בעיקר הרבה עניין.</p>
          </section>
        </>
      )}
    </div>
  );
}

function CollectionCard({ id, col, goStock, onBought, onPlan }: { id: string; col: StoreView["collections"][number]; goStock: (s: string) => void; onBought: (msg: string) => Promise<void> | void; onPlan: (name: string, symbols: string[]) => void }) {
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const avail = col.items.filter((x) => x.available);
  const share = avail.length ? Math.floor((amount / avail.length) * 100) / 100 : 0;
  const lesson = LESSON_BY_N.get(col.lesson);

  async function buy() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ share: number; results: { symbol: string; error?: string }[] }>(`/api/portfolios/${id}/store`, { method: "POST", json: { collection: col.id, amount } });
      const ok = r.results.filter((x) => !x.error).length;
      const bad = r.results.filter((x) => x.error);
      await onBought(`🛍️ אוסף "${col.title}": ${ok} פקודות קנייה של ${money(r.share, "ILS")} נשלחו${bad.length ? ` · ${bad.length} נכשלו (${bad.map((x) => `${x.symbol}: ${x.error}`).join("; ")})` : ""}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-3xl">{col.emoji}</span>
        <div>
          <h3 className="font-bold text-lg">{col.title}</h3>
          <p className="text-sm text-muted">{col.blurb}</p>
        </div>
      </div>
      <div className={`text-sm rounded-lg p-2.5 ${col.concentrated ? "bg-warn-soft text-[#6b4100]" : "bg-bg"}`}>
        {col.concentrated ? "⚠️ " : "💡 "}
        {col.risk}
        {col.concentrated && " עדיף שאוסף נושאי יהיה רק חלק מהתיק, לצד מדד רחב."}
        {lesson && (
          <Link href={`/lessons/${col.lesson}`} className="block mt-1 text-xs underline">📚 שיעור {col.lesson}: {lesson.title} ←</Link>
        )}
      </div>

      <div className="divide-y divide-line">
        {col.items.map((x: StoreItem) => (
          <button key={x.symbol} disabled={!x.available} onClick={() => goStock(x.symbol)} className="w-full flex items-center gap-3 py-2 text-start disabled:opacity-50">
            <SymbolDot symbol={x.symbol} />
            <span className="min-w-0 flex-1">
              <b className="num">{x.symbol}</b> <span className="text-xs text-muted">{x.kind === "ETF" ? "קרן סל" : "מניה"}</span>
              <span className="block text-xs text-muted truncate"><bdi>{x.name}</bdi></span>
            </span>
            {x.available ? (
              <span className="text-end">
                <span className="block num font-semibold">{money(x.price, x.currency)}</span>
                <span className={`block text-xs num ${tone(x.yearPct)}`}>שנה {pct(x.yearPct)}</span>
              </span>
            ) : (
              <span className="text-xs text-muted">{x.since ? <>נסחר רק מ-<span className="num">{dateHe(x.since)}</span></> : "אין נתונים"}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-bg p-3 space-y-2">
        <b className="block text-sm">לקנות את כל האוסף</b>
        <div className="flex items-center gap-2">
          <input className="input num w-32" type="number" min={10} step={100} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} />
          <span className="text-muted">₪</span>
          <span className="text-xs text-muted">
            = <span className="num">{money(share, "ILS")}</span> לכל אחד מ-{avail.length} הניירות
          </span>
        </div>
        <p className="text-xs text-muted">פקודת שוק לכל נייר, לפי סכום ועם שברי מניות. ההמרה לדולרים אוטומטית. כל נייר נספר כפעולה במכסת העמלות.</p>
        {err && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{err}</div>}
        <div className="flex gap-2 flex-wrap">
          <button className="btn" disabled={busy || share < 10} onClick={buy}>{busy ? "שולח…" : `קנה ב-${money(amount, "ILS", 0)}`}</button>
          <button className="btn-ghost" disabled={!avail.length} onClick={() => onPlan(`אוסף ${col.title}`, avail.map((x) => x.symbol))}>🔁 השקעה קבועה באוסף</button>
        </div>
      </div>
    </div>
  );
}
