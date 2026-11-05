"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, dateHe, money, pct, signed, tone } from "@/lib/format";
import type { PortfolioView } from "@/lib/engine/service";
import OrderForm, { type OrderPrefill } from "./order-form";
import FxForm from "./fx-form";
import HistoryPanel from "./history-panel";
import TaxPanel from "./tax-panel";

const TABS = [
  { k: "overview", label: "סקירה" },
  { k: "order", label: "פקודה" },
  { k: "cash", label: "מזומן ומט\"ח" },
  { k: "history", label: "פקודות והיסטוריה" },
  { k: "tax", label: "מס ועלויות" },
] as const;
type Tab = (typeof TABS)[number]["k"];

function addDays(d: string, n: number) {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export default function PortfolioScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [v, setV] = useState<PortfolioView | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null);
  const [fxPrefill, setFxPrefill] = useState<number | null>(null);
  const [orderKey, setOrderKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    try {
      setV(await api<PortfolioView>(`/api/portfolios/${id}`));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    api<PortfolioView>(`/api/portfolios/${id}`).then(
      (x) => alive && setV(x),
      (e) => alive && setErr((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  async function advance(days: number) {
    if (!v) return;
    setBusy(true);
    try {
      const r = await api<{ from: string; to: string; entries: number }>(`/api/portfolios/${id}/advance`, { method: "POST", json: { to: addDays(v.portfolio.simDate, days) } });
      setFlash(`⏩ הזמן התקדם ל-${dateHe(r.to)}${r.entries ? ` · ${r.entries} תנועות חדשות ביומן` : ""}`);
      await load();
    } catch (e) {
      setFlash(`⚠️ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!v || !confirm(`למחוק את התיק "${v.portfolio.name}" עם כל ההיסטוריה שלו? אי אפשר לבטל.`)) return;
    await api(`/api/portfolios/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (err && !v) return <main className="max-w-6xl mx-auto p-6"><div className="card bg-down-soft text-down">{err}</div></main>;
  if (!v) return <main className="max-w-6xl mx-auto p-6"><div className="card text-muted">טוען תיק… (בפעם הראשונה מורידים היסטוריית מחירים)</div></main>;

  const p = v.portfolio;
  const t = v.totals;
  const isTime = p.mode === "time";

  return (
    <>
      <div className={`px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap border-b ${isTime ? "bg-time-soft border-[#ddd2f7]" : "bg-card border-line"}`}>
        <b className="text-base">{p.name}</b>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isTime ? "bg-time text-white" : "bg-down-soft text-down"}`}>{isTime ? "⏳ מכונת זמן" : "🔴 חי"}</span>
        <span className="text-sm">
          {isTime ? "התאריך בסימולציה:" : "היום:"} <b className={`num ${isTime ? "text-time" : ""}`}>{dateHe(p.simDate)}</b>
        </span>
        {isTime && (
          <div className="flex gap-1.5 items-center">
            <span className="text-xs text-muted">קדימה:</span>
            {[
              [1, "+יום"],
              [7, "+שבוע"],
              [30, "+חודש"],
              [365, "+שנה"],
            ].map(([n, l]) => (
              <button key={n} disabled={busy} className="chip" onClick={() => advance(n as number)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        <span className="text-xs text-muted num">דולר: ₪{v.fx.toFixed(4)}</span>
      </div>
      {flash && (
        <div className="px-4 md:px-6 py-2 text-sm bg-brand-soft text-brand flex">
          <span className="flex-1">{flash}</span>
          <button onClick={() => setFlash("")}>✕</button>
        </div>
      )}

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Kpi label="שווי התיק" value={money(t.total, "ILS", 0)} sub={`הופקדו ${money(t.deposited, "ILS", 0)}`} />
          <Kpi label="רווח/הפסד נטו" value={signed(t.pnl, "ILS", 0)} sub={pct(t.pnlPct)} cls={tone(t.pnl)} />
          <Kpi label="מזומן (בשקלים)" value={money(t.cashIls, "ILS", 0)} sub={`${t.total ? Math.round((t.cashIls / t.total) * 100) : 0}% מהתיק`} />
          <Kpi label="בהחזקות" value={money(t.holdingsIls, "ILS", 0)} sub={`${v.positions.length} ניירות`} />
        </div>

        <div className="flex gap-1 border-b border-line overflow-x-auto">
          {TABS.map((x) => (
            <button key={x.k} onClick={() => setTab(x.k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === x.k ? "border-brand text-brand font-semibold" : "border-transparent text-muted"}`}>
              {x.label}
              {x.k === "history" && v.pending.length > 0 && <span className="ms-1 text-xs bg-warn-soft text-warn rounded-full px-1.5">{v.pending.length}</span>}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="card overflow-x-auto">
              <h3 className="font-semibold mb-2">ההחזקות שלי</h3>
              {v.positions.length === 0 ? (
                <p className="text-muted text-sm py-4">
                  עוד אין מניות בתיק. <button className="text-brand underline" onClick={() => setTab("order")}>לשליחת פקודה ראשונה</button>
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted border-b border-line">
                      <th className="text-start py-2">נייר</th><th className="text-start">כמות</th><th className="text-start">קנייה ממוצעת</th><th className="text-start">מחיר</th><th className="text-start">שווי (₪)</th><th className="text-start">רווח/הפסד</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {v.positions.map((x) => (
                      <tr key={x.symbol} className="border-b border-line">
                        <td className="py-2"><b className="num">{x.symbol}</b> <span className="text-xs text-muted">{x.currency === "USD" ? "ארה\"ב" : "ת\"א"}</span></td>
                        <td className="num">{x.qty}</td>
                        <td className="num">{money(x.avgCost, x.currency)}</td>
                        <td className="num">{money(x.price, x.currency)}</td>
                        <td className="num">{money(x.valueIls, "ILS", 0)}</td>
                        <td className={`num ${tone(x.pnlIls)}`} title={`במטבע הנייר: ${signed(x.pnlCcy, x.currency)}`}>{signed(x.pnlIls, "ILS", 0)}</td>
                        <td>
                          <button className="text-xs text-down underline" onClick={() => { setPrefill({ side: "sell", symbol: x.symbol, qty: x.qty }); setTab("order"); }}>
                            מכירה
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-xs text-muted mt-2">רווח/הפסד בשקלים כולל את השינוי בשער הדולר ואת עמלות הקנייה. מחיר הקנייה הממוצע כולל עמלה.</p>
            </div>
            <div className="space-y-4">
              <div className="card space-y-2">
                <h3 className="font-semibold">הקופות</h3>
                <Wallet flag="🇮🇱" label="שקלים" amount={v.cash.ILS} ccy="ILS" reserved={v.reserved.ILS} />
                <Wallet flag="🇺🇸" label="דולרים" amount={v.cash.USD} ccy="USD" reserved={v.reserved.USD} />
                <button className="text-sm text-brand underline" onClick={() => setTab("cash")}>להמרה בין הקופות</button>
              </div>
              <div className="card text-sm space-y-1">
                <h3 className="font-semibold">פרטי התיק</h3>
                <div>נפתח ב-<span className="num">{dateHe(p.startDate)}</span> עם <span className="num">{money(p.initialCapital, "ILS", 0)}</span></div>
                <div>עמלות: {p.fees.kind === "bank" ? "🏦 בנק" : p.fees.kind === "online" ? "💻 ברוקר אונליין" : "✏️ מותאם"}</div>
                {p.deposit && <div>הפקדה: <span className="num">{money(p.deposit.amount, "ILS", 0)}</span> ב-{p.deposit.day} לחודש{p.deposit.autoBuy && <> · קנייה אוטומטית של <b className="num">{p.deposit.autoBuy}</b></>}</div>}
                <button className="text-xs text-down underline pt-2" onClick={remove}>מחיקת התיק</button>
              </div>
            </div>
          </div>
        )}

        {/* טופס הפקודה נשאר טעון (מוסתר) כדי שלא יתאפס כשקופצים להמרה וחוזרים */}
        <div hidden={tab !== "order"}>
          <OrderForm
            key={`${orderKey}-${prefill ? `${prefill.side}-${prefill.symbol}` : "new"}`}
            id={id}
            view={v}
            prefill={prefill}
            onDone={async (msg) => { setFlash(msg); setPrefill(null); setOrderKey((k) => k + 1); await load(); setTab("history"); }}
            onNeedCash={(ils) => { setFxPrefill(ils); setTab("cash"); }}
          />
        </div>
        {tab === "cash" && (
          <FxForm
            key={fxPrefill ?? "none"}
            id={id}
            view={v}
            prefill={fxPrefill}
            onDone={async (msg) => {
              setFlash(fxPrefill ? `${msg} · חזרת לפקודה, ואפשר לשלוח אותה` : msg);
              const back = fxPrefill != null;
              setFxPrefill(null);
              await load();
              if (back) setTab("order");
            }}
          />
        )}
        {tab === "history" && <HistoryPanel id={id} view={v} onChange={load} />}
        {tab === "tax" && <TaxPanel view={v} />}
      </main>
    </>
  );
}

function Kpi({ label, value, sub, cls = "" }: { label: string; value: string; sub: string; cls?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-bold num mt-1 ${cls}`}>{value}</div>
      <div className="text-xs text-muted num">{sub}</div>
    </div>
  );
}

function Wallet({ flag, label, amount, ccy, reserved }: { flag: string; label: string; amount: number; ccy: string; reserved: number }) {
  return (
    <div className="flex justify-between items-baseline rounded-lg bg-bg px-3 py-2">
      <span>{flag} {label}</span>
      <span className="text-end">
        <b className={`num text-lg ${amount < 0 ? "text-down" : ""}`}>{money(amount, ccy)}</b>
        {reserved > 0 && <span className="block text-xs text-muted num">מתוכם {money(reserved, ccy)} שמורים לפקודות</span>}
      </span>
    </div>
  );
}
