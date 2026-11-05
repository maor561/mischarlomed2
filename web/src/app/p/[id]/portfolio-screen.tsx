"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, dateHe, money } from "@/lib/format";
import type { PortfolioView, Stop } from "@/lib/engine/service";
import OrderForm, { type OrderPrefill } from "./order-form";
import FxForm from "./fx-form";
import HistoryPanel from "./history-panel";
import TaxPanel from "./tax-panel";
import TimeBar, { type AdvanceResult } from "./time-bar";
import StopModal from "./stop-modal";
import JourneyChart from "./journey-chart";
import ReportPanel from "./report-panel";
import OverviewPanel from "./overview-panel";

/** חמש לשוניות ראשיות (D20). "עוד" מכילה את המסכים הפחות שכיחים */
type Tab = "overview" | "order" | "chart" | "history" | "cash" | "tax" | "report" | "details";
const MAIN = [
  { k: "overview", icon: "💼", label: "התיק שלי" },
  { k: "order", icon: "📝", label: "מסחר" },
  { k: "chart", icon: "📈", label: "מול המדד" },
  { k: "history", icon: "📜", label: "היסטוריה" },
  { k: "more", icon: "☰", label: "עוד" },
] as const;
const MORE: { k: Tab; label: string; timeOnly?: boolean }[] = [
  { k: "cash", label: "💱 מזומן ומט\"ח" },
  { k: "tax", label: "🧾 מס ועלויות" },
  { k: "report", label: "📊 דו\"ח המסע", timeOnly: true },
  { k: "details", label: "⚙️ פרטי התיק" },
];
const mainOf = (t: Tab) => (["cash", "tax", "report", "details"].includes(t) ? "more" : t);

export default function PortfolioScreen() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const [v, setV] = useState<PortfolioView | null>(null);
  const [err, setErr] = useState("");
  // קישור מדף נייר: ?tab=order&side=buy&symbol=AAPL
  const [tab, setTabState] = useState<Tab>(() => (sp.get("tab") as Tab) || "overview");
  const [prefill, setPrefill] = useState<OrderPrefill | null>(() => {
    const symbol = sp.get("symbol");
    return symbol ? { side: sp.get("side") === "sell" ? "sell" : "buy", symbol, qty: Number(sp.get("qty") ?? 1) || 1 } : null;
  });
  const [fxPrefill, setFxPrefill] = useState<number | null>(null);
  const [orderKey, setOrderKey] = useState(0);
  const [flash, setFlash] = useState("");
  const [stop, setStop] = useState<Stop | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resume, setResume] = useState(0);

  const setTab = (t: Tab) => {
    setTabState(t);
    window.scrollTo({ top: 0 });
  };

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

  const onAdvanced = useCallback(
    async (r: AdvanceResult | null, error?: string) => {
      if (!r) {
        setFlash(`⚠️ ${error}`);
        return;
      }
      await load();
      if (r.stop) {
        setStop(r.stop);
        setFlash("");
      } else if (r.entries) setFlash(`⏩ ${dateHe(r.to)} · ${r.entries} תנועות חדשות ביומן`);
    },
    [load],
  );

  async function remove() {
    if (!v || !confirm(`למחוק את התיק "${v.portfolio.name}" עם כל ההיסטוריה שלו? אי אפשר לבטל.`)) return;
    await api(`/api/portfolios/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (err && !v) return <main className="max-w-6xl mx-auto p-6"><div className="card bg-down-soft text-down">{err}</div></main>;
  if (!v) return <main className="max-w-6xl mx-auto p-6"><div className="card text-muted">טוען תיק… (בפעם הראשונה מורידים היסטוריית מחירים)</div></main>;

  const p = v.portfolio;
  const isTime = p.mode === "time";
  const version = `${p.simDate}-${v.history.length}-${v.pending.length}`;
  const more = MORE.filter((m) => !m.timeOnly || isTime);
  const active = mainOf(tab);
  const goMain = (k: (typeof MAIN)[number]["k"]) => setTab(k === "more" ? (active === "more" ? tab : "cash") : k);
  const trade = (side: "buy" | "sell", symbol: string, qty?: number) => {
    setPrefill({ side, symbol, qty: qty ?? 1 });
    setTab("order");
  };

  return (
    <>
      {isTime ? (
        <TimeBar id={id} view={v} onAdvanced={onAdvanced} onPlayingChange={setPlaying} resume={resume} />
      ) : (
        <div className="px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap border-b bg-card border-line">
          <b className="text-base">{p.name}</b>
          <span className="text-xs px-2 py-0.5 rounded-full bg-down-soft text-down">🔴 חי</span>
          <span className="text-sm">
            היום: <b className="num">{dateHe(p.simDate)}</b>
          </span>
          <span className="flex-1" />
          <span className="text-xs text-muted num">דולר: ₪{v.fx.toFixed(4)}</span>
        </div>
      )}
      {stop && (
        <StopModal
          stop={stop}
          blind={p.blind}
          onClose={() => setStop(null)}
          onContinue={() => {
            setStop(null);
            setResume((n) => n + 1);
          }}
          onOrder={() => {
            setStop(null);
            setTab("order");
          }}
          onReport={() => {
            setStop(null);
            setTab("report");
          }}
        />
      )}
      {flash && (
        <div className="px-4 md:px-6 py-2 text-sm bg-brand-soft text-brand flex">
          <span className="flex-1">{flash}</span>
          <button onClick={() => setFlash("")}>✕</button>
        </div>
      )}

      <main className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-6 space-y-4">
        {/* מחשב: לשוניות למעלה */}
        <div className="hidden md:flex gap-1 border-b border-line">
          {MAIN.map((x) => (
            <button key={x.k} onClick={() => goMain(x.k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${active === x.k ? "border-brand text-brand font-semibold" : "border-transparent text-muted"}`}>
              {x.icon} {x.label}
              {x.k === "history" && v.pending.length > 0 && <span className="ms-1 text-xs bg-warn-soft text-warn rounded-full px-1.5">{v.pending.length}</span>}
            </button>
          ))}
        </div>
        {active === "more" && (
          <div className="flex gap-1.5 flex-wrap">
            {more.map((m) => (
              <button key={m.k} className={`chip ${tab === m.k ? "chip-on" : ""}`} onClick={() => setTab(m.k)}>
                {m.label}
              </button>
            ))}
          </div>
        )}

        {tab === "overview" && <OverviewPanel id={id} view={v} version={version} onTrade={trade} onTab={setTab} />}

        {/* טופס הפקודה נשאר טעון (מוסתר) כדי שלא יתאפס כשקופצים להמרה וחוזרים */}
        <div hidden={tab !== "order"}>
          <OrderForm
            key={`${orderKey}-${prefill ? `${prefill.side}-${prefill.symbol}` : "new"}`}
            id={id}
            view={v}
            prefill={prefill}
            onDone={async (msg) => { setFlash(msg); setPrefill(null); setOrderKey((k) => k + 1); await load(); setTab("history"); }}
            onNeedCash={(ils) => { setFxPrefill(ils); setTab("cash"); }}
            playing={playing}
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
        {tab === "chart" && <JourneyChart id={id} version={version} />}
        {tab === "report" && <ReportPanel id={id} version={version} />}
        {tab === "details" && (
          <div className="card text-sm space-y-1.5 max-w-xl">
            <h3 className="font-semibold">פרטי התיק</h3>
            <div>נפתח ב-<span className="num">{dateHe(p.startDate)}</span> עם <span className="num">{money(p.initialCapital, "ILS", 0)}</span></div>
            {isTime && <div>סוף המסע: <span className="num">{p.endDate ? dateHe(p.endDate) : "עד היום"}</span></div>}
            <div>עמלות: {p.fees.kind === "bank" ? "🏦 בנק" : p.fees.kind === "online" ? "💻 ברוקר אונליין" : "✏️ מותאם"} (קנייה/מכירה בארה&quot;ב {p.fees.usPct}%, מינימום ${p.fees.usMin} · המרה {p.fees.fxPct}% · משמרת {p.fees.custodyPctYear}% לשנה)</div>
            {p.deposit && <div>הפקדה: <span className="num">{money(p.deposit.amount, "ILS", 0)}</span> ב-{p.deposit.day} לחודש{p.deposit.autoBuy && <> · קנייה אוטומטית של <b className="num">{p.deposit.autoBuy}</b></>}</div>}
            <div>מדד השוואה: {p.benchmark === "TA125" ? "ת\"א-125" : "S&P 500"}</div>
            <button className="text-xs text-down underline pt-3" onClick={remove}>מחיקת התיק</button>
          </div>
        )}
      </main>

      {/* טלפון: סרגל תחתון (D20) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-line grid grid-cols-5 text-center pb-[env(safe-area-inset-bottom)]">
        {MAIN.map((x) => (
          <button key={x.k} onClick={() => goMain(x.k)} className={`pt-1.5 pb-2 text-[11px] relative ${active === x.k ? "text-brand font-bold" : "text-muted"}`}>
            <span className="block text-lg leading-tight">{x.icon}</span>
            {x.label}
            {x.k === "history" && v.pending.length > 0 && <span className="absolute top-1 left-1/2 ms-2 w-2 h-2 rounded-full bg-warn" />}
          </button>
        ))}
      </nav>
    </>
  );
}
