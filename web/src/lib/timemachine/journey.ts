/**
 * מכונת הזמן: סדרת השווי מול המדד, דו"ח סוף מסע, גרף נייר עד יום הסימולציה, והסתרת תאריכים במצב עיוור.
 */
import { getHistory, getInstrument, USD_ILS } from "../market";
import { addDays, convert, round2, todayIL, tradeFee } from "../engine/money";
import { apply, emptyState } from "../engine/state";
import { BENCH, FEE_PRESETS, type Ccy, type LedgerEntry, type Portfolio } from "../engine/types";
import { buildMarket, loadLedger, loadOrders, loadPortfolio, UserError, valueOn, type LoadedMarket } from "../engine/service";
import { EVENTS } from "./events";

export const isFinished = (p: Portfolio) => p.mode === "time" && !!p.endDate && p.simDate >= p.endDate;

/* ---------- הסתרת תאריכים (D15) ---------- */

/** במסע עיוור שעוד לא הסתיים: כל תאריך הופך ל-"@ימים מההתחלה", השנים ב"שנה N", ושם התקופה מוסתר */
export function mask<T>(p: Portfolio, data: T): T {
  if (!p.blind || isFinished(p)) return data;
  const start = Date.parse(p.startDate);
  const startYear = Number(p.startDate.slice(0, 4));
  const text = JSON.stringify(data).replace(/\b(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?)?/g, (_, d: string) => `@${Math.round((Date.parse(d) - start) / 86400_000)}`);
  const out = JSON.parse(text, (k, v) => (k === "periodName" ? null : v));
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    const rec = o as Record<string, unknown>;
    if (typeof rec.year === "number" && rec.year > 1900) rec.year = `שנה ${rec.year - startYear + 1}`;
    Object.values(rec).forEach(walk);
  };
  walk(out);
  return out;
}

/* ---------- סדרת שווי ---------- */

type Point = { d: string; v: number; dep: number; b: number };

async function compute(id: number) {
  const p = await loadPortfolio(id);
  const ledger = (await loadLedger(id)).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.id ?? 0) - (b.id ?? 0)));
  const end = p.mode === "time" ? p.simDate : todayIL();
  const bench = BENCH[p.benchmark];
  const syms = new Set(ledger.filter((e) => e.symbol).map((e) => e.symbol!));
  syms.add(bench.asset);
  syms.add(bench.index);
  const m = await buildMarket(p, syms, end, addDays(p.startDate, -400));
  // קרן סל ומדד כבר מפוזרים בעצמם, ולכן לא נספרים כ"ריכוז במניה אחת"
  const diversified = new Set<string>();
  for (const sym of syms) {
    const meta = await getInstrument(sym);
    if (meta && meta.kind !== "EQUITY") diversified.add(sym);
  }

  // לפני שהקרן SPY קיימת (1993) משווים למדד עצמו
  const asset = m.closeOn(bench.asset, p.startDate) != null ? bench.asset : bench.index;
  const assetCcy: Ccy = m.currency(asset);
  let units = 0;
  const benchBuy = (amountIls: number, d: string) => {
    const px = m.closeOn(asset, d);
    if (!px || amountIls <= 0) return;
    if (assetCcy === "USD") {
      const usd = convert(p.fees, "ILS", amountIls, m.fx(d)).received;
      units += (usd - tradeFee(p.fees, "USD", usd)) / px;
    } else units += (amountIls - tradeFee(p.fees, "ILS", amountIls)) / px;
  };
  const benchValue = (d: string) => units * (m.closeOn(asset, d) ?? 0) * (assetCcy === "USD" ? m.fx(d) : 1);

  const days = (m.series.get(USD_ILS)?.bars ?? []).map((b) => b.d).filter((d) => d >= p.startDate && d <= end);
  if (!days.length || days[0] > p.startDate) days.unshift(p.startDate);

  const s = emptyState();
  let li = 0, deposits = 0, prevDep = 0, lastV = 0, lastB = 0, nav = 1, bnav = 1, peak = 1, peakD = p.startDate;
  let dd = { pct: 0, peakD: p.startDate, troughD: p.startDate };
  let maxW = { symbol: "", pct: 0, d: p.startDate };
  let cashSum = 0, cashN = 0;
  const all: Point[] = [];

  for (const d of days) {
    while (li < ledger.length && ledger[li].d <= d) {
      const e = ledger[li++];
      apply(s, e);
      if (e.kind === "deposit") {
        deposits += e.cashIls;
        benchBuy(e.cashIls, e.d);
      }
    }
    const div = m.series.get(asset)?.divs.get(d);
    if (div && units > 0) units += (units * div * 0.75) / (m.closeOn(asset, d) ?? 1); // דיבידנד נטו מושקע מחדש
    const V = valueOn(s, m, d);
    const B = benchValue(d);
    const depToday = deposits - prevDep;
    if (lastV > 0) nav *= (V - depToday) / lastV;
    if (lastB > 0) bnav *= (B - depToday) / lastB;
    lastV = V;
    lastB = B;
    prevDep = deposits;
    if (nav > peak) {
      peak = nav;
      peakD = d;
    }
    const draw = (nav / peak - 1) * 100;
    if (draw < dd.pct) dd = { pct: round2(draw), peakD, troughD: d };
    if (V > 0) {
      for (const pos of s.positions.values()) {
        if (diversified.has(pos.symbol)) continue;
        const w = (pos.qty * (m.closeOn(pos.symbol, d) ?? 0) * (pos.currency === "USD" ? m.fx(d) : 1)) / V;
        if (w > maxW.pct) maxW = { symbol: pos.symbol, pct: w, d };
      }
      cashSum += (s.cash.ILS + s.cash.USD * m.fx(d)) / V;
      cashN++;
    }
    all.push({ d, v: round2(V), dep: round2(deposits), b: round2(B) });
  }

  // דילול לגרף: עד כ-400 נקודות
  const step = Math.max(1, Math.ceil(all.length / 400));
  const points = all.filter((_, i) => i % step === 0 || i === all.length - 1);
  const last = all.at(-1) ?? { v: 0, dep: 0, b: 0, d: end };
  const pct = (x: number) => (deposits ? round2(((x - deposits) / deposits) * 100) : 0);

  const series = {
    benchLabel: BENCH[p.benchmark].label,
    benchAsset: asset,
    points,
    final: { value: last.v, bench: last.b, deposits: round2(deposits) },
    ret: { portfolio: pct(last.v), bench: pct(last.b), twr: round2((nav - 1) * 100), benchTwr: round2((bnav - 1) * 100) },
    drawdown: dd,
    /** כמה התיק מתחת לשיא שלו עכשיו (תשואה משוקללת זמן) */
    currentFromPeak: round2((nav / peak - 1) * 100),
    maxWeight: { ...maxW, pct: round2(maxW.pct * 100) },
    avgCashPct: cashN ? round2((cashSum / cashN) * 100) : 100,
    events: p.blind ? [] : EVENTS.filter((e) => e.d >= p.startDate && e.d <= end),
  };
  return { p, ledger, m, s, end, series, index: bench.index };
}

export async function journeySeries(id: number) {
  return (await compute(id)).series;
}

/* ---------- דו"ח סוף מסע (D16) ---------- */

function indexFromPeak(m: LoadedMarket, sym: string, d: string): number | null {
  const bars = m.series.get(sym)?.bars;
  if (!bars) return null;
  let i = -1;
  for (let k = 0; k < bars.length && bars[k].d <= d; k++) i = k;
  if (i < 0) return null;
  const hi = Math.max(...bars.slice(Math.max(0, i - 252), i + 1).map((b) => b.close));
  return (bars[i].close / hi - 1) * 100;
}

export async function journeyReport(id: number) {
  const { p, ledger, m, s, end, series, index } = await compute(id);
  const orders = new Map((await loadOrders(id, false)).map((o) => [o.id, o]));
  const fx = m.fx(end);

  const sells = ledger.filter((e) => e.kind === "sell");
  const trades = sells.map((e) => {
    const costIls = Number(e.meta.costIls ?? 0);
    const gain = Number(e.meta.gainIls ?? 0);
    return { d: e.d, symbol: e.symbol!, qty: -e.qty, gainIls: gain, pct: costIls ? round2((gain / costIls) * 100) : 0, why: e.orderId ? orders.get(e.orderId)?.why ?? null : null, heldDays: (e.meta.heldDays as number) ?? null, e };
  });
  // מניות שעדיין בתיק נספרות כעסקה פתוחה
  const open = [...s.positions.values()].map((pos) => {
    const valueIls = pos.qty * (m.closeOn(pos.symbol, end) ?? 0) * (pos.currency === "USD" ? fx : 1);
    const costIls = pos.lots.reduce((a, l) => a + l.costIls, 0);
    const firstBuy = ledger.find((e) => e.kind === "buy" && e.symbol === pos.symbol);
    return { d: end, symbol: pos.symbol, qty: pos.qty, gainIls: round2(valueIls - costIls), pct: costIls ? round2(((valueIls - costIls) / costIls) * 100) : 0, why: firstBuy?.orderId ? orders.get(firstBuy.orderId)?.why ?? null : null, heldDays: null, open: true };
  });
  const allTrades = [...trades.map((t) => ({ ...t, open: false })), ...open];
  const best = allTrades.length ? allTrades.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = allTrades.length ? allTrades.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  // מכירה בפאניקה: בהפסד, כשהשוק היה 15%+ מתחת לשיא. כמה היה שווה להחזיק עד היום
  let panic: null | { d: string; symbol: string; qty: number; pct: number; why: string | null; missedIls: number; marketFromPeak: number } = null;
  for (const t of trades) {
    const mfp = indexFromPeak(m, index, t.d);
    if (mfp == null || mfp > -15 || t.gainIls >= 0) continue;
    let factor = 1;
    for (const [sd, r] of m.series.get(t.symbol)?.splits ?? []) if (sd > t.d && sd <= end) factor *= r;
    const ccy = (t.e.meta.currency as Ccy) ?? "USD";
    const nowIls = t.qty * factor * (m.closeOn(t.symbol, end) ?? 0) * (ccy === "USD" ? fx : 1);
    const proceeds = (Number(t.e.meta.gross ?? 0) - Number(t.e.meta.feeNative ?? 0)) * (ccy === "USD" ? t.e.fxRate ?? fx : 1);
    const missed = round2(nowIls - proceeds);
    if (missed > 0 && (!panic || missed > panic.missedIls)) panic = { d: t.d, symbol: t.symbol, qty: t.qty, pct: t.pct, why: t.why, missedIls: missed, marketFromPeak: round2(mfp) };
  }

  const taxPaid = [...s.years.values()].reduce((a, y) => a + y.taxPaid + y.divTax, 0);
  const costs = { trade: round2(s.costs.trade), fx: round2(s.costs.fx), custody: round2(s.costs.custody), tax: round2(taxPaid) };
  const fees = costs.trade + costs.fx + costs.custody;

  // אותן תנועות בעמלות בנק (קנייה/מכירה והמרה)
  let bankFees = 0;
  if (p.fees.kind !== "bank") {
    const bank = FEE_PRESETS.bank;
    for (const e of ledger) {
      const ccy = (e.meta.currency as Ccy) ?? "USD";
      const rate = e.fxRate ?? fx;
      if (e.kind === "buy" || e.kind === "sell") bankFees += tradeFee(bank, ccy, Number(e.meta.gross ?? 0)) * (ccy === "USD" ? rate : 1);
      if (e.kind === "fx") bankFees += ((Number(e.meta.amount) || 0) * bank.fxPct) / 100 * ((e.meta.from as Ccy) === "USD" ? rate : 1);
    }
    bankFees += (series.final.deposits * bank.custodyPctYear) / 100 * ((Date.parse(end) - Date.parse(p.startDate)) / (365.25 * 86400_000));
  }
  const tradeFeesOnly = costs.trade + costs.fx;

  const whatIf = [
    ...(panic ? [{ text: `לא היית מוכר את ${panic.symbol} ב-${panic.d}, כשהשוק היה ${Math.abs(panic.marketFromPeak).toFixed(0)}% מתחת לשיא`, ils: panic.missedIls }] : []),
    { text: `היית רק קונה את ${series.benchLabel} בכל הפקדה ולא נוגע`, ils: round2(series.final.bench - series.final.value) },
    ...(p.fees.kind !== "bank" ? [{ text: "היית בבנק במקום בברוקר אונליין (הערכה)", ils: -round2(bankFees - tradeFeesOnly) }] : []),
  ];

  // שלוש תובנות לפי כללים קבועים (בחבילה 5 המנטור יכתוב אותן)
  const lessons: string[] = [];
  // הפער מחושב מהמספרים כפי שהם מוצגים (ספרה אחת אחרי הנקודה), כדי שהדו"ח והגרף יראו אותו פער
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const diff = r1(r1(series.ret.portfolio) - r1(series.ret.bench));
  if (panic) lessons.push(`המכירה הכי יקרה שלך הייתה של ${panic.symbol}, כשהשוק היה ${Math.abs(panic.marketFromPeak).toFixed(0)}% מתחת לשיא. אילו החזקת, היית מרוויח עוד ₪${Math.round(panic.missedIls).toLocaleString("he-IL")}. מכירה בשפל היא הטעות הכי נפוצה של משקיעים מתחילים.`);
  if (series.maxWeight.pct > 25) lessons.push(`מניה אחת (${series.maxWeight.symbol}) הגיעה ל-${series.maxWeight.pct.toFixed(0)}% מהתיק. כשמניה אחת היא חלק גדול כל כך, מה שקורה לחברה אחת קובע את כל התוצאה. פיזור מגביל את הנזק.`);
  if (allTrades.length === 0) lessons.push("לא ביצעת אף עסקה, והכסף נשאר במזומן. במסע הבא נסה לפחות לקנות את המדד בהתחלה, ולראות מה קורה לו.");
  else if (diff >= 1) lessons.push(`ניצחת את ${series.benchLabel} ב-${diff.toFixed(1)}%. כדאי לבדוק אם זה בזכות החלטה שאפשר לחזור עליה, או בגלל מזל של מניה אחת.`);
  else if (diff <= -1) lessons.push(`פיגרת אחרי ${series.benchLabel} ב-${Math.abs(diff).toFixed(1)}%. רוב המשקיעים הפעילים מפגרים אחרי המדד לאורך זמן, ולכן הרבה בוחרים פשוט לקנות אותו.`);
  if (series.avgCashPct > 30 && allTrades.length) lessons.push(`בממוצע ${series.avgCashPct.toFixed(0)}% מהתיק ישב במזומן. ${series.ret.bench > 0 ? "כשהשוק עולה, מזומן שלא מושקע מפספס את העלייה." : "בתקופה יורדת המזומן הגן עליך, אבל קשה לדעת מראש מתי לצאת ומתי לחזור."}`);
  if (series.final.deposits && fees / series.final.deposits > 0.01) lessons.push(`העמלות לקחו ${((fees / series.final.deposits) * 100).toFixed(1)}% מהכסף שהפקדת. עסקאות רבות ועמלות גבוהות שוחקות את התשואה.`);

  const heldList = trades.map((t) => t.heldDays).filter((x): x is number => x != null);
  return {
    finished: isFinished(p),
    reveal: p.blind && isFinished(p) ? { start: p.startDate, end: p.endDate, name: p.periodName } : null,
    period: { start: p.startDate, end },
    series,
    costs,
    trades: {
      count: ledger.filter((e) => e.kind === "buy" || e.kind === "sell").length,
      best: best && { ...best, e: undefined },
      worst: worst && worst !== best ? { ...worst, e: undefined } : null,
      panic,
      avgHeldDays: heldList.length ? Math.round(heldList.reduce((a, b) => a + b, 0) / heldList.length) : null,
    },
    investedPct: round2(100 - series.avgCashPct),
    whatIf,
    lessons: lessons.slice(0, 3),
  };
}

/* ---------- גרף נייר עד יום הסימולציה ---------- */

export async function instrumentChart(id: number, symbol: string, days: number) {
  const p = await loadPortfolio(id);
  const meta = await getInstrument(symbol);
  if (!meta) throw new UserError("נייר לא נמצא");
  const end = p.mode === "time" ? p.simDate : todayIL();
  if (meta.firstTrade && meta.firstTrade > end) throw new UserError(`${meta.symbol} עוד לא נסחרה ב-${end}`);
  const bars = await getHistory(meta.symbol, { from: addDays(end, -Math.min(Math.max(days, 7), 3650)), to: end, asTraded: true });
  return { symbol: meta.symbol, name: meta.name, currency: meta.currency, bars: bars.map((b) => ({ d: b.d, c: round2(b.close) })) };
}

export type JourneySeries = Awaited<ReturnType<typeof journeySeries>>;
export type JourneyReport = Awaited<ReturnType<typeof journeyReport>>;
export type InstrumentChart = Awaited<ReturnType<typeof instrumentChart>>;
export type { LedgerEntry };
