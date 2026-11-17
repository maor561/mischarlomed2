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
  mem.delete(symbol);
  const last = chart.bars.at(-1)?.d ?? existing?.last_bar ?? null;
  await query(
    `INSERT INTO history_sync (symbol,last_bar,synced_at) VALUES ($1,$2,now())
     ON CONFLICT (symbol) DO UPDATE SET last_bar=$2,synced_at=now()`,
    [symbol, last],
  );
}

/** האם ההיסטוריה של הנייר כבר הורדה פעם אחת (בלי להוריד) */
export async function isCached(symbolIn: string): Promise<boolean> {
  const symbol = normalizeSymbol(symbolIn);
  if (mem.has(symbol)) return true;
  const [r] = await query(`SELECT 1 FROM history_sync WHERE symbol=$1`, [symbol]);
  return !!r;
}

/*
 * מטמון בזיכרון השרת (גרסה 2, ביצועים): בענן כל שאילתה היא נסיעה ברשת ל-Neon,
 * ומסך אחד שאל עשרות פעמים על אותם מחירים. ההיסטוריה של נייר נטענת פעם אחת לזיכרון
 * (3 שאילתות במקביל), ומתרעננת לכל היותר פעם ב-REFRESH_MS, כמו הסנכרון מול הספק.
 */
type Mem = { at: number; meta: InstrumentMeta | null; bars: Bar[]; events: CorpEvent[] };
const mem = new Map<string, Mem>();
const MEM_MAX = 120;
const memLoading = new Map<string, Promise<Mem>>();

async function loadMem(symbol: string): Promise<Mem> {
  const hit = mem.get(symbol);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit;
  if (!memLoading.has(symbol)) {
    const p = (async () => {
      await ensureHistory(symbol);
      const [rows, bars, events] = await Promise.all([
        query<Record<string, string | null>>(
          `SELECT symbol,name,exchange,currency,kind,timezone,first_trade::text AS first_trade FROM instruments WHERE symbol=$1`,
          [symbol],
        ),
        query<Bar>(`SELECT d::text AS d, open, high, low, close, volume FROM price_bars WHERE symbol=$1 ORDER BY d`, [symbol]),
        query<CorpEvent>(`SELECT d::text AS d, kind, value FROM corporate_events WHERE symbol=$1 ORDER BY d`, [symbol]),
      ]);
      const r = rows[0];
      const m: Mem = {
        at: Date.now(),
        meta: r ? { symbol: r.symbol!, name: r.name!, exchange: r.exchange!, currency: r.currency!, kind: r.kind!, timezone: r.timezone, firstTrade: r.first_trade } : null,
        bars: bars.map((b) => ({ ...b, open: num(b.open), high: num(b.high), low: num(b.low), close: Number(b.close), volume: num(b.volume) })),
        events: events.map((e) => ({ ...e, value: Number(e.value) })),
      };
      if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value!);
      mem.set(symbol, m);
      return m;
    })().finally(() => memLoading.delete(symbol));
    memLoading.set(symbol, p);
  }
  return memLoading.get(symbol)!;
}
const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * לחנות: חלון תאריכים לכמה ניירות בבת אחת, ב-3 שאילתות סה"כ (בלי הורדה מהספק).
 * מחזיר רק ניירות שכבר במטמון. המחירים "כפי שנסחרו".
 */
export async function windowBars(symbolsIn: string[], from: string, to: string): Promise<Map<string, { meta: InstrumentMeta; bars: Bar[] }>> {
  const symbols = symbolsIn.map(normalizeSymbol);
  const out = new Map<string, { meta: InstrumentMeta; bars: Bar[] }>();
  if (!symbols.length) return out;
  const [metas, bars, splitsRows] = await Promise.all([
    query<Record<string, string | null>>(
      `SELECT i.symbol,i.name,i.exchange,i.currency,i.kind,i.timezone,i.first_trade::text AS first_trade
       FROM instruments i JOIN history_sync h ON h.symbol=i.symbol WHERE i.symbol = ANY($1)`,
      [symbols],
    ),
    query<Bar & { symbol: string }>(
      `SELECT symbol, d::text AS d, open, high, low, close, volume FROM price_bars WHERE symbol = ANY($1) AND d >= $2 AND d <= $3 ORDER BY symbol, d`,
      [symbols, from, to],
    ),
    query<CorpEvent & { symbol: string }>(`SELECT symbol, d::text AS d, kind, value FROM corporate_events WHERE kind='split' AND symbol = ANY($1)`, [symbols]),
  ]);
  for (const r of metas) {
    out.set(r.symbol!, { meta: { symbol: r.symbol!, name: r.name!, exchange: r.exchange!, currency: r.currency!, kind: r.kind!, timezone: r.timezone, firstTrade: r.first_trade }, bars: [] });
  }
  for (const b of bars) {
    const o = out.get(b.symbol);
    if (!o) continue;
    const ev = splitsRows.filter((e) => e.symbol === b.symbol).map((e) => ({ ...e, value: Number(e.value) }));
    const f = ev.length ? asTradedFactor(b.d, ev) : 1;
    o.bars.push({ d: b.d, open: b.open == null ? null : Number(b.open) * f, high: b.high == null ? null : Number(b.high) * f, low: b.low == null ? null : Number(b.low) * f, close: Number(b.close) * f, volume: b.volume == null ? null : Number(b.volume) / f });
  }
  return out;
}

/** האינדקס של הנר האחרון שתאריכו ≤ d (חיפוש בינארי), או -1 */
function lastIndexOn(bars: Bar[], d: string): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].d <= d) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
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
  return (await loadMem(normalizeSymbol(symbolIn))).meta;
}

async function getEvents(symbol: string): Promise<CorpEvent[]> {
  return (await loadMem(symbol)).events;
}

/** המכפיל שמחזיר מחיר מותאם-פיצולים למחיר שנסחר בפועל בתאריך d */
export function asTradedFactor(d: string, events: CorpEvent[]): number {
  let f = 1;
  for (const e of events) if (e.kind === "split" && e.d > d) f *= e.value;
  return f;
}

export type HistoryOpts = { from?: string; to?: string; asTraded?: boolean };

export async function getHistory(symbolIn: string, opts: HistoryOpts = {}): Promise<Bar[]> {
  const { bars: all, events } = await loadMem(normalizeSymbol(symbolIn));
  const from = opts.from ?? "1900-01-01";
  const to = opts.to ?? "2999-12-31";
  const end = lastIndexOn(all, to);
  let start = lastIndexOn(all, from);
  if (start < 0 || all[start].d < from) start++;
  const bars = end >= start ? all.slice(Math.max(0, start), end + 1) : [];
  if (!opts.asTraded || !events.some((e) => e.kind === "split")) return bars;
  return bars.map((b) => {
    const f = asTradedFactor(b.d, events);
    const m = (v: number | null) => (v == null ? v : v * f);
    return { ...b, open: m(b.open), high: m(b.high), low: m(b.low), close: b.close * f, volume: b.volume == null ? null : b.volume / f };
  });
}

/** מחיר הסגירה האחרון שידוע בתאריך d (כולל d), כפי שנסחר אז */
export async function priceOn(symbolIn: string, d: string): Promise<{ d: string; close: number } | null> {
  const { bars, events } = await loadMem(normalizeSymbol(symbolIn));
  const i = lastIndexOn(bars, d);
  if (i < 0) return null;
  const b = bars[i];
  return { d: b.d, close: b.close * asTradedFactor(b.d, events) };
}

/** דיבידנדים בטווח, בסכום למניה כפי ששולם אז */
export async function dividends(symbolIn: string, from: string, to: string): Promise<CorpEvent[]> {
  const events = await getEvents(normalizeSymbol(symbolIn));
  return events
    .filter((e) => e.kind === "div" && e.d >= from && e.d <= to)
    .map((e) => ({ ...e, value: e.value * asTradedFactor(e.d, events) }));
}

export async function splits(symbolIn: string): Promise<CorpEvent[]> {
  return (await getEvents(normalizeSymbol(symbolIn))).filter((e) => e.kind === "split");
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
