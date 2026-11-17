"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, dateHe, money } from "@/lib/format";
import type { PortfolioView, Stop } from "@/lib/engine/service";
import TradeSheet, { type TradeIntent } from "@/components/trade-sheet";
import FxForm from "./fx-form";
import HistoryPanel from "./history-panel";
import TaxPanel from "./tax-panel";
import PlansPanel, { planWhen, type PlanPrefill } from "./plans-panel";
import StorePanel from "./store-panel";
import TimeBar, { type AdvanceResult } from "./time-bar";
import StopModal from "./stop-modal";
import JourneyChart from "./journey-chart";
import ReportPanel from "./report-panel";
import AnalysisPanel from "./overview-panel";
import JournalPanel from "./journal-panel";
import HomePanel from "./home-panel";
import MorePanel, { MORE_ITEMS, type MoreTab } from "./more-panel";
import type { Journal } from "@/lib/mentor/journal";

type Main = "home" | "store" | "plans" | "more";
type Tab = Main | MoreTab;
const MAIN: { k: Main | "learn"; icon: string; label: string }[] = [
  { k: "home", icon: "🏠", label: "בית" },
  { k: "store", icon: "🛍️", label: "חנות" },
  { k: "plans", icon: "🔁", label: "תוכניות" },
  { k: "learn", icon: "🎓", label: "ללמוד" },
  { k: "more", icon: "☰", label: "עוד" },
];
const TITLES: Record<Tab, string> = {
  home: "בית", store: "חנות", plans: "תוכניות קבועות", more: "עוד",
  ...Object.fromEntries(MORE_ITEMS.map((m) => [m.k, `${m.icon} ${m.title}`])),
} as Record<Tab, string>;
const isMain = (t: Tab): t is Main => ["home", "store", "plans", "more"].includes(t);

/** כתובות ישנות (?tab=overview / order / cash) ממשיכות לעבוד */
function tabFromUrl(t: string | null): Tab {
  if (!t || t === "overview" || t === "order") return "home";
  if (["home", "store", "plans", "more", ...MORE_ITEMS.map((m) => m.k)].includes(t)) return t as Tab;
  return "home";
}

/**
 * מסך התיק בגרסה 2 (סקיצה 07, D30): סרגל תחתון בטלפון, תפריט צד במחשב,
 * חלון קנייה שנפתח מכל מקום, ו"עוד" לכל השאר.
 */
export default function PortfolioScreen() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const [v, setV] = useState<PortfolioView | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTabState] = useState<Tab>(() => tabFromUrl(sp.get("tab")));
  // קישור מדף נייר / משימה: ?tab=order&side=buy&symbol=AAPL פותח את חלון הקנייה
  const [trade, setTrade] = useState<TradeIntent | null>(() => {
    if (sp.get("tab") !== "order") return null;
    const qty = sp.get("qty") ? Number(sp.get("qty")) || undefined : undefined;
    return { side: sp.get("side") === "sell" ? "sell" : "buy", symbol: sp.get("symbol"), qty };
  });
  const [fxPrefill, setFxPrefill] = useState<number | null>(null);
  const [planPrefill, setPlanPrefill] = useState<PlanPrefill | null>(() => {
    const s = sp.get("tab") === "plans" ? sp.get("symbol") : null;
    return s ? { name: `השקעה קבועה ב-${s}`, symbols: [s] } : null;
  });
  const [flash, setFlash] = useState("");
  const [stop, setStop] = useState<Stop | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resume, setResume] = useState(0);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [jv, setJv] = useState(0);

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

  const versionKey = v ? `${v.portfolio.simDate}-${v.history.length}-${v.pending.length}-${jv}` : "";
  useEffect(() => {
    if (!versionKey) return;
    let alive = true;
    api<Journal>(`/api/portfolios/${id}/journal`).then((x) => alive && setJournal(x), () => {});
    return () => {
      alive = false;
    };
  }, [id, versionKey]);

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
  const due = journal?.dueCount ?? 0;
  const activeMain: Main = isMain(tab) ? tab : "more";
  const go = (k: Main | "learn") => (k === "learn" ? router.push("/lessons") : setTab(k));
  const openTrade = (t: TradeIntent) => setTrade(t);

  const navBadge = (k: string) =>
    k === "more" && due > 0 ? <span className="absolute top-1 left-1/2 ms-2 w-2 h-2 rounded-full bg-plum" /> : null;

  return (
    <div className="md:flex min-h-screen">
      {/* מחשב: תפריט צד */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 bg-card border-e border-line px-3 py-5 sticky top-0 h-screen">
        <Link href="/" className="text-lg font-extrabold px-3 pb-4">📈 מסחר־לומד</Link>
        {[...MAIN.slice(0, 4), { k: "journal" as const, icon: "📓", label: "יומן" }, MAIN[4]].map((x) => {
          const on = x.k === "journal" ? tab === "journal" : x.k !== "learn" && activeMain === x.k && !(x.k === "more" && tab === "journal");
          return (
            <button
              key={x.k}
              onClick={() => (x.k === "journal" ? setTab("journal") : go(x.k))}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl font-semibold text-start mb-0.5 ${on ? "bg-ink text-white" : "text-ink-2 hover:bg-soft"}`}
            >
              <span>{x.icon}</span>
              <span className="flex-1">{x.label}</span>
              {x.k === "journal" && due > 0 && <span className="pill !px-2 bg-plum text-white">⏰{due}</span>}
            </button>
          );
        })}
        <span className="flex-1" />
        <div className="px-3 text-xs text-muted">
          <b className="block text-ink text-sm truncate">{p.name}</b>
          {isTime ? (p.blind ? "🎭 מסע עיוור" : "⏳ מכונת זמן") : "🔴 תיק חי"}
          <Link href="/" className="block underline mt-1">החלפת תיק</Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
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
              openTrade({ side: "buy" });
            }}
            onReport={() => {
              setStop(null);
              setTab("report");
            }}
            onNote={async (text) => {
              await api(`/api/portfolios/${id}/journal/note`, { method: "POST", json: { text, context: stop.title } });
              setJv((n) => n + 1);
            }}
          />
        )}

        <main className="max-w-5xl mx-auto p-4 md:p-6 pb-28 md:pb-8 space-y-4">
          {isTime ? (
            <TimeBar id={id} view={v} onAdvanced={onAdvanced} onPlayingChange={setPlaying} resume={resume} />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <b className="md:hidden">{p.name}</b>
              <span className="pill bg-down-soft text-down">🔴 חי · <span className="num">{dateHe(p.simDate)}</span></span>
              <span className="flex-1" />
              <span className="text-xs text-muted num">דולר: ₪{v.fx.toFixed(3)}</span>
            </div>
          )}

          {flash && (
            <div className="rounded-2xl px-4 py-2.5 text-sm bg-plum-soft text-ink flex gap-2">
              <span className="flex-1">{flash}</span>
              <button onClick={() => setFlash("")} aria-label="סגירה">✕</button>
            </div>
          )}

          {!isMain(tab) && (
            <div className="flex items-center gap-2">
              <button className="text-sm text-muted" onClick={() => setTab("more")}>→ עוד</button>
              <h1 className="text-xl font-extrabold">{TITLES[tab]}</h1>
            </div>
          )}
          {tab === "store" && <h1 className="text-xl font-extrabold">חנות</h1>}
          {tab === "more" && <h1 className="text-xl font-extrabold">עוד</h1>}

          {tab === "home" && <HomePanel id={id} view={v} version={version} journal={journal} onTrade={openTrade} onTab={setTab} />}
          {tab === "store" && (
            <StorePanel
              id={id}
              version={version}
              onBought={async (msg) => { setFlash(msg); await load(); setTab("home"); }}
              onPlan={(name, symbols) => { setPlanPrefill({ name, symbols }); setTab("plans"); }}
            />
          )}
          {tab === "plans" && <PlansPanel key={planPrefill ? planPrefill.name : "plans"} id={id} view={v} onChange={load} prefill={planPrefill} />}
          {tab === "more" && <MorePanel isTime={isTime} dueCount={due} onOpen={setTab} />}

          {tab === "journal" && <JournalPanel key={journal ? "loaded" : "loading"} id={id} journal={journal} onChange={() => setJv((n) => n + 1)} />}
          {tab === "chart" && <JourneyChart id={id} version={version} />}
          {tab === "analysis" && <AnalysisPanel id={id} view={v} version={version} />}
          {tab === "history" && <HistoryPanel id={id} view={v} onChange={load} />}
          {tab === "tax" && <TaxPanel view={v} />}
          {tab === "report" && <ReportPanel id={id} version={version} />}
          {tab === "cash" && (
            <FxForm
              key={fxPrefill ?? "none"}
              id={id}
              view={v}
              prefill={fxPrefill}
              onDone={async (msg) => {
                setFlash(msg);
                setFxPrefill(null);
                await load();
              }}
            />
          )}
          {tab === "details" && (
            <div className="card text-sm space-y-1.5 max-w-xl">
              <div>נפתח ב-<span className="num">{dateHe(p.startDate)}</span> עם <span className="num">{money(p.initialCapital, "ILS", 0)}</span></div>
              {isTime && <div>סוף המסע: <span className="num">{p.endDate ? dateHe(p.endDate) : "עד היום"}</span></div>}
              <div>עמלות: {p.fees.kind === "bank" ? "🏦 בנק" : p.fees.kind === "online" ? "💻 ברוקר אונליין" : p.fees.kind === "app" ? "📱 אפליקציה" : "✏️ מותאם"} ({p.fees.app ? <>בארה&quot;ב {p.fees.app.freeActions} פעולות או {p.fees.app.freeShares} מניות בחודש חינם, ואז ${p.fees.app.perShare} למניה, מינימום ${p.fees.app.min}</> : <>קנייה/מכירה בארה&quot;ב {p.fees.usPct}%, מינימום ${p.fees.usMin}</>} · המרה {p.fees.fxPct}% · משמרת {p.fees.custodyPctYear}% לשנה)</div>
              {p.plans.map((pl) => (
                <div key={pl.id}>🔁 {pl.name}: <span className="num">{money(pl.amount, "ILS", 0)}</span> {planWhen(pl)}{pl.status === "paused" && " (מושהית)"}</div>
              ))}
              <div>מדד השוואה: {p.benchmark === "TA125" ? "ת\"א-125" : "S&P 500"}</div>
              <button className="text-xs text-down underline pt-3" onClick={remove}>מחיקת התיק</button>
            </div>
          )}
        </main>
      </div>

      {trade && (
        <TradeSheet
          key={`${trade.side}-${trade.symbol ?? ""}`}
          id={id}
          intent={trade}
          view={v}
          playing={playing}
          onClose={() => setTrade(null)}
          onDone={async (msg) => {
            setTrade(null);
            setFlash(msg);
            await load();
          }}
        />
      )}

      {/* טלפון: סרגל תחתון */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-line grid grid-cols-5 text-center pb-[env(safe-area-inset-bottom)]">
        {MAIN.map((x) => {
          const on = x.k !== "learn" && activeMain === x.k;
          return (
            <button key={x.k} onClick={() => go(x.k)} className={`pt-2 pb-2 text-[11px] relative ${on ? "text-ink font-bold" : "text-muted"}`}>
              <span className={`block text-xl leading-tight ${on ? "" : "grayscale opacity-60"}`}>{x.icon}</span>
              {x.label}
              {navBadge(x.k)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
