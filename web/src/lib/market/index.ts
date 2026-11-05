/**
 * שירות נתוני שוק: מטמון היסטוריה במסד הנתונים + מחירים חיים.
 *
 * היסטוריה: בפעם הראשונה מורידים את כל ההיסטוריה של הנייר ושומרים.
 * אחר כך מרעננים רק את הימים האחרונים, לכל היותר פעם ב-6 שעות.
 * העבר לא משתנה, ולכן מכונת הזמן לא תלויה בספק אחרי ההורדה הראשונה.
 *
 * "כפי שנסחר" (asTraded): הספק מחזיר מחירים מותאמים לפיצולים. מכונת הזמן צריכה
 * להציג את המחיר שראו באותו יום (Apple ב-9.3.2020: ‎$266 ולא ‎$66), ולכן
 * מכפילים במכפלת הפיצולים שקרו אחרי התאריך.
 */
import { query } from "../db";
import { fetchChart, search as yahooSearch, type Bar, type ChartResult, type CorpEvent, type InstrumentMeta } from "./yahoo";

export type { Bar, CorpEvent, InstrumentMeta };
export const USD_ILS = "ILS=X";

const REFRESH_MS = 6 * 3600_000;
const LIVE_MS = 60_000;

/* ---------- סנכרון היסטוריה ---------- */

const inflight = new Map<string, Promise<void>>();

export function normalizeSymbol(s: string): string {
  return s.trim().toUpperCase();
}

async function save(meta: InstrumentMeta, bars: Bar[], events: CorpEvent[]) {
  await query(
    `INSERT INTO instruments (symbol,name,exchange,currency,kind,timezone,first_trade,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (symbol) DO UPDATE SET name=$2,exchange=$3,currency=$4,kind=$5,timezone=$6,first_trade=$7,updated_at=now()`,
    [meta.symbol, meta.name, meta.exchange, meta.currency, meta.kind, meta.timezone, meta.firstTrade],
  );
  for (let i = 0; i < bars.length; i += 500) {
    const chunk = bars.slice(i, i + 500);
    const params: unknown[] = [];
    const rows = chunk.map((b, j) => {
      params.push(meta.symbol, b.d, b.open, b.high, b.low, b.close, b.volume);
      const k = j * 7;
      return `($${k + 1},$${k + 2},$${k + 3},$${k + 4},$${k + 5},$${k + 6},$${k + 7})`;
    });
    await query(
      `INSERT INTO price_bars (symbol,d,open,high,low,close,volume) VALUES ${rows.join(",")}
       ON CONFLICT (symbol,d) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume`,
      params,
    );
  }
  for (const e of events) {
    await query(
      `INSERT INTO corporate_events (symbol,d,kind,value) VALUES ($1,$2,$3,$4)
       ON CONFLICT (symbol,d,kind) DO UPDATE SET value=EXCLUDED.value`,
      [meta.symbol, e.d, e.kind, e.value],
    );
  }
}

async function doSync(symbol: string, existing: { last_bar: string | null } | undefined) {
  // הורדה מלאה בפעם הראשונה; אחר כך רק 14 הימים האחרונים
  const fromEpoch = existing?.last_bar ? Math.floor(Date.parse(existing.last_bar) / 1000) - 14 * 86400 : 0;
  const chart = await fetchChart(symbol, { fromEpoch });
  if (existing?.last_bar && chart.events.some((e) => e.kind === "split" && e.d > existing.last_bar!)) {
    // פיצול חדש: כל המחירים הקודמים אצל הספק השתנו, ולכן מורידים הכול מחדש
    await query(`DELETE FROM price_bars WHERE symbol=$1`, [symbol]);
    const full = await fetchChart(symbol, { fromEpoch: 0 });
    await save(full.meta, full.bars, full.events);
  } else {
    await save(chart.meta, chart.bars, chart.events);
  }
  rememberLive(symbol, chart);
  const last = chart.bars.at(-1)?.d ?? existing?.last_bar ?? null;
  await query(
    `INSERT INTO history_sync (symbol,last_bar,synced_at) VALUES ($1,$2,now())
     ON CONFLICT (symbol) DO UPDATE SET last_bar=$2,synced_at=now()`,
    [symbol, last],
  );
}

/** מוודא שההיסטוריה של הנייר נמצאת במטמון ועדכנית */
export async function ensureHistory(symbolIn: string): Promise<void> {
  const symbol = normalizeSymbol(symbolIn);
  const [row] = await query<{ last_bar: string | null; synced_at: string }>(
    `SELECT last_bar::text AS last_bar, synced_at::text AS synced_at FROM history_sync WHERE symbol=$1`,
    [symbol],
  );
  if (row && Date.now() - Date.parse(row.synced_at) < REFRESH_MS) return;
  if (!inflight.has(symbol)) {
    inflight.set(symbol, doSync(symbol, row).finally(() => inflight.delete(symbol)));
  }
  try {
    await inflight.get(symbol);
  } catch (e) {
    if (!row) throw e; // אין מטמון בכלל
    console.warn(`רענון ${symbol} נכשל, ממשיכים עם המטמון:`, e);
  }
}

/* ---------- קריאה ---------- */

export async function getInstrument(symbolIn: string): Promise<InstrumentMeta | null> {
  const symbol = normalizeSymbol(symbolIn);
  await ensureHistory(symbol);
  const [r] = await query<Record<string, string | null>>(
    `SELECT symbol,name,exchange,currency,kind,timezone,first_trade::text AS first_trade FROM instruments WHERE symbol=$1`,
    [symbol],
  );
  if (!r) return null;
  return { symbol: r.symbol!, name: r.name!, exchange: r.exchange!, currency: r.currency!, kind: r.kind!, timezone: r.timezone, firstTrade: r.first_trade };
}

async function getEvents(symbol: string): Promise<CorpEvent[]> {
  return query<CorpEvent>(
    `SELECT d::text AS d, kind, value FROM corporate_events WHERE symbol=$1 ORDER BY d`,
    [symbol],
  );
}

/** המכפיל שמחזיר מחיר מותאם-פיצולים למחיר שנסחר בפועל בתאריך d */
export function asTradedFactor(d: string, events: CorpEvent[]): number {
  let f = 1;
  for (const e of events) if (e.kind === "split" && e.d > d) f *= e.value;
  return f;
}

export type HistoryOpts = { from?: string; to?: string; asTraded?: boolean };

export async function getHistory(symbolIn: string, opts: HistoryOpts = {}): Promise<Bar[]> {
  const symbol = normalizeSymbol(symbolIn);
  await ensureHistory(symbol);
  const bars = await query<Bar>(
    `SELECT d::text AS d, open, high, low, close, volume FROM price_bars
     WHERE symbol=$1 AND d >= $2 AND d <= $3 ORDER BY d`,
    [symbol, opts.from ?? "1900-01-01", opts.to ?? "2999-12-31"],
  );
  if (!opts.asTraded) return bars;
  const events = await getEvents(symbol);
  if (!events.some((e) => e.kind === "split")) return bars;
  return bars.map((b) => {
    const f = asTradedFactor(b.d, events);
    const m = (v: number | null) => (v == null ? v : v * f);
    return { ...b, open: m(b.open), high: m(b.high), low: m(b.low), close: b.close * f, volume: b.volume == null ? null : b.volume / f };
  });
}

/** מחיר הסגירה האחרון שידוע בתאריך d (כולל d), כפי שנסחר אז */
export async function priceOn(symbolIn: string, d: string): Promise<{ d: string; close: number } | null> {
  const symbol = normalizeSymbol(symbolIn);
  await ensureHistory(symbol);
  const [b] = await query<{ d: string; close: number }>(
    `SELECT d::text AS d, close FROM price_bars WHERE symbol=$1 AND d <= $2 ORDER BY d DESC LIMIT 1`,
    [symbol, d],
  );
  if (!b) return null;
  const f = asTradedFactor(b.d, await getEvents(symbol));
  return { d: b.d, close: b.close * f };
}

/** דיבידנדים בטווח, בסכום למניה כפי ששולם אז */
export async function dividends(symbolIn: string, from: string, to: string): Promise<CorpEvent[]> {
  const symbol = normalizeSymbol(symbolIn);
  await ensureHistory(symbol);
  const events = await getEvents(symbol);
  return events
    .filter((e) => e.kind === "div" && e.d >= from && e.d <= to)
    .map((e) => ({ ...e, value: e.value * asTradedFactor(e.d, events) }));
}

export async function splits(symbolIn: string): Promise<CorpEvent[]> {
  const symbol = normalizeSymbol(symbolIn);
  await ensureHistory(symbol);
  return (await getEvents(symbol)).filter((e) => e.kind === "split");
}

/* ---------- מחיר חי ---------- */

export type LiveQuote = ChartResult["live"] & { symbol: string; name: string; currency: string; exchange: string; fetchedAt: number };
const live = new Map<string, LiveQuote>();

function rememberLive(symbol: string, c: ChartResult) {
  live.set(symbol, { ...c.live, symbol, name: c.meta.name, currency: c.meta.currency, exchange: c.meta.exchange, fetchedAt: Date.now() });
}

/** מחיר עכשיו (אצל הספק באיחור של כ-15 דקות), במטמון לדקה */
export async function getQuote(symbolIn: string): Promise<LiveQuote> {
  const symbol = normalizeSymbol(symbolIn);
  const hit = live.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < LIVE_MS) return hit;
  rememberLive(symbol, await fetchChart(symbol, { range: "5d" }));
  return live.get(symbol)!;
}

/** שער דולר-שקל: עכשיו, או כפי שהיה בתאריך */
export async function usdIls(d?: string): Promise<number> {
  if (!d) return (await getQuote(USD_ILS)).price;
  const p = await priceOn(USD_ILS, d);
  if (!p) throw new Error(`אין שער דולר לתאריך ${d}`);
  return p.close;
}

export const search = yahooSearch;
