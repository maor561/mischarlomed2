"use client";

import { useState } from "react";
import SymbolSearch from "@/components/symbol-search";
import { api, dateHe, money } from "@/lib/format";
import type { PortfolioView } from "@/lib/engine/service";
import type { Plan, PlanFreq } from "@/lib/engine/types";

const FREQ_HE: Record<PlanFreq, string> = { daily: "כל יום מסחר", weekly: "כל שבוע", monthly: "כל חודש" };
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

type Draft = { id?: number; name: string; amount: number; freq: PlanFreq; day: number; items: { symbol: string; pct: number }[]; source: "deposit" | "cash" };

export function planWhen(p: Pick<Plan, "freq" | "day">) {
  if (p.freq === "daily") return "כל יום מסחר (ב'–ו')";
  if (p.freq === "weekly") return `כל יום ${WEEKDAYS[p.day]}`;
  return `ב-${p.day} בכל חודש`;
}

/**
 * תוכניות השקעה קבועות (D31): כמה תוכניות, כל אחת עם סכום, תדירות וחלוקה באחוזים.
 * היסטוריית הביצועים נלקחת מיומן התנועות (רשומות עם planId).
 */
export default function PlansPanel({ id, view, onChange, prefillSymbol }: { id: string; view: PortfolioView; onChange: () => Promise<void> | void; prefillSymbol?: string | null }) {
  const plans = view.portfolio.plans;
  const [draft, setDraft] = useState<Draft | null>(() =>
    prefillSymbol ? { name: `השקעה קבועה ב-${prefillSymbol}`, amount: 500, freq: "monthly", day: 1, items: [{ symbol: prefillSymbol, pct: 100 }], source: "deposit" } : null,
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isTime = view.portfolio.mode === "time";

  async function call(method: string, json: unknown) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/portfolios/${id}/plans`, { method, json });
      await onChange();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const runs = (planId: number) => view.history.filter((e) => e.meta.planId === planId && (e.kind === "deposit" || e.kind === "plan"));

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="card">
        <h3 className="font-semibold">🔁 תוכניות השקעה קבועות</h3>
        <p className="text-sm text-muted mt-1">
          סכום קבוע שנכנס ומושקע אוטומטית, בלי לחשוב על התזמון. זו הדרך הנפוצה ביותר לבנות תיק לאורך זמן.
          {isTime && " במכונת הזמן התוכנית רצה מהיום הבא של המסע."}
        </p>
        {!draft && (
          <button className="btn mt-3" onClick={() => setDraft({ name: "", amount: 500, freq: "monthly", day: 1, items: [{ symbol: "VOO", pct: 100 }], source: "deposit" })}>
            + תוכנית חדשה
          </button>
        )}
      </div>

      {draft && <Editor draft={draft} setDraft={setDraft} busy={busy} err={err} onCancel={() => { setDraft(null); setErr(""); }} onSave={async () => { if (await call("POST", draft)) setDraft(null); }} />}

      {!plans.length && !draft && <p className="text-sm text-muted">עוד אין תוכניות.</p>}
      {plans.map((p) => {
        const r = runs(p.id);
        const paused = p.status === "paused";
        return (
          <div key={p.id} className={`card space-y-2 ${paused ? "opacity-70" : ""}`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <b>{p.name}</b>
              <span className={`chip ${paused ? "" : "chip-on"}`}>{paused ? "⏸ מושהית" : "▶ פעילה"}</span>
              <span className="flex-1" />
              <b className="num text-lg">{money(p.amount, "ILS", 0)}</b>
            </div>
            <div className="text-sm text-muted">
              {planWhen(p)} · {p.source === "deposit" ? "כסף חדש נכנס לתיק" : "מהמזומן שבתיק"}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {p.items.length ? p.items.map((i) => <span key={i.symbol} className="chip num">{i.symbol} {i.pct}%</span>) : <span className="text-sm text-muted">רק הפקדה, בלי קנייה אוטומטית</span>}
            </div>
            <div className="flex gap-3 text-sm pt-1">
              <button className="underline" disabled={busy} onClick={() => setDraft({ id: p.id, name: p.name, amount: p.amount, freq: p.freq, day: p.day, items: p.items.map((i) => ({ ...i })), source: p.source })}>עריכה</button>
              <button className="underline" disabled={busy} onClick={() => call("PATCH", { planId: p.id, status: paused ? "active" : "paused" })}>{paused ? "הפעלה מחדש" : "השהיה"}</button>
              <button className="underline text-down" disabled={busy} onClick={() => confirm(`למחוק את "${p.name}"? מה שכבר נקנה נשאר בתיק.`) && call("DELETE", { planId: p.id })}>מחיקה</button>
            </div>
            {r.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">היסטוריה: {r.length} ביצועים · סה&quot;כ <span className="num">{money(r.filter((e) => !e.meta.skipped).reduce((a, e) => a + Number(e.meta.amount ?? e.cashIls), 0), "ILS", 0)}</span></summary>
                <ul className="mt-1 space-y-0.5">
                  {r.slice(0, 24).map((e) => (
                    <li key={e.id} className="num">{dateHe(e.d)} · {e.meta.skipped ? `דולגה: ${e.meta.skipped}` : money(Number(e.meta.amount ?? e.cashIls), "ILS", 0)}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Editor({ draft, setDraft, busy, err, onCancel, onSave }: { draft: Draft; setDraft: (d: Draft) => void; busy: boolean; err: string; onCancel: () => void; onSave: () => void }) {
  const sum = Math.round(draft.items.reduce((a, i) => a + (i.pct || 0), 0) * 100) / 100;
  const setItem = (k: number, pct: number) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === k ? { ...x, pct } : x)) });
  const equal = () => {
    const n = draft.items.length;
    if (!n) return;
    const base = Math.floor((100 / n) * 100) / 100;
    setDraft({ ...draft, items: draft.items.map((x, j) => ({ ...x, pct: j === 0 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base })) });
  };
  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">{draft.id ? "עריכת תוכנית" : "תוכנית חדשה"}</h3>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-muted">שם</span>
          <input className="input mt-1" value={draft.name} placeholder="למשל: חיסכון לדירה" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">סכום כל פעם (₪)</span>
          <input className="input num mt-1" type="number" min={10} step={10} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} />
        </label>
      </div>
      <div>
        <span className="text-xs text-muted">תדירות</span>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(["monthly", "weekly", "daily"] as const).map((f) => (
            <button key={f} className={`rounded-lg border px-3 py-2 text-sm ${draft.freq === f ? "border-brand bg-brand-soft font-semibold" : "border-line bg-white"}`} onClick={() => setDraft({ ...draft, freq: f, day: f === "weekly" ? 1 : f === "monthly" ? 1 : 0 })}>
              {FREQ_HE[f]}
            </button>
          ))}
        </div>
        {draft.freq === "monthly" && (
          <label className="flex items-center gap-2 text-sm mt-2">
            ביום
            <input className="input num w-20 py-1" type="number" min={1} max={31} value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) || 1 })} />
            בחודש <span className="text-xs text-muted">(בחודש קצר: ביום האחרון)</span>
          </label>
        )}
        {draft.freq === "weekly" && (
          <select className="input mt-2 w-40" value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i}>יום {w}</option>)}
          </select>
        )}
        {draft.freq === "daily" && <p className="text-xs text-muted mt-2">כל יום מסחר בארה&quot;ב (שני עד שישי). שים לב: הרבה פעולות קטנות מכלות מהר את מכסת העמלות החינמית.</p>}
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted">במה להשקיע</span>
          <span className="flex-1" />
          {draft.items.length > 1 && <button className="text-xs underline" onClick={equal}>חלוקה שווה</button>}
          <span className={`text-xs num ${draft.items.length && sum !== 100 ? "text-down font-bold" : "text-muted"}`}>{draft.items.length ? `סה"כ ${sum}%` : ""}</span>
        </div>
        <div className="space-y-1.5 mt-1">
          {draft.items.map((it, k) => (
            <div key={it.symbol} className="flex items-center gap-2">
              <b className="num w-20">{it.symbol}</b>
              <input className="input num w-24 py-1" type="number" min={0} max={100} step={1} value={it.pct} onChange={(e) => setItem(k, Number(e.target.value) || 0)} />
              <span className="text-muted">%</span>
              <span className="text-xs text-muted num">≈ {money((draft.amount * (it.pct || 0)) / 100, "ILS", 0)}</span>
              <span className="flex-1" />
              <button className="text-xs text-down underline" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== k) })}>הסר</button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <SymbolSearch
            placeholder="הוסף נייר לתוכנית…"
            onPick={(s) => {
              if (draft.items.some((x) => x.symbol === s)) return;
              setDraft({ ...draft, items: [...draft.items, { symbol: s, pct: draft.items.length ? 0 : 100 }] });
            }}
          />
        </div>
      </div>

      <div>
        <span className="text-xs text-muted">מאיפה הכסף</span>
        <div className="grid sm:grid-cols-2 gap-2 mt-1">
          <button className={`text-start rounded-lg border px-3 py-2 ${draft.source === "deposit" ? "border-brand bg-brand-soft" : "border-line bg-white"}`} onClick={() => setDraft({ ...draft, source: "deposit" })}>
            <b className="block text-sm">💰 הפקדה חדשה</b>
            <small className="text-xs text-muted">כמו הוראת קבע מהבנק: כסף חדש נכנס ומושקע</small>
          </button>
          <button className={`text-start rounded-lg border px-3 py-2 ${draft.source === "cash" ? "border-brand bg-brand-soft" : "border-line bg-white"}`} onClick={() => setDraft({ ...draft, source: "cash" })}>
            <b className="block text-sm">💵 מהמזומן שבתיק</b>
            <small className="text-xs text-muted">משקיעים בהדרגה כסף שכבר יושב בתיק. אם אין מספיק, הפעם מדולגת</small>
          </button>
        </div>
      </div>

      {err && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{err}</div>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy || (draft.items.length > 0 && sum !== 100)} onClick={onSave}>{busy ? "שומר…" : "שמירה"}</button>
        <button className="btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}
