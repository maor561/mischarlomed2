/**
 * שכבת השירות: מחברת את המנוע הטהור (process.ts) למסד הנתונים ולנתוני השוק.
 * כל פעולה טוענת תיק, משחזרת את המצב מהיומן, מריצה את המנוע ושומרת בטרנזקציה אחת.
 */
import { query, tx, type Stmt } from "../db";
import { dividends as getDividends, getHistory, getInstrument, getQuote, splits as getSplits, USD_ILS, type LiveQuote } from "../market";
import { GTC_DAYS, addDays, convert, round2, todayIL, toIls, tradeFee } from "./money";
import { estimate, fill, makeCtx, processDay, processLive, processRange, triggerOnPrice, validateInput, type Ctx, type Estimate, type OrderInput } from "./process";
import { carryLossInto, replay, type State } from "./state";
import { BENCH, FEE_PRESETS, type Bar, type Benchmark, type Ccy, type FeeProfile, type LedgerEntry, type Market, type MonthlyDeposit, type Order, type Portfolio } from "./types";
import { CALM, EVENTS, STORMY } from "../timemachine/events";

export class UserError extends Error {}

/* ---------- מיפוי שורות ---------- */

type R = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Number(v));
const json = <T>(v: unknown, dflt: T): T => (v == null ? dflt : typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

function rowToPortfolio(r: R): Portfolio {
  return {
    id: Number(r.id), name: String(r.name), mode: r.mode as Portfolio["mode"],
    startDate: String(r.start_date), simDate: String(r.sim_date), processedThrough: String(r.processed_through),
    initialCapital: Number(r.initial_capital), fees: json<FeeProfile>(r.fees, FEE_PRESETS.online),
    deposit: json<MonthlyDeposit | null>(r.deposit, null), createdAt: String(r.created_at),
    endDate: (r.end_date as string) ?? null, blind: Boolean(r.blind), periodName: (r.period_name as string) ?? null,
    benchmark: (r.benchmark as Benchmark) ?? "SPY", nav: Number(r.nav ?? 1), navPeak: Number(r.nav_peak ?? 1),
    lastValue: num(r.last_value), ddAlerted: Boolean(r.dd_alerted), lastMarketStop: (r.last_market_stop as string) ?? null,
  };
}

function rowToOrder(r: R): Order {
  return {
    id: Number(r.id), portfolioId: Number(r.portfolio_id), createdD: String(r.created_d), activeFrom: String(r.active_from),
    liveToday: Boolean(r.live_today), side: r.side as Order["side"], symbol: String(r.symbol), currency: r.currency as Ccy,
    qty: num(r.qty), budget: num(r.budget), type: r.type as Order["type"], price: num(r.price), validity: r.validity as Order["validity"],
    expiresD: (r.expires_d as string) ?? null, status: r.status as Order["status"], reason: (r.reason as string) ?? null,
    filledD: (r.filled_d as string) ?? null, fillPrice: num(r.fill_price), fillQty: num(r.fill_qty), reserved: Number(r.reserved ?? 0),
    why: (r.why as string) ?? null, exitPlan: (r.exit_plan as string) ?? null, source: r.source as Order["source"],
    splitsApplied: json<string[]>(r.splits_applied, []),
  };
}

function rowToEntry(r: R): LedgerEntry {
  return {
    id: Number(r.id), portfolioId: Number(r.portfolio_id), d: String(r.d), kind: r.kind as LedgerEntry["kind"],
    symbol: (r.symbol as string) ?? null, qty: Number(r.qty), price: num(r.price), cashIls: Number(r.cash_ils), cashUsd: Number(r.cash_usd),
    fee: Number(r.fee), tax: Number(r.tax), fxRate: num(r.fx_rate), orderId: num(r.order_id), meta: json<R>(r.meta, {}),
  };
}

const PF_COLS = `id,name,mode,start_date::text AS start_date,sim_date::text AS sim_date,processed_through::text AS processed_through,initial_capital,fees,deposit,created_at::text AS created_at,
  end_date::text AS end_date,blind,period_name,benchmark,nav,nav_peak,last_value,dd_alerted,last_market_stop::text AS last_market_stop`;
const ORDER_COLS = `id,portfolio_id,created_d::text AS created_d,active_from::text AS active_from,live_today,side,symbol,currency,qty,budget,type,price,validity,expires_d::text AS expires_d,status,reason,filled_d::text AS filled_d,fill_price,fill_qty,reserved,why,exit_plan,source,splits_applied`;
const LEDGER_COLS = `id,portfolio_id,d::text AS d,kind,symbol,qty,price,cash_ils,cash_usd,fee,tax,fx_rate,order_id,meta`;

export async function loadPortfolio(id: number): Promise<Portfolio> {
  const [r] = await query(`SELECT ${PF_COLS} FROM portfolios WHERE id=$1`, [id]);
  if (!r) throw new UserError("התיק לא נמצא");
  return rowToPortfolio(r);
}
export const loadLedger = async (id: number) => (await query(`SELECT ${LEDGER_COLS} FROM ledger WHERE portfolio_id=$1 ORDER BY id`, [id])).map(rowToEntry);
export const loadOrders = async (id: number, pendingOnly: boolean) =>
  (await query(`SELECT ${ORDER_COLS} FROM orders WHERE portfolio_id=$1 ${pendingOnly ? "AND status='pending'" : ""} ORDER BY id DESC`, [id])).map(rowToOrder);

/* ---------- נתוני שוק למנוע ---------- */

export const yesterdayIL = () => addDays(todayIL(), -1);

export function sessionInfo(q: LiveQuote) {
  const now = Date.now() / 1000;
  const start = q.sessionStart ?? 0,
    end = q.sessionEnd ?? 0;
  const traded = Date.parse(q.time) / 1000 >= start; // אם לא היה מסחר מאז תחילת המושב, זה חג
  return { open: now >= start && now < end && traded, beforeOpen: now < start, start, end };
}

export type Series = { bars: Bar[]; byDate: Map<string, Bar>; splits: Map<string, number>; divs: Map<string, number>; ccy: Ccy };
export type LoadedMarket = Market & { series: Map<string, Series> };

export async function buildMarket(p: Portfolio, symbols: Set<string>, to: string, fromOverride?: string): Promise<LoadedMarket> {
  const from = fromOverride ?? addDays(p.processedThrough, -400); // צריך גם סגירות קודמות (שווי, דמי משמרת)
  const series = new Map<string, Series>();
  const load = async (sym: string) => {
    const meta = await getInstrument(sym);
    if (!meta) throw new UserError(`לא נמצא נייר ${sym}`);
    if (meta.currency !== "USD" && meta.currency !== "ILS") throw new UserError(`${sym} נסחר ב-${meta.currency}. בגרסה הזאת רק שקל ודולר`);
    const bars = await getHistory(sym, { from, to, asTraded: true });
    const sp = await getSplits(sym);
    const dv = await getDividends(sym, from, to);
    series.set(sym, {
      bars, byDate: new Map(bars.map((b) => [b.d, b])), ccy: meta.currency as Ccy,
      splits: new Map(sp.map((e) => [e.d, e.value])), divs: new Map(dv.map((e) => [e.d, e.value])),
    });
  };
  await Promise.all([...symbols, USD_ILS].map(load));

  const closeOn = (sym: string, d: string) => {
    const s = series.get(sym);
    if (!s) return undefined;
    let lo = 0, hi = s.bars.length - 1, ans: number | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s.bars[mid].d <= d) { ans = s.bars[mid].close; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };

  const today = todayIL();
  const lives = new Map<string, LiveQuote>();
  if (p.mode === "live") {
    await Promise.all([...symbols].map(async (s) => lives.set(s, await getQuote(s))));
    lives.set(USD_ILS, await getQuote(USD_ILS));
  }

  return {
    series,
    bar: (sym, d) => series.get(sym)?.byDate.get(d),
    closeOn,
    fx: (d) => {
      if (p.mode === "live" && d >= today) return lives.get(USD_ILS)!.price;
      const v = closeOn(USD_ILS, d);
      if (v == null) throw new Error(`אין שער דולר ל-${d}`);
      return v;
    },
    split: (sym, d) => series.get(sym)?.splits.get(d),
    dividend: (sym, d) => series.get(sym)?.divs.get(d),
    currency: (sym) => {
      const s = series.get(sym);
      if (!s) throw new Error(`נייר ${sym} לא נטען`);
      return s.ccy;
    },
    isComplete: (d) => p.mode === "time" || d < today,
    live: p.mode === "live" ? (sym) => {
      const q = lives.get(sym);
      return q ? { price: q.price, open: sessionInfo(q).open } : undefined;
    } : undefined,
  };
}

/* ---------- שמירה ---------- */

function orderUpsert(o: Order): Stmt {
  return {
    text: `INSERT INTO orders (id,portfolio_id,created_d,active_from,live_today,side,symbol,currency,qty,budget,type,price,validity,expires_d,status,reason,filled_d,fill_price,fill_qty,reserved,why,exit_plan,source,splits_applied)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb)
           ON CONFLICT (id) DO UPDATE SET qty=EXCLUDED.qty,price=EXCLUDED.price,status=EXCLUDED.status,reason=EXCLUDED.reason,
             filled_d=EXCLUDED.filled_d,fill_price=EXCLUDED.fill_price,fill_qty=EXCLUDED.fill_qty,reserved=EXCLUDED.reserved,splits_applied=EXCLUDED.splits_applied`,
    params: [o.id, o.portfolioId, o.createdD, o.activeFrom, o.liveToday, o.side, o.symbol, o.currency, o.qty, o.budget, o.type, o.price, o.validity,
      o.expiresD, o.status, o.reason, o.filledD, o.fillPrice, o.fillQty, o.reserved, o.why, o.exitPlan, o.source, JSON.stringify(o.splitsApplied)],
  };
}

function entryInsert(e: LedgerEntry): Stmt {
  return {
    text: `INSERT INTO ledger (portfolio_id,d,kind,symbol,qty,price,cash_ils,cash_usd,fee,tax,fx_rate,order_id,meta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    params: [e.portfolioId, e.d, e.kind, e.symbol, e.qty, e.price, e.cashIls, e.cashUsd, e.fee, e.tax, e.fxRate, e.orderId, JSON.stringify(e.meta)],
  };
}

async function newOrderId(): Promise<number> {
  const [r] = await query<{ id: string }>(`SELECT nextval('orders_seq')::text AS id`);
  return Number(r.id);
}

async function save(ctx: Ctx, extra: Stmt[] = []) {
  // פקודות שהמנוע יצר מקבלות מזהה אמיתי, והרשומות שמפנות אליהן מתעדכנות
  for (const o of ctx.newOrders) {
    const real = await newOrderId();
    for (const e of ctx.entries) if (e.orderId === o.id) e.orderId = real;
    o.id = real;
    ctx.touched.add(o);
  }
  await tx([...[...ctx.touched].map(orderUpsert), ...ctx.entries.map(entryInsert), ...extra]);
}

/* ---------- תהליך מרכזי ---------- */

const locks = new Map<number, Promise<unknown>>();
/** פעולה אחת בכל פעם לכל תיק */
export async function withLock<T>(id: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(id, run);
  try {
    return await run;
  } finally {
    if (locks.get(id) === run) locks.delete(id);
  }
}

type Loaded = { p: Portfolio; s: State; pending: Order[]; ctx: Ctx; m: Awaited<ReturnType<typeof buildMarket>> };

async function load(id: number, extraSymbols: string[] = [], to?: string): Promise<Loaded> {
  const p = await loadPortfolio(id);
  const s = replay(await loadLedger(id));
  const pending = await loadOrders(id, true);
  const syms = new Set<string>([...s.positions.keys(), ...pending.map((o) => o.symbol), ...extraSymbols]);
  if (p.deposit?.autoBuy) syms.add(p.deposit.autoBuy);
  const end = to ?? (p.mode === "live" ? todayIL() : p.simDate);
  const m = await buildMarket(p, syms, end);
  return { p, s, pending, m, ctx: makeCtx(p, s, m, pending) };
}

/** בתיק חי: מעבד את הימים שעברו ואת היום (כולל מחיר חי). בתיק מכונת זמן: כלום */
async function catchUp(L: Loaded): Promise<Stmt[]> {
  if (L.p.mode !== "live") return [];
  const today = todayIL();
  processRange(L.ctx, L.p.processedThrough, today);
  processLive(L.ctx, today);
  const through = yesterdayIL();
  L.p.processedThrough = through > L.p.processedThrough ? through : L.p.processedThrough;
  L.p.simDate = today;
  return [{ text: `UPDATE portfolios SET processed_through=$2, sim_date=$3 WHERE id=$1`, params: [L.p.id, L.p.processedThrough, today] }];
}

/* ---------- פעולות ---------- */

export type JourneyLength = "1y" | "2y" | "5y" | "10y" | "today";
export type CreateInput = {
  name: string;
  mode: "live" | "time";
  startDate?: string;
  capital: number;
  fees: FeeProfile;
  deposit: MonthlyDeposit | null;
  length?: JourneyLength;
  blind?: "any" | "stormy" | "calm" | null;
  benchmark?: Benchmark;
};

const LEN_DAYS: Record<Exclude<JourneyLength, "today">, number> = { "1y": 365, "2y": 730, "5y": 1826, "10y": 3652 };
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);
const minDate = (a: string, b: string) => (a < b ? a : b);

/** מצב עיוור: בוחר תאריך התחלה אקראי לפי סוג התקופה */
function pickBlindStart(kind: "any" | "stormy" | "calm", latestStart: string): { start: string; name: string | null } {
  if (kind === "stormy") {
    const options = STORMY.filter((s) => addDays(s.peak, -30) <= latestStart);
    if (!options.length) throw new UserError("אין תקופה סוערת שמתאימה לאורך הזה. נסה מסע קצר יותר");
    const s = options[rand(0, options.length - 1)];
    return { start: minDate(addDays(s.peak, -rand(30, 180)), latestStart), name: s.name };
  }
  if (kind === "calm") {
    const options = CALM.filter((c) => c.from <= latestStart);
    const c = options[rand(0, options.length - 1)];
    const to = minDate(c.to, latestStart);
    return { start: addDays(c.from, rand(0, Math.max(0, daysBetween(c.from, to)))), name: c.name };
  }
  return { start: addDays("1995-01-03", rand(0, daysBetween("1995-01-03", latestStart))), name: null };
}

export async function createPortfolio(i: CreateInput): Promise<number> {
  if (!i.name?.trim()) throw new UserError("צריך לתת שם לתיק");
  if (!(i.capital >= 1000 && i.capital <= 100_000_000)) throw new UserError("הון התחלתי בין ₪1,000 ל-₪100,000,000");
  const today = todayIL();
  const yesterday = addDays(today, -1);
  let start = today;
  let endDate: string | null = null;
  let periodName: string | null = null;
  const blind = i.mode === "time" && !!i.blind;
  if (i.mode === "time") {
    const len = i.length && i.length !== "today" ? LEN_DAYS[i.length] : blind ? LEN_DAYS["2y"] : null;
    if (blind) {
      const pick = pickBlindStart(i.blind!, addDays(yesterday, -(len ?? 730)));
      start = pick.start;
      periodName = pick.name;
    } else {
      if (!i.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(i.startDate)) throw new UserError("צריך לבחור תאריך התחלה");
      if (i.startDate < "1990-01-01") throw new UserError("תאריך ההתחלה המוקדם ביותר: 1990");
      if (i.startDate >= today) throw new UserError("במכונת זמן תאריך ההתחלה חייב להיות בעבר");
      start = i.startDate;
    }
    if (len) {
      const end = addDays(start, len);
      endDate = end <= yesterday ? end : null; // מסע שעובר את ההווה נגמר היום
    }
  }
  if (i.deposit) {
    if (!(i.deposit.amount > 0)) i.deposit = null;
    else if (!(i.deposit.day >= 1 && i.deposit.day <= 31)) throw new UserError("יום ההפקדה בין 1 ל-31");
    else if (i.deposit.autoBuy) {
      const meta = await getInstrument(i.deposit.autoBuy);
      if (!meta) throw new UserError(`לא נמצא נייר ${i.deposit.autoBuy} להוראת הקבע`);
      i.deposit.autoBuy = meta.symbol;
    }
  }
  const processed = i.mode === "time" ? start : addDays(start, -1);
  const benchmark: Benchmark = i.benchmark === "TA125" ? "TA125" : "SPY";
  const [r] = await query<{ id: number }>(
    `INSERT INTO portfolios (name,mode,start_date,sim_date,processed_through,initial_capital,fees,deposit,end_date,blind,period_name,benchmark,last_value)
     VALUES ($1,$2,$3,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$5) RETURNING id`,
    [i.name.trim(), i.mode, start, processed, i.capital, JSON.stringify(i.fees), i.deposit ? JSON.stringify(i.deposit) : null, endDate, blind, periodName, benchmark],
  );
  const id = Number(r.id);
  await query(
    `INSERT INTO ledger (portfolio_id,d,kind,cash_ils,meta) VALUES ($1,$2,'deposit',$3,'{"initial":true}'::jsonb)`,
    [id, start, i.capital],
  );
  return id;
}

export async function deletePortfolio(id: number) {
  await tx([
    { text: `DELETE FROM ledger WHERE portfolio_id=$1`, params: [id] },
    { text: `DELETE FROM orders WHERE portfolio_id=$1`, params: [id] },
    { text: `DELETE FROM portfolios WHERE id=$1`, params: [id] },
  ]);
}

export async function listPortfolios() {
  return (await query(`SELECT ${PF_COLS} FROM portfolios ORDER BY id DESC`)).map(rowToPortfolio);
}

/** מחיר ייחוס לפקודה: מחיר הסגירה ביום הסימולציה, או המחיר החי */
async function refQuote(L: Loaded, symbol: string) {
  if (L.p.mode === "time") {
    const px = L.m.closeOn(symbol, L.p.simDate);
    if (px == null) throw new UserError(`${symbol} עוד לא נסחרה ב-${L.p.simDate}`);
    return { price: px, open: false, beforeOpen: false, note: `הפקודה תיבדק החל מיום המסחר הבא אחרי ${L.p.simDate}. פקודת שוק תתבצע במחיר הפתיחה.` };
  }
  const q = await getQuote(symbol);
  const si = sessionInfo(q);
  const fmt = (t: number) => new Date(t * 1000).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
  const note = si.open
    ? "הבורסה פתוחה. פקודת שוק תתבצע מיד במחיר הנוכחי (באיחור של כ-15 דקות אצל הספק)."
    : si.beforeOpen
      ? `הבורסה עוד לא נפתחה היום. הפקודה תמתין ותתבצע בפתיחה (${fmt(si.start)} שעון ישראל). מחיר הפתיחה יכול להיות שונה מהמחיר כאן.`
      : "הבורסה סגורה. הפקודה תמתין לפתיחה של יום המסחר הבא. מחיר הפתיחה יכול להיות שונה מאוד מהמחיר כאן (פער פתיחה).";
  return { price: q.price, open: si.open, beforeOpen: si.beforeOpen, note };
}

export type QuoteForOrder = Estimate & { symbol: string; name: string; marketOpen: boolean; note: string; simDate: string; fx: number; held: number };

export async function quoteForOrder(id: number, input: Pick<OrderInput, "side" | "symbol" | "qty" | "type" | "price">): Promise<QuoteForOrder> {
  const meta = await getInstrument(input.symbol);
  if (!meta) throw new UserError("נייר לא נמצא");
  return withLock(id, async () => {
    const L = await load(id, [meta.symbol]);
    const ups = await catchUp(L);
    if (ups.length || L.ctx.entries.length) await save(L.ctx, ups);
    const ref = await refQuote(L, meta.symbol);
    const est = estimate(L.ctx, { ...input, symbol: meta.symbol, qty: Math.max(1, Math.floor(input.qty || 1)) }, ref.price);
    return {
      ...est, symbol: meta.symbol, name: meta.name, marketOpen: ref.open, note: ref.note, simDate: L.p.simDate,
      fx: L.m.fx(L.p.simDate), held: L.s.positions.get(meta.symbol)?.qty ?? 0,
    };
  });
}

export async function placeOrder(id: number, input: OrderInput): Promise<Order> {
  const err = validateInput(input);
  if (err) throw new UserError(err);
  const meta = await getInstrument(input.symbol);
  if (!meta) throw new UserError("נייר לא נמצא");
  const symbol = meta.symbol;
  return withLock(id, async () => {
    const L = await load(id, [symbol]);
    const ups = await catchUp(L);
    const ref = await refQuote(L, symbol);
    const est = estimate(L.ctx, { ...input, symbol }, ref.price);
    if (est.shortfall > 0) {
      throw new UserError(
        input.side === "buy"
          ? `אין מספיק ${est.currency === "USD" ? "דולרים" : "שקלים"} פנויים: צריך ${est.reserve}, פנויים ${est.available}`
          : `אין מספיק מניות פנויות: יש ${est.available}`,
      );
    }
    const created = L.p.mode === "time" ? L.p.simDate : todayIL();
    const activeFrom = L.p.mode === "time" ? addDays(created, 1) : ref.open || ref.beforeOpen ? created : addDays(created, 1);
    const o: Order = {
      id: await newOrderId(), portfolioId: id, createdD: created, activeFrom, liveToday: L.p.mode === "live" && ref.open,
      side: input.side, symbol, currency: est.currency, qty: input.qty, budget: null, type: input.type,
      price: input.type === "market" ? null : round2(input.price!), validity: input.validity,
      expiresD: input.validity === "gtc" ? addDays(created, GTC_DAYS) : null, status: "pending", reason: null,
      filledD: null, fillPrice: null, fillQty: null, reserved: input.side === "buy" ? est.reserve : 0,
      why: input.why.trim(), exitPlan: input.exitPlan?.trim() || null, source: "user", splitsApplied: [],
    };
    L.ctx.orders.push(o);
    L.ctx.touched.add(o);
    // בחי עם בורסה פתוחה: פקודת שוק, או לימיט שכבר "בכסף", מתבצעת מיד
    if (o.liveToday && triggerOnPrice(o, ref.price)) fill(L.ctx, o, created, ref.price);
    await save(L.ctx, ups);
    return o;
  });
}

export async function cancelOrder(id: number, orderId: number) {
  const [r] = await query(`SELECT ${ORDER_COLS} FROM orders WHERE id=$1 AND portfolio_id=$2`, [orderId, id]);
  if (!r) throw new UserError("הפקודה לא נמצאה");
  if (r.status !== "pending") throw new UserError("אפשר לבטל רק פקודה שעוד ממתינה");
  await query(`UPDATE orders SET status='cancelled', reason='בוטלה על ידך', reserved=0 WHERE id=$1`, [orderId]);
}

export async function convertCash(id: number, from: Ccy, amount: number) {
  if (!(amount > 0)) throw new UserError("סכום ההמרה חייב להיות חיובי");
  return withLock(id, async () => {
    const L = await load(id);
    const ups = await catchUp(L);
    const d = L.p.simDate;
    const fx = L.m.fx(d);
    const reserved = L.ctx.orders.filter((o) => o.status === "pending" && o.side === "buy" && o.currency === from).reduce((a, o) => a + o.reserved, 0);
    const free = round2(L.s.cash[from] - reserved);
    if (amount > free + 0.005) throw new UserError(`אפשר להמיר עד ${free} (חלק מהכסף שמור לפקודות ממתינות)`);
    const c = convert(L.p.fees, from, amount, fx);
    L.ctx.entries.push({
      portfolioId: id, d, kind: "fx", symbol: null, qty: 0, price: null,
      cashIls: from === "ILS" ? -amount : c.received, cashUsd: from === "USD" ? -amount : c.received,
      fee: round2(from === "USD" ? c.fee * fx : c.fee), tax: 0, fxRate: fx, orderId: null,
      meta: { from, amount, received: c.received, effectiveRate: c.effectiveRate, feeNative: c.fee },
    });
    await save(L.ctx, ups);
    return c;
  });
}

/* ---------- מכונת זמן: קידום עם עצירות ---------- */

/** שווי התיק בשקלים ביום d */
export function valueOn(s: State, m: Market, d: string): number {
  const fx = m.fx(d);
  let v = s.cash.ILS + s.cash.USD * fx;
  for (const pos of s.positions.values()) v += pos.qty * (m.closeOn(pos.symbol, d) ?? 0) * (pos.currency === "USD" ? fx : 1);
  return v;
}

/** שינוי יומי של מדד השוק, וכמה הוא מתחת לשיא של השנה האחרונה */
function marketMove(m: LoadedMarket, sym: string, d: string): { change: number; fromPeak: number } | null {
  const s = m.series.get(sym);
  const bar = s?.byDate.get(d);
  if (!s || !bar) return null;
  const i = s.bars.indexOf(bar);
  if (i < 1) return null;
  const hi = Math.max(...s.bars.slice(Math.max(0, i - 252), i + 1).map((b) => b.close));
  return { change: round2((bar.close / s.bars[i - 1].close - 1) * 100), fromPeak: round2((bar.close / hi - 1) * 100) };
}

export type StopPrefs = Partial<Record<"orders" | "market" | "drawdown" | "events" | "corporate" | "month", boolean>>;
export type Stop = {
  kind: "orders" | "market" | "drawdown" | "event" | "corporate" | "month" | "end" | "present";
  d: string;
  title: string;
  body: string;
  items: string[];
  marketLabel: string;
  marketChange: number | null;
  marketFromPeak: number | null;
  dayChange: number | null;
  fromPeak: number;
};

const ORDER_OUTCOME: Record<string, string> = { filled: "בוצעה", rejected: "נדחתה", expired: "פגה", cancelled: "בוטלה" };
function describeOrder(o: Order): string {
  const what = `${o.side === "buy" ? "קנייה" : "מכירה"} ${o.fillQty ?? o.qty ?? ""} ${o.symbol}`;
  if (o.status === "filled") return `${what} בוצעה ב-${o.currency === "USD" ? "$" : "₪"}${o.fillPrice}`;
  return `${what} ${ORDER_OUTCOME[o.status] ?? o.status}${o.reason ? `: ${o.reason}` : ""}`;
}

/** מקדם עד days ימים קדימה, ועוצר ביום הראשון שבו מתקיים אחד מתנאי העצירה */
export async function advanceUntil(id: number, days: number, prefs: StopPrefs = {}) {
  if (!(days >= 1 && days <= 3700)) throw new UserError("מספר ימים לא תקין");
  return withLock(id, async () => {
    const p0 = await loadPortfolio(id);
    if (p0.mode !== "time") throw new UserError("קידום זמן אפשרי רק בתיק מכונת זמן");
    const limit = p0.endDate ? minDate(p0.endDate, yesterdayIL()) : yesterdayIL();
    if (p0.simDate >= limit) {
      throw new UserError(p0.endDate && p0.simDate >= p0.endDate ? "המסע הסתיים. הדו\"ח מחכה בלשונית \"דו\"ח המסע\"" : "כבר הגעת להווה. מכאן אפשר להמשיך רק בתיק חי");
    }
    const target = minDate(addDays(p0.simDate, Math.floor(days)), limit);
    const bench = BENCH[p0.benchmark];
    const L = await load(id, [bench.index], target);
    const { ctx, m, p } = L;

    let nav = p.nav, peak = p.navPeak, dd = p.ddAlerted, lastMkt = p.lastMarketStop;
    let lastV = p.lastValue ?? valueOn(ctx.s, m, p.simDate);
    let stop: Stop | null = null;
    let d = p.simDate;
    while (d < target && !stop) {
      d = addDays(d, 1);
      const before = ctx.orders.filter((o) => o.status === "pending");
      const n0 = ctx.entries.length;
      processDay(ctx, d);
      const fresh = ctx.entries.slice(n0);

      let dayChange: number | null = null;
      if (m.bar(USD_ILS, d) || m.bar(bench.index, d)) {
        const V = valueOn(ctx.s, m, d);
        const dep = fresh.filter((e) => e.kind === "deposit").reduce((a, e) => a + e.cashIls, 0);
        if (lastV > 0) {
          nav *= (V - dep) / lastV;
          dayChange = round2(((V - dep) / lastV - 1) * 100);
        }
        lastV = V;
        if (nav > peak) {
          peak = nav;
          dd = false;
        }
      }
      const fromPeak = round2((nav / peak - 1) * 100);
      const mk = marketMove(m, bench.index, d);
      const ev = p.blind ? undefined : EVENTS.find((e) => e.d === d);
      const done = before.filter((o) => o.status !== "pending");
      const base = { d, items: done.map(describeOrder), marketLabel: bench.label, marketChange: mk?.change ?? null, marketFromPeak: mk?.fromPeak ?? null, dayChange, fromPeak };
      // תנועה של 4%+ עוצרת, אבל בתוך משבר לא עוצרים שוב 5 ימים אחרי עצירה קודמת, אלא אם התנועה קיצונית (7%+)
      const big = mk && Math.abs(mk.change) >= 4 && (!lastMkt || daysBetween(lastMkt, d) > 5 || Math.abs(mk.change) >= 7);

      if (prefs.market && big) {
        lastMkt = d;
        stop = { ...base, kind: "market", title: `${bench.label} ${mk!.change > 0 ? "זינק" : "צנח"} ${Math.abs(mk!.change).toFixed(1)}% ביום אחד`, body: ev ? `${ev.title}. ${ev.body}` : "" };
      } else if (prefs.events && ev) {
        stop = { ...base, kind: "event", title: ev.title, body: ev.body };
      } else if (prefs.drawdown && !dd && fromPeak <= -10) {
        dd = true;
        stop = { ...base, kind: "drawdown", title: `התיק שלך ירד ${Math.abs(fromPeak).toFixed(1)}% מהשיא`, body: "זה הרגע שבו הרבה משקיעים מוכרים מפחד. לפני שאתה מחליט משהו, כדאי לבדוק: האם משהו השתנה בסיבה שבגללה קנית?" };
      } else if (prefs.orders && done.length) {
        stop = { ...base, kind: "orders", title: done.length === 1 ? "פקודה הסתיימה" : `${done.length} פקודות הסתיימו`, body: "" };
      } else if (prefs.corporate && fresh.some((e) => e.kind === "dividend" || e.kind === "split")) {
        const e = fresh.find((x) => x.kind === "dividend" || x.kind === "split")!;
        stop = { ...base, kind: "corporate", title: e.kind === "dividend" ? `התקבל דיבידנד מ-${e.symbol}` : `${e.symbol} פוצלה`, body: "" };
      } else if (prefs.month && d.endsWith("-01")) {
        stop = { ...base, kind: "month", title: "תחילת חודש חדש", body: "" };
      }
      if (!stop && d === limit) {
        stop = p.endDate && d === p.endDate
          ? { ...base, kind: "end", title: "🏁 הגעת לסוף המסע", body: "דו\"ח המסע מוכן." }
          : { ...base, kind: "present", title: "הגעת להווה", body: "מכאן הזמן ממשיך רק במציאות. אפשר לפתוח את הדו\"ח, או לפתוח תיק חי." };
      }
    }
    await save(ctx, [{
      text: `UPDATE portfolios SET sim_date=$2, processed_through=$2, nav=$3, nav_peak=$4, last_value=$5, dd_alerted=$6, last_market_stop=$7 WHERE id=$1`,
      params: [id, d, nav, peak, lastV, dd, lastMkt],
    }]);
    return { from: p0.simDate, to: d, entries: ctx.entries.length, stop };
  });
}

/** מקדם עד תאריך, בלי עצירות (לבדיקות ולכפתורי צעד) */
export async function advance(id: number, to: string) {
  const p = await loadPortfolio(id);
  return advanceUntil(id, Math.max(1, daysBetween(p.simDate, to)), {});
}

/* ---------- תצוגה ---------- */

export async function view(id: number) {
  return withLock(id, async () => {
    const L = await load(id);
    const ups = await catchUp(L);
    if (ups.length || L.ctx.entries.length || L.ctx.touched.size) await save(L.ctx, ups);
    const { p, s, m } = L;
    const d = p.simDate;
    const fx = m.fx(d);

    const priceOf = (sym: string) => (p.mode === "live" ? m.live?.(sym)?.price : undefined) ?? m.closeOn(sym, d) ?? 0;
    const positions = [...s.positions.values()].map((pos) => {
      const price = priceOf(pos.symbol);
      const value = round2(pos.qty * price);
      const costCcy = pos.lots.reduce((a, l) => a + l.costCcy, 0);
      const costIls = pos.lots.reduce((a, l) => a + l.costIls, 0);
      const valueIls = round2(toIls(value, pos.currency, fx));
      return {
        symbol: pos.symbol, currency: pos.currency, qty: pos.qty, price, value, valueIls,
        avgCost: round2(costCcy / pos.qty), costIls: round2(costIls),
        pnlCcy: round2(value - costCcy), pnlIls: round2(valueIls - costIls),
      };
    });
    const pendingAll = (await loadOrders(id, true)).map((o) => ({ ...o }));
    const reserved = { ILS: 0, USD: 0 } as Record<Ccy, number>;
    for (const o of pendingAll) if (o.side === "buy") reserved[o.currency] = round2(reserved[o.currency] + o.reserved);

    const holdingsIls = round2(positions.reduce((a, x) => a + x.valueIls, 0));
    const cashIls = round2(s.cash.ILS + s.cash.USD * fx);
    const ledger = await loadLedger(id);
    const deposited = round2(ledger.filter((e) => e.kind === "deposit").reduce((a, e) => a + e.cashIls, 0));
    const total = round2(holdingsIls + cashIls);

    // מס לפי שנה
    const years = [...s.years.entries()].sort((a, b) => b[0] - a[0]).map(([y, t]) => ({
      year: y, realized: t.realized, taxPaid: t.taxPaid, divTax: t.divTax, carryIn: round2(carryLossInto(s, y)),
    }));

    // השוואה לבנק: אותן תנועות בדיוק עם עמלות של בנק
    const bank = FEE_PRESETS.bank;
    let bankTrade = 0, bankFx = 0;
    for (const e of ledger) {
      const ccy = (e.meta.currency as Ccy) ?? "USD";
      if (e.kind === "buy" || e.kind === "sell") bankTrade += toIls(tradeFee(bank, ccy, Number(e.meta.gross ?? 0)), ccy, e.fxRate ?? fx);
      if (e.kind === "fx") bankFx += toIls(((Number(e.meta.amount) || 0) * bank.fxPct) / 100, (e.meta.from as Ccy) ?? "ILS", e.fxRate ?? fx);
    }
    const years_ = Math.max(0, (Date.parse(d) - Date.parse(p.startDate)) / (365.25 * 86400_000));
    const bankCustody = p.fees.custodyPctYear > 0 ? s.costs.custody : ((deposited + total) / 2) * (bank.custodyPctYear / 100) * years_;

    return {
      portfolio: p,
      fx,
      cash: s.cash,
      reserved,
      positions,
      totals: { holdingsIls, cashIls, total, deposited, pnl: round2(total - deposited), pnlPct: deposited ? round2(((total - deposited) / deposited) * 100) : 0 },
      pending: pendingAll,
      history: ledger.reverse(),
      orders: (await loadOrders(id, false)).filter((o) => o.status !== "pending").slice(0, 200),
      tax: { years, divTaxTotal: round2(years.reduce((a, y) => a + y.divTax, 0)) },
      costs: {
        trade: round2(s.costs.trade), fx: round2(s.costs.fx), custody: round2(s.costs.custody),
        bank: { trade: round2(bankTrade), fx: round2(bankFx), custody: round2(bankCustody), custodyEstimated: p.fees.custodyPctYear <= 0 },
      },
    };
  });
}

export type PortfolioView = Awaited<ReturnType<typeof view>>;
