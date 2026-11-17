/**
 * החנות (חבילה 12): אוספים לפי נושא, "הפעילים ביותר" ביום הסימולציה, וקנייה של אוסף שלם בחלוקה שווה.
 * הכול נחתך ביום הסימולציה: נייר שעוד לא נסחר אז מוצג, אבל לא ניתן לקנייה.
 */
import { addDays, round2, todayIL } from "../engine/money";
import { loadPortfolio, placeOrder, UserError } from "../engine/service";
import type { Order } from "../engine/types";
import { getHistory, getInstrument, isCached, priceOn, USD_ILS } from "../market";
import { COLLECTIONS, collectionById, NAMES } from "./collections";

export type StoreItem = {
  symbol: string;
  name: string;
  currency: string;
  kind: string;
  available: boolean;
  /** false = הנתונים עוד לא הורדו (נטענים כשפותחים את האוסף) */
  loaded: boolean;
  /** מתי התחיל להיסחר (אם עוד לא נסחר ביום הסימולציה) */
  since: string | null;
  price: number | null;
  dayPct: number | null;
  /** תשואה בשנה שהסתיימה ביום הסימולציה (רק אם יש שנה מלאה) */
  yearPct: number | null;
  /** מחזור מסחר בדולרים ביום האחרון, לדירוג "הפעילים ביותר" */
  turnoverUsd: number;
};

export async function itemInfo(symbol: string, end: string, fx: number): Promise<StoreItem | null> {
  const meta = await getInstrument(symbol);
  if (!meta) return null;
  const bars = await getHistory(meta.symbol, { from: addDays(end, -372), to: end, asTraded: true });
  const last = bars.at(-1);
  const started = !meta.firstTrade || meta.firstTrade <= end;
  const available = started && !!last && last.d >= addDays(end, -10);
  const prev = bars.at(-2);
  const yearAgo = bars.find((b) => b.d >= addDays(end, -365));
  const fullYear = !!yearAgo && yearAgo.d <= addDays(end, -355);
  const turnover = last ? last.close * (last.volume ?? 0) : 0;
  return {
    symbol: meta.symbol, name: meta.name, currency: meta.currency, kind: meta.kind, available, loaded: true,
    since: started ? null : meta.firstTrade,
    price: available ? round2(last!.close) : null,
    dayPct: available && prev ? round2((last!.close / prev.close - 1) * 100) : null,
    yearPct: available && fullYear ? round2((last!.close / yearAgo!.close - 1) * 100) : null,
    turnoverUsd: meta.currency === "ILS" ? turnover / fx : turnover,
  };
}

/** מריץ במנות קטנות, כדי לא להציף את Yahoo בטעינה הראשונה */
async function inChunks<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < xs.length; i += n) await Promise.all(xs.slice(i, i + n).map(fn));
}

const placeholder = (symbol: string): StoreItem => ({
  symbol, name: NAMES[symbol] ?? symbol, currency: symbol.endsWith(".TA") ? "ILS" : "USD", kind: "", available: false, loaded: false,
  since: null, price: null, dayPct: null, yearPct: null, turnoverUsd: 0,
});

/**
 * הורדה ראשונה של היסטוריה לכל 58 הניירות איטית מאוד בענן, ולכן:
 * בלי collection: מחזירים מיד את כל האוספים, עם נתונים רק לניירות שכבר במטמון.
 * עם collection: מורידים (אם צריך) רק את הניירות של האוסף הזה.
 */
export async function storeView(id: number, collectionId?: string | null) {
  const p = await loadPortfolio(id);
  const end = p.mode === "live" ? todayIL() : p.simDate;
  const fx = (await priceOn(USD_ILS, end))?.close ?? 3.7;
  const pick = collectionId ? collectionById(collectionId) : null;
  const info = new Map<string, StoreItem>();
  const symbols = pick ? pick.symbols : [...new Set(COLLECTIONS.flatMap((c) => c.symbols))];
  await inChunks(symbols, pick ? 4 : 8, async (s) => {
    const it = pick || (await isCached(s)) ? await itemInfo(s, end, fx).catch(() => null) : null;
    info.set(s, it ?? placeholder(s));
  });
  const collections = (pick ? [pick] : COLLECTIONS).map((c) => {
    const items = c.symbols.map((s) => info.get(s) ?? placeholder(s));
    const loaded = items.every((x) => x.loaded);
    const withYear = items.filter((x) => x.yearPct != null);
    return {
      ...c,
      items,
      loaded,
      availableCount: loaded ? items.filter((x) => x.available).length : c.symbols.length,
      /** ממוצע פשוט: כמו אוסף שנקנה בחלוקה שווה לפני שנה */
      yearPct: loaded && withYear.length ? round2(withYear.reduce((a, x) => a + x.yearPct!, 0) / withYear.length) : null,
    };
  });
  const active = pick ? [] : [...info.values()].filter((x) => x.available && x.turnoverUsd > 0).sort((a, b) => b.turnoverUsd - a.turnoverUsd).slice(0, 10);
  return { asOf: end, collections, active };
}
export type StoreView = Awaited<ReturnType<typeof storeView>>;

/** רשימת המעקב עם מחיר ושינוי יומי ביום הסימולציה */
export async function watchView(id: number): Promise<StoreItem[]> {
  const p = await loadPortfolio(id);
  const end = p.mode === "live" ? todayIL() : p.simDate;
  const fx = (await priceOn(USD_ILS, end))?.close ?? 3.7;
  const out: StoreItem[] = [];
  for (const s of p.watchlist) {
    const it = await itemInfo(s, end, fx).catch(() => null);
    if (it) out.push(it);
  }
  return out;
}

/** קנייה של אוסף שלם לפי סכום בשקלים, בחלוקה שווה בין הניירות שזמינים ביום הסימולציה */
export async function buyCollection(id: number, collectionId: string, amount: number) {
  const c = collectionById(collectionId);
  if (!c) throw new UserError("אוסף לא נמצא");
  if (!(amount > 0)) throw new UserError("צריך סכום חיובי");
  const p = await loadPortfolio(id);
  const end = p.mode === "live" ? todayIL() : p.simDate;
  const fx = (await priceOn(USD_ILS, end))?.close ?? 3.7;
  const avail: string[] = [];
  for (const s of c.symbols) if ((await itemInfo(s, end, fx).catch(() => null))?.available) avail.push(s);
  if (!avail.length) throw new UserError("אין באוסף ניירות שנסחרו בתאריך הזה");
  const share = Math.floor((amount / avail.length) * 100) / 100;
  if (share < 10) throw new UserError(`₪${amount} מתחלקים ל-${avail.length} ניירות: ₪${share} לכל אחד. המינימום הוא ₪10 לנייר`);
  const results: { symbol: string; order?: Order; error?: string }[] = [];
  for (const symbol of avail) {
    try {
      const order = await placeOrder(id, {
        side: "buy", symbol, qty: null, amount: share, amountCcy: "ILS", type: "market", price: null, validity: "day",
        why: `קנייה של אוסף "${c.title}" בחלוקה שווה (${avail.length} ניירות)`, exitPlan: null,
      });
      results.push({ symbol, order });
    } catch (e) {
      results.push({ symbol, error: (e as Error).message });
    }
  }
  return { collection: c.title, share, results };
}
