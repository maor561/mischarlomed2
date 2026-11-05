"use client";

import { useState } from "react";
import { api, money } from "@/lib/format";
import type { PortfolioView } from "@/lib/engine/service";

export default function FxForm({ id, view, prefill, onDone }: { id: string; view: PortfolioView; prefill: number | null; onDone: (msg: string) => void }) {
  const [from, setFrom] = useState<"ILS" | "USD">("ILS");
  const [amount, setAmount] = useState<number>(prefill ?? 1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fx = view.fx;
  const fee = Math.round(amount * view.portfolio.fees.fxPct) / 100;
  const received = from === "ILS" ? (amount - fee) / fx : (amount - fee) * fx;
  const to = from === "ILS" ? "USD" : "ILS";
  const free = view.cash[from] - view.reserved[from];

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ received: number }>(`/api/portfolios/${id}/fx`, { method: "POST", json: { from, amount } });
      onDone(`💱 הומרו ${money(amount, from)} וקיבלת ${money(r.received, to)}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-2">
        <h3 className="font-semibold">הקופות שלי</h3>
        {(["ILS", "USD"] as const).map((c) => (
          <div key={c} className="flex justify-between items-baseline rounded-lg bg-bg px-3 py-3">
            <span>{c === "ILS" ? "🇮🇱 שקלים" : "🇺🇸 דולרים"}<span className="block text-xs text-muted">{c === "ILS" ? "לקניית מניות בת\"א ולהמרה" : "לקניית מניות בארה\"ב"}</span></span>
            <span className="text-end">
              <b className="num text-xl">{money(view.cash[c], c)}</b>
              {view.reserved[c] > 0 && <span className="block text-xs text-muted num">פנוי {money(view.cash[c] - view.reserved[c], c)}</span>}
            </span>
          </div>
        ))}
        <p className="text-sm text-muted">
          שווי הקופות בשקלים: <b className="num">{money(view.totals.cashIls, "ILS")}</b> (שער <span className="num">{fx.toFixed(4)}</span>)
        </p>
        <div className="text-sm rounded-lg p-2.5 bg-brand-soft text-[#1d3c9e]">
          💡 אם הדולר יתחזק אחרי שקנית מניה אמריקאית, תרוויח גם אם המניה לא זזה. אם הוא ייחלש, תפסיד. זו &quot;חשיפה למט&quot;ח&quot;.
        </div>
      </div>
      <div className="card space-y-3">
        <h3 className="font-semibold">המרה</h3>
        <div className="grid grid-cols-2 gap-2">
          <button className={`py-2 rounded-lg border ${from === "ILS" ? "bg-up text-white border-up" : "bg-white border-line"}`} onClick={() => setFrom("ILS")}>שקל ← דולר</button>
          <button className={`py-2 rounded-lg border ${from === "USD" ? "bg-up text-white border-up" : "bg-white border-line"}`} onClick={() => setFrom("USD")}>דולר ← שקל</button>
        </div>
        <label className="block">
          <span className="text-xs text-muted">סכום להמרה ({from === "ILS" ? "₪" : "$"}) · פנוי {money(free, from)}</span>
          <input className="input num mt-1" type="number" min={1} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span>שער באותו יום</span><span className="num">{fx.toFixed(4)}</span></div>
          <div className="flex justify-between"><span>עמלת המרה ({view.portfolio.fees.fxPct}%)</span><span className="num">−{money(fee, from)}</span></div>
          <div className="flex justify-between"><span>שער בפועל</span><span className="num">{received > 0 ? (from === "ILS" ? amount / received : received / amount).toFixed(4) : "—"}</span></div>
          <div className="flex justify-between font-bold border-t border-line pt-2"><span>תקבל</span><span className="num">{money(received, to)}</span></div>
        </div>
        {err && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{err}</div>}
        <button className="btn w-full" disabled={busy || !(amount > 0) || amount > free + 0.005} onClick={submit}>
          {busy ? "ממיר…" : "המר"}
        </button>
      </div>
    </div>
  );
}
