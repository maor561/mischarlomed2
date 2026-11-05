"use client";

import { useEffect, useMemo, useState } from "react";

type Hit = { symbol: string; name: string; exchange: string; kind: string };
type Bar = { d: string; close: number };
type Ev = { d: string; kind: string; value: number };
type Data = {
  meta: { symbol: string; name: string; exchange: string; currency: string; kind: string; firstTrade: string | null };
  quote: { price: number; prevClose: number | null; time: string; high52: number | null; low52: number | null };
  bars: Bar[];
  splits: Ev[];
  dividends: Ev[];
  at: { d: string; close: number } | null;
  usdIls: number;
};

const RANGES = [
  { k: "1m", label: "חודש", days: 31 },
  { k: "1y", label: "שנה", days: 365 },
  { k: "5y", label: "5 שנים", days: 5 * 365 },
  { k: "max", label: "הכול", days: 0 },
] as const;

const KIND_HE: Record<string, string> = { EQUITY: "מניה", ETF: "קרן סל", INDEX: "מדד", CURRENCY: "מטבע" };
const QUICK = ["VOO", "AAPL", "TEVA.TA", "LUMI.TA", "QQQ", "ILS=X"];

const sym = (c: string) => (c === "ILS" ? "₪" : c === "USD" ? "$" : c + " ");
const fmt = (n: number, d = 2) => n.toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d });
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

export default function DataCheck() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [symbol, setSymbol] = useState("AAPL");
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("5y");
  const [on, setOn] = useState("2020-03-09");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      setHits(Array.isArray(j) ? j : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const days = RANGES.find((r) => r.k === range)!.days;
    const params = new URLSearchParams({ on });
    if (days) params.set("from", daysAgo(days));
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`/api/instrument/${encodeURIComponent(symbol)}?${params}`);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setData(j);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, range, on]);

  const pick = (s: string) => {
    setSymbol(s);
    setQ("");
    setHits([]);
  };

  const m = data?.meta;
  const cur = m ? sym(m.currency) : "";
  const chg = data?.quote.prevClose ? (data.quote.price / data.quote.prevClose - 1) * 100 : null;
  const onIls = data?.at && m ? (m.currency === "USD" ? data.at.close * data.usdIls : data.at.close) : null;

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold">בדיקת נתונים</h1>
        <span className="flex-1" />
        <span className="text-xs text-muted">מקור: Yahoo Finance · מחיר חי באיחור של כ-15 דק&apos;</span>
      </header>

      <div className="card space-y-3">
        <div className="relative">
          <input className="input" placeholder="🔍 חפש מניה או קרן סל: Apple, טבע, S&P 500…" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.length > 0 && q.length >= 2 && (
            <ul className="absolute z-10 inset-x-0 mt-1 bg-white border border-line rounded-lg shadow-lg max-h-72 overflow-auto">
              {hits.map((h) => (
                <li key={h.symbol}>
                  <button className="w-full text-start px-3 py-2 hover:bg-brand-soft flex gap-2 items-baseline" onClick={() => pick(h.symbol)}>
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
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted">לבדיקה מהירה:</span>
          {QUICK.map((s) => (
            <button key={s} className={`chip num ${s === symbol ? "chip-on" : ""}`} onClick={() => pick(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="card bg-down-soft text-down">שגיאה: {err}</div>}

      {m && data && (
        <div className={`grid gap-4 md:grid-cols-[2fr_1fr] ${loading ? "opacity-60" : ""}`}>
          <div className="card space-y-3">
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{m.name}</h2>
                <span className="num text-muted">{m.symbol}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-soft text-brand">
                  {KIND_HE[m.kind] ?? m.kind} · {m.exchange}
                </span>
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl font-bold num">
                  {cur}
                  {fmt(data.quote.price, m.kind === "CURRENCY" ? 4 : 2)}
                </span>
                {chg != null && (
                  <span className={`num ${chg >= 0 ? "text-up" : "text-down"}`}>
                    {chg >= 0 ? "+" : ""}
                    {fmt(chg)}%
                  </span>
                )}
                <span className="text-xs text-muted">עודכן {new Date(data.quote.time).toLocaleString("he-IL")}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {RANGES.map((r) => (
                <button key={r.k} className={`chip ${r.k === range ? "chip-on" : ""}`} onClick={() => setRange(r.k)}>
                  {r.label}
                </button>
              ))}
            </div>
            <Chart bars={data.bars} splits={data.splits} marker={data.at?.d} />
            <p className="text-xs text-muted">
              הגרף מציג את המחיר <b>כפי שנסחר באותו יום</b>. פיצולי מניות מופיעים כקו מקווקו, כי במקומות האלה המחיר &quot;קופץ&quot; בלי שמישהו הרוויח או הפסיד.
            </p>
          </div>

          <div className="space-y-4">
            <div className="card space-y-2 bg-time-soft border-[#ddd2f7]">
              <h3 className="font-semibold text-time">⏳ תצוגה מקדימה למכונת הזמן</h3>
              <label className="block text-xs text-muted">
                תאריך
                <input type="date" className="input mt-1 num" value={on} onChange={(e) => e.target.value && setOn(e.target.value)} />
              </label>
              {data.at ? (
                <dl className="text-sm space-y-1">
                  <Row k="יום המסחר האחרון" v={<span className="num">{data.at.d}</span>} />
                  <Row k="מחיר סגירה" v={<span className="num">{cur}{fmt(data.at.close)}</span>} />
                  <Row k="שער דולר באותו יום" v={<span className="num">₪{fmt(data.usdIls, 4)}</span>} />
                  {m.currency === "USD" && onIls != null && <Row k="מניה אחת בשקלים" v={<span className="num">₪{fmt(onIls)}</span>} />}
                </dl>
              ) : (
                <p className="text-sm text-muted">הנייר עוד לא נסחר בתאריך הזה.</p>
              )}
            </div>
            <div className="card text-sm space-y-1">
              <Row k="מטבע" v={m.currency === "ILS" ? "שקל (הומר מאגורות)" : m.currency} />
              <Row k="נסחר מאז" v={<span className="num">{m.firstTrade ?? "—"}</span>} />
              <Row k="שיא / שפל 52 שבועות" v={<span className="num">{data.quote.high52 ? `${fmt(data.quote.low52 ?? 0)} – ${fmt(data.quote.high52)}` : "—"}</span>} />
              <Row k="ימי מסחר בגרף" v={<span className="num">{data.bars.length.toLocaleString("he-IL")}</span>} />
              <Row k="דיבידנדים בטווח" v={<span className="num">{data.dividends.length}</span>} />
              <Row
                k="פיצולים"
                v={
                  <span className="num">
                    {data.splits.length ? data.splits.map((s) => `${s.d} (${s.value >= 1 ? `${s.value}:1` : `1:${fmt(1 / s.value, 0)}`})`).join(" · ") : "אין"}
                  </span>
                }
              />
            </div>
          </div>
        </div>
      )}
      {!data && !err && <div className="card text-muted">טוען נתונים… (בפעם הראשונה מורידים את כל ההיסטוריה של הנייר)</div>}
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-end">{v}</dd>
    </div>
  );
}

function Chart({ bars, splits, marker }: { bars: Bar[]; splits: Ev[]; marker?: string }) {
  const W = 600,
    H = 200;
  const g = useMemo(() => {
    if (bars.length < 2) return null;
    const step = Math.max(1, Math.floor(bars.length / 600));
    const pts = bars.filter((_, i) => i % step === 0 || i === bars.length - 1);
    const ys = pts.map((b) => b.close);
    const lo = Math.min(...ys),
      hi = Math.max(...ys);
    const t0 = Date.parse(pts[0].d),
      t1 = Date.parse(pts.at(-1)!.d);
    // ציר הזמן מימין לשמאל? לא: גרפים פיננסיים נקראים משמאל לימין גם בעברית
    const x = (d: string) => ((Date.parse(d) - t0) / (t1 - t0 || 1)) * W;
    const y = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
    return {
      line: pts.map((b) => `${x(b.d).toFixed(1)},${y(b.close).toFixed(1)}`).join(" "),
      splits: splits.filter((s) => s.d >= pts[0].d && s.d <= pts.at(-1)!.d).map((s) => x(s.d)),
      marker: marker && marker >= pts[0].d && marker <= pts.at(-1)!.d ? x(marker) : null,
      lo,
      hi,
      from: pts[0].d,
      to: pts.at(-1)!.d,
    };
  }, [bars, splits, marker]);
  if (!g) return <div className="h-[200px] grid place-items-center text-muted">אין מספיק נתונים</div>;
  return (
    <div dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]" preserveAspectRatio="none">
        {g.splits.map((sx, i) => (
          <line key={i} x1={sx} x2={sx} y1={0} y2={H} stroke="var(--warn)" strokeDasharray="4 4" />
        ))}
        {g.marker != null && <line x1={g.marker} x2={g.marker} y1={0} y2={H} stroke="var(--time)" strokeWidth={2} />}
        <polyline fill="none" stroke="var(--brand)" strokeWidth={2} points={g.line} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-muted num">
        <span>{g.from}</span>
        <span>
          {fmt(g.lo)} – {fmt(g.hi)}
        </span>
        <span>{g.to}</span>
      </div>
    </div>
  );
}
