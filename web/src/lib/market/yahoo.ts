/**
 * לקוח ל-Yahoo Finance (ממשק לא רשמי, חינמי, בלי מפתח).
 * כאן רק הורדה ונרמול. מטמון ולוגיקה נמצאים ב-market/index.ts.
 *
 * נרמולים חשובים:
 * - מניות ת"א מתומחרות באגורות (ILA). מחלקים ב-100 וקובעים ILS.
 * - המחירים ההיסטוריים מותאמים לפיצולים. שומרים גם את אירועי הפיצול
 *   כדי לשחזר את המחיר "כפי שנסחר אז" (ראו asTradedFactor).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const BASE = "https://query1.finance.yahoo.com";

export type Bar = { d: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null };
export type CorpEvent = { d: string; kind: "split" | "div"; value: number };
export type InstrumentMeta = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  kind: string;
  timezone: string | null;
  firstTrade: string | null;
};
export type ChartResult = {
  meta: InstrumentMeta;
  live: { price: number; prevClose: number | null; time: string; dayHigh: number | null; dayLow: number | null; high52: number | null; low52: number | null; sessionStart: number | null; sessionEnd: number | null };
  bars: Bar[];
  events: CorpEvent[];
};
export type SearchHit = { symbol: string; name: string; exchange: string; kind: string };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo ${res.status} עבור ${url.replace(BASE, "")}`);
  return res.json();
}

/** תאריך המסחר המקומי בבורסה (לא UTC), כדי שנר של יום שני לא ייפול על יום ראשון */
function localDate(epochSec: number, gmtoffset: number): string {
  return new Date((epochSec + gmtoffset) * 1000).toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchChart(symbol: string, opts: { fromEpoch?: number; range?: string } = {}): Promise<ChartResult> {
  const qs = opts.range
    ? `range=${opts.range}`
    : `period1=${opts.fromEpoch ?? 0}&period2=${Math.floor(Date.now() / 1000) + 86400}`;
  const json = (await getJson(
    `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}&interval=1d&events=div,split&includeAdjustedClose=false`,
  )) as any;
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description ?? `לא נמצא נייר ${symbol}`);
  const m = r.meta;
  const div = m.currency === "ILA" ? 100 : 1; // אגורות → שקלים
  const px = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v / div : null);
  const off = Number(m.gmtoffset ?? 0);

  const q = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  (r.timestamp ?? []).forEach((t: number, i: number) => {
    const close = px(q.close?.[i]);
    if (close == null) return; // ימים בלי מסחר / חורים בנתונים
    bars.push({ d: localDate(t, off), open: px(q.open?.[i]), high: px(q.high?.[i]), low: px(q.low?.[i]), close, volume: q.volume?.[i] ?? null });
  });
  // הספק לפעמים מחזיר את היום הנוכחי פעמיים; משאירים את האחרון
  const dedup = new Map(bars.map((b) => [b.d, b]));
  const uniq = [...dedup.values()];

  // סגירה קודמת = יום המסחר שלפני יום המחיר הנוכחי.
  // (chartPreviousClose של הספק הוא הסגירה שלפני תחילת הטווח, ולא של אתמול)
  const liveDay = m.regularMarketTime ? localDate(m.regularMarketTime, off) : null;
  const before = uniq.filter((b) => liveDay == null || b.d < liveDay);
  const prevClose = before.at(-1)?.close ?? null;

  const events: CorpEvent[] = [];
  for (const s of Object.values<any>(r.events?.splits ?? {})) {
    if (s.numerator && s.denominator) events.push({ d: localDate(s.date, off), kind: "split", value: s.numerator / s.denominator });
  }
  for (const v of Object.values<any>(r.events?.dividends ?? {})) {
    events.push({ d: localDate(v.date, off), kind: "div", value: v.amount / div });
  }

  return {
    meta: {
      symbol: m.symbol,
      name: m.longName ?? m.shortName ?? m.symbol,
      exchange: m.fullExchangeName ?? m.exchangeName ?? "",
      currency: m.currency === "ILA" ? "ILS" : m.currency,
      kind: m.instrumentType ?? "EQUITY",
      timezone: m.exchangeTimezoneName ?? null,
      firstTrade: m.firstTradeDate ? localDate(m.firstTradeDate, off) : null,
    },
    live: {
      price: px(m.regularMarketPrice) ?? 0,
      prevClose,
      time: new Date((m.regularMarketTime ?? 0) * 1000).toISOString(),
      dayHigh: px(m.regularMarketDayHigh),
      dayLow: px(m.regularMarketDayLow),
      high52: px(m.fiftyTwoWeekHigh),
      low52: px(m.fiftyTwoWeekLow),
      sessionStart: m.currentTradingPeriod?.regular?.start ?? null,
      sessionEnd: m.currentTradingPeriod?.regular?.end ?? null,
    },
    bars: uniq,
    events,
  };
}

const KINDS = new Set(["EQUITY", "ETF", "INDEX", "CURRENCY"]);
const EXCHANGES = new Set(["NMS", "NYQ", "NGM", "NCM", "PCX", "ASE", "BTS", "TLV"]); // נאסד"ק, ניו יורק, ארקה, ת"א

export async function search(q: string): Promise<SearchHit[]> {
  const json = (await getJson(
    `${BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
  )) as any;
  return (json?.quotes ?? [])
    .filter((x: any) => KINDS.has(x.quoteType) && (EXCHANGES.has(x.exchange) || x.quoteType === "INDEX"))
    .map((x: any) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, exchange: x.exchDisp ?? x.exchange, kind: x.quoteType }));
}
