"use client";

import { useState } from "react";
import { api, dateHe, money } from "@/lib/format";
import type { PortfolioView } from "@/lib/engine/service";
import type { LedgerEntry, Order } from "@/lib/engine/types";

const TYPE_HE = { market: "שוק", limit: "לימיט", stop: "סטופ" };
const STATUS = {
  expired: { label: "פג תוקף", cls: "bg-[#eee] text-[#777]" },
  cancelled: { label: "בוטלה", cls: "bg-[#eee] text-[#777]" },
  rejected: { label: "נדחתה", cls: "bg-down-soft text-down" },
  filled: { label: "בוצעה", cls: "bg-up-soft text-up" },
  pending: { label: "ממתינה", cls: "bg-warn-soft text-warn" },
};
const KIND = {
  deposit: { label: "הפקדה", cls: "bg-bg" },
  fx: { label: "המרה", cls: "bg-bg" },
  buy: { label: "קנייה", cls: "bg-up-soft text-up" },
  sell: { label: "מכירה", cls: "bg-up-soft text-up" },
  dividend: { label: "דיבידנד", cls: "bg-brand-soft text-brand" },
  split: { label: "פיצול", cls: "bg-time-soft text-time" },
  custody: { label: "דמי משמרת", cls: "bg-bg" },
};

function orderText(o: Order) {
  const what = `${o.side === "buy" ? "קנייה" : "מכירה"} ${o.qty ?? `ב-${money(o.budget, o.currency)}`} ${o.symbol}`;
  const cond = o.type === "market" ? "שוק" : `${TYPE_HE[o.type]} ${money(o.price, o.currency)}`;
  return { what, cond };
}

function entryText(e: LedgerEntry): { details: string; total: string; fee: string; tax: string } {
  const ccy = (e.meta.currency as string) ?? "USD";
  const nf = Number(e.meta.feeNative ?? 0);
  switch (e.kind) {
    case "deposit":
      return { details: e.meta.initial ? "הון התחלתי" : "הפקדה חודשית", total: "+" + money(e.cashIls), fee: "", tax: "" };
    case "fx": {
      const from = e.meta.from as string;
      const to = from === "ILS" ? "USD" : "ILS";
      return { details: `${money(Number(e.meta.amount), from)} → ${to === "USD" ? "דולר" : "שקל"} · שער ${e.fxRate?.toFixed(4)}${e.meta.auto ? " · אוטומטי" : ""}`, total: "+" + money(Number(e.meta.received), to), fee: money(e.fee), tax: "" };
    }
    case "buy":
      return { details: `${e.symbol} · ${e.qty} יח' × ${money(e.price, ccy)}`, total: money(ccy === "USD" ? e.cashUsd : e.cashIls, ccy), fee: money(nf, ccy), tax: "" };
    case "sell":
      return {
        details: `${e.symbol} · ${-e.qty} יח' × ${money(e.price, ccy)} · ${Number(e.meta.gainIls) >= 0 ? "רווח" : "הפסד"} ${money(Math.abs(Number(e.meta.gainIls)))}`,
        total: "+" + money(ccy === "USD" ? e.cashUsd : e.cashIls, ccy),
        fee: money(nf, ccy),
        tax: e.tax > 0 ? `−${money(e.tax)}` : e.tax < 0 ? `החזר ${money(-e.tax)}` : "0",
      };
    case "dividend":
      return { details: `${e.symbol} · ${e.meta.shares} יח' × ${money(e.price, ccy, 4)}`, total: "+" + money(ccy === "USD" ? e.cashUsd : e.cashIls, ccy), fee: "", tax: `−${money(Number(e.meta.taxNative), ccy)} (25%)` };
    case "split": {
      const r = Number(e.meta.ratio);
      return { details: `${e.symbol} פוצלה ${r >= 1 ? `${r}:1` : `1:${Math.round(1 / r)}`} · ${e.meta.before} מניות הן עכשיו ${e.meta.after}`, total: Number(e.meta.cashInLieu) ? "+" + money(Number(e.meta.cashInLieu), ccy) : "", fee: "", tax: "" };
    }
    case "custody":
      return { details: `רבעון שהסתיים · על שווי ${money(Number(e.meta.valueIls), "ILS", 0)}`, total: money(e.cashIls), fee: "", tax: "" };
  }
}

export default function HistoryPanel({ id, view, onChange }: { id: string; view: PortfolioView; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const cancel = async (oid: number) => {
    setBusy(oid);
    try {
      await api(`/api/portfolios/${id}/orders/${oid}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusy(null);
    }
  };
  const notFilled = view.orders.filter((o) => o.status !== "filled");

  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-2">⏳ ממתינות ({view.pending.length})</h3>
        {view.pending.length === 0 ? (
          <p className="text-sm text-muted">אין פקודות ממתינות.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line"><th className="text-start py-1.5">נשלחה</th><th className="text-start">פקודה</th><th className="text-start">תנאי</th><th className="text-start">תוקף</th><th className="text-start">שמור בקופה</th><th /></tr>
            </thead>
            <tbody>
              {view.pending.map((o) => {
                const t = orderText(o);
                return (
                  <tr key={o.id} className="border-b border-line">
                    <td className="py-2 num">{dateHe(o.createdD)}</td>
                    <td>{t.what}{o.source === "auto" && <span className="text-xs text-muted"> · הוראת קבע</span>}</td>
                    <td className="num">{t.cond}</td>
                    <td>{o.validity === "day" ? "יום מסחר אחד" : `עד ${dateHe(o.expiresD)}`}</td>
                    <td className="num">{o.reserved ? money(o.reserved, o.currency) : "—"}</td>
                    <td><button className="text-xs text-down underline" disabled={busy === o.id} onClick={() => cancel(o.id)}>ביטול</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-2">📜 יומן תנועות</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-line"><th className="text-start py-1.5">תאריך</th><th className="text-start">סוג</th><th className="text-start">פרטים</th><th className="text-start">עמלה</th><th className="text-start">מס</th><th className="text-start">שינוי בקופה</th></tr>
          </thead>
          <tbody>
            {view.history.map((e) => {
              const t = entryText(e);
              const k = KIND[e.kind];
              return (
                <tr key={e.id} className="border-b border-line align-top">
                  <td className="py-2 num whitespace-nowrap">{dateHe(e.d)}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${k.cls}`}>{k.label}</span></td>
                  <td>{t.details}</td>
                  <td className="num whitespace-nowrap">{t.fee}</td>
                  <td className="num whitespace-nowrap">{t.tax}</td>
                  <td className="num whitespace-nowrap">{t.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notFilled.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-2">פקודות שלא בוצעו</h3>
          <table className="w-full text-sm">
            <tbody>
              {notFilled.map((o) => {
                const t = orderText(o);
                const st = STATUS[o.status];
                return (
                  <tr key={o.id} className="border-b border-line">
                    <td className="py-2 num">{dateHe(o.createdD)}</td>
                    <td><span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                    <td>{t.what} · <span className="num">{t.cond}</span></td>
                    <td className="text-muted">{o.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
