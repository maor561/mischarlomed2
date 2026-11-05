/**
 * לב המנוע: מעבד יום אחר יום בין שני תאריכים.
 * הסדר בכל יום (ראו "חוקי המנוע" בסקיצה 02):
 *   1. דמי משמרת (ביום הראשון של רבעון, על הרבעון שהסתיים)
 *   2. פיצולים  3. דיבידנדים (מי שהחזיק לפני יום האקס)  4. הפקדה חודשית
 *   5. ביצוע פקודות לפי נר היום  6. פקיעת תוקף (רק ביום שהסתיים)
 * הכול דטרמיניסטי ותלוי רק ב-Market, ולכן ניתן לבדיקה עם נתונים סינתטיים.
 */
import { GTC_DAYS, RESERVE_BUFFER, TAX_RATE, addDays, convert, daysInMonth, round2, tradeFee } from "./money";
import { apply, eventKey, fifoCost, taxDelta, type State } from "./state";
import type { Bar, Ccy, LedgerEntry, Market, Order, OrderType, Portfolio } from "./types";

export type Ctx = {
  p: Portfolio;
  s: State;
  m: Market;
  orders: Order[]; // הפקודות הממתינות (משתנות במקום)
  entries: LedgerEntry[]; // רשומות חדשות לשמירה
  newOrders: Order[]; // פקודות שהמנוע יצר (הוראת קבע)
  touched: Set<Order>;
  nextTempId: number;
};

export function makeCtx(p: Portfolio, s: State, m: Market, pending: Order[]): Ctx {
  return { p, s, m, orders: pending, entries: [], newOrders: [], touched: new Set(), nextTempId: -1 };
}

function push(ctx: Ctx, e: Omit<LedgerEntry, "portfolioId">) {
  const full = { ...e, portfolioId: ctx.p.id };
  apply(ctx.s, full);
  ctx.entries.push(full);
}

const pending = (ctx: Ctx) => ctx.orders.filter((o) => o.status === "pending");

export function availableCash(ctx: Ctx, ccy: Ccy, except?: Order): number {
  const reserved = pending(ctx)
    .filter((o) => o !== except && o.side === "buy" && o.currency === ccy)
    .reduce((a, o) => a + o.reserved, 0);
  return round2(ctx.s.cash[ccy] - reserved);
}

export function availableShares(ctx: Ctx, symbol: string, except?: Order): number {
  const held = ctx.s.positions.get(symbol)?.qty ?? 0;
  const inSells = pending(ctx)
    .filter((o) => o !== except && o.side === "sell" && o.symbol === symbol)
    .reduce((a, o) => a + (o.qty ?? 0), 0);
  return held - inSells;
}

/* ---------- ביצוע ---------- */

/** מחיר הביצוע לפי נר יומי, או undefined אם התנאי לא התקיים */
export function triggerOnBar(o: Pick<Order, "side" | "type" | "price">, bar: Bar): number | undefined {
  const open = bar.open ?? bar.close;
  const low = bar.low ?? Math.min(open, bar.close);
  const high = bar.high ?? Math.max(open, bar.close);
  const P = o.price!;
  if (o.type === "market") return open;
  if (o.type === "limit") {
    if (o.side === "buy") return low <= P ? Math.min(open, P) : undefined;
    return high >= P ? Math.max(open, P) : undefined;
  }
  // סטופ: הופך לפקודת שוק כשהמחיר נוגע ברמה. בפער פתיחה מקבלים את הפתיחה, גרוע מהרמה
  if (o.side === "sell") return low <= P ? Math.min(open, P) : undefined;
  return high >= P ? Math.max(open, P) : undefined;
}

export function triggerOnPrice(o: Pick<Order, "side" | "type" | "price">, price: number): boolean {
  if (o.type === "market") return true;
  const P = o.price!;
  if (o.type === "limit") return o.side === "buy" ? price <= P : price >= P;
  return o.side === "sell" ? price <= P : price >= P;
}

function close(ctx: Ctx, o: Order, status: Order["status"], reason: string | null) {
  o.status = status;
  o.reason = reason;
  o.reserved = 0;
  ctx.touched.add(o);
}

/** כמה מניות שלמות אפשר לקנות בסכום, כולל עמלה */
export function sharesForBudget(ctx: Ctx, ccy: Ccy, budget: number, price: number): number {
  let q = Math.floor(budget / price);
  while (q > 0 && q * price + tradeFee(ctx.p.fees, ccy, q * price) > budget) q--;
  return q;
}

export function fill(ctx: Ctx, o: Order, d: string, rawPrice: number): void {
  const price = round2(rawPrice);
  const ccy = o.currency;
  const fx = ctx.m.fx(d);
  const feesIls = (fee: number) => round2(ccy === "USD" ? fee * fx : fee);

  if (o.side === "buy") {
    const avail = availableCash(ctx, ccy, o);
    const qty = o.qty ?? sharesForBudget(ctx, ccy, Math.min(o.budget ?? 0, avail), price);
    if (qty < 1) return close(ctx, o, "rejected", "הסכום לא מספיק למניה אחת");
    const gross = round2(qty * price);
    const fee = tradeFee(ctx.p.fees, ccy, gross);
    const cost = round2(gross + fee);
    if (cost > avail + 0.005) return close(ctx, o, "rejected", `אין מספיק כסף בקופה (נדרש ${cost}, פנוי ${avail})`);
    push(ctx, {
      d, kind: "buy", symbol: o.symbol, qty, price,
      cashIls: ccy === "ILS" ? -cost : 0, cashUsd: ccy === "USD" ? -cost : 0,
      fee: feesIls(fee), tax: 0, fxRate: ccy === "USD" ? fx : null, orderId: o.id,
      meta: { currency: ccy, gross, feeNative: fee, type: o.type },
    });
    Object.assign(o, { filledD: d, fillPrice: price, fillQty: qty });
    return close(ctx, o, "filled", null);
  }

  const qty = o.qty!;
  if (qty > availableShares(ctx, o.symbol, o)) return close(ctx, o, "rejected", "אין מספיק מניות בתיק");
  const pos = ctx.s.positions.get(o.symbol)!;
  const gross = round2(qty * price);
  const fee = tradeFee(ctx.p.fees, ccy, gross);
  const net = round2(gross - fee);
  const { costIls } = fifoCost(pos, qty);
  const gainIls = round2((ccy === "USD" ? net * fx : net) - costIls);
  const tax = taxDelta(ctx.s, d, gainIls); // שלילי = החזר מס על הפסד
  const taxFromSale = tax > 0 ? round2(ccy === "USD" ? tax / fx : tax) : 0;
  push(ctx, {
    d, kind: "sell", symbol: o.symbol, qty: -qty, price,
    cashIls: round2((ccy === "ILS" ? net - taxFromSale : 0) + (tax < 0 ? -tax : 0)),
    cashUsd: ccy === "USD" ? round2(net - taxFromSale) : 0,
    fee: feesIls(fee), tax, fxRate: ccy === "USD" ? fx : null, orderId: o.id,
    meta: { currency: ccy, gross, feeNative: fee, gainIls, costIls: round2(costIls), type: o.type },
  });
  Object.assign(o, { filledD: d, fillPrice: price, fillQty: qty });
  close(ctx, o, "filled", null);
}

/* ---------- יום אחד ---------- */

function custody(ctx: Ctx, d: string) {
  const md = d.slice(5);
  if (!["01-01", "04-01", "07-01", "10-01"].includes(md) || d <= ctx.p.startDate) return;
  if (ctx.p.fees.custodyPctYear <= 0 || ctx.s.done.has(eventKey("custody", null, d))) return;
  const prev = addDays(d, -1);
  const fx = ctx.m.fx(prev);
  let value = 0;
  for (const pos of ctx.s.positions.values()) {
    const px = ctx.m.closeOn(pos.symbol, prev) ?? 0;
    value += pos.qty * px * (pos.currency === "USD" ? fx : 1);
  }
  const fee = round2((value * ctx.p.fees.custodyPctYear) / 100 / 4);
  if (fee <= 0) return;
  push(ctx, { d, kind: "custody", symbol: null, qty: 0, price: null, cashIls: -fee, cashUsd: 0, fee, tax: 0, fxRate: null, orderId: null, meta: { valueIls: round2(value) } });
}

function symbolsInPlay(ctx: Ctx): Set<string> {
  const set = new Set(ctx.s.positions.keys());
  for (const o of pending(ctx)) set.add(o.symbol);
  return set;
}

function splits(ctx: Ctx, d: string) {
  for (const sym of symbolsInPlay(ctx)) {
    const r = ctx.m.split(sym, d);
    if (!r) continue;
    const pos = ctx.s.positions.get(sym);
    if (pos && !ctx.s.done.has(eventKey("split", sym, d))) {
      const exact = pos.qty * r;
      const newQty = Math.floor(exact + 1e-9);
      const lieu = round2((exact - newQty) * (ctx.m.closeOn(sym, d) ?? 0));
      push(ctx, {
        d, kind: "split", symbol: sym, qty: newQty - pos.qty, price: null,
        cashIls: pos.currency === "ILS" ? lieu : 0, cashUsd: pos.currency === "USD" ? lieu : 0,
        fee: 0, tax: 0, fxRate: null, orderId: null, meta: { ratio: r, before: pos.qty, after: newQty, cashInLieu: lieu },
      });
    }
    // פקודות ממתינות מותאמות לפיצול, כמו אצל ברוקר אמיתי
    for (const o of pending(ctx)) {
      if (o.symbol !== sym || o.createdD >= d || o.splitsApplied.includes(d)) continue;
      if (o.qty != null) o.qty = Math.max(1, Math.floor(o.qty * r));
      if (o.price != null) o.price = round2(o.price / r);
      o.splitsApplied = [...o.splitsApplied, d];
      ctx.touched.add(o);
    }
  }
}

function dividends(ctx: Ctx, d: string) {
  for (const pos of [...ctx.s.positions.values()]) {
    const div = ctx.m.dividend(pos.symbol, d);
    if (!div || ctx.s.done.has(eventKey("dividend", pos.symbol, d))) continue;
    const gross = round2(pos.qty * div);
    const tax = round2(gross * TAX_RATE);
    const net = round2(gross - tax);
    const fx = ctx.m.fx(d);
    push(ctx, {
      d, kind: "dividend", symbol: pos.symbol, qty: 0, price: div,
      cashIls: pos.currency === "ILS" ? net : 0, cashUsd: pos.currency === "USD" ? net : 0,
      fee: 0, tax: round2(pos.currency === "USD" ? tax * fx : tax), fxRate: pos.currency === "USD" ? fx : null, orderId: null,
      meta: { currency: pos.currency, perShare: div, shares: pos.qty, gross, taxNative: tax },
    });
  }
}

function deposit(ctx: Ctx, d: string) {
  const dep = ctx.p.deposit;
  if (!dep || dep.amount <= 0 || d <= ctx.p.startDate) return;
  if (Number(d.slice(8)) !== Math.min(dep.day, daysInMonth(d))) return;
  if (ctx.s.done.has(eventKey("deposit", null, d))) return;
  push(ctx, { d, kind: "deposit", symbol: null, qty: 0, price: null, cashIls: dep.amount, cashUsd: 0, fee: 0, tax: 0, fxRate: null, orderId: null, meta: { monthly: true } });
  if (!dep.autoBuy) return;

  const ccy = ctx.m.currency(dep.autoBuy);
  let budget = dep.amount;
  if (ccy === "USD") {
    const fx = ctx.m.fx(d);
    const c = convert(ctx.p.fees, "ILS", dep.amount, fx);
    push(ctx, { d, kind: "fx", symbol: null, qty: 0, price: null, cashIls: -dep.amount, cashUsd: c.received, fee: c.fee, tax: 0, fxRate: fx, orderId: null, meta: { from: "ILS", amount: dep.amount, received: c.received, auto: true } });
    budget = c.received;
  }
  const o: Order = {
    id: ctx.nextTempId--, portfolioId: ctx.p.id, createdD: d, activeFrom: addDays(d, 1), liveToday: false,
    side: "buy", symbol: dep.autoBuy, currency: ccy, qty: null, budget, type: "market", price: null,
    validity: "day", expiresD: null, status: "pending", reason: null, filledD: null, fillPrice: null, fillQty: null,
    reserved: budget, why: "הוראת קבע: קנייה אוטומטית מההפקדה החודשית", exitPlan: null, source: "auto", splitsApplied: [],
  };
  ctx.orders.push(o);
  ctx.newOrders.push(o);
}

function orders(ctx: Ctx, d: string) {
  for (const o of pending(ctx)) {
    if (o.activeFrom > d) continue;
    if (o.liveToday && d === o.createdD) continue;
    const bar = ctx.m.bar(o.symbol, d);
    if (!bar) continue;
    const px = triggerOnBar(o, bar);
    if (px != null) fill(ctx, o, d, px);
  }
}

function expire(ctx: Ctx, d: string) {
  if (!ctx.m.isComplete(d)) return;
  for (const o of pending(ctx)) {
    if (o.validity === "day") {
      if (o.activeFrom <= d && ctx.m.bar(o.symbol, d)) close(ctx, o, "expired", "לא בוצעה עד סוף יום המסחר");
    } else if (o.expiresD && d >= o.expiresD) {
      close(ctx, o, "expired", `פג תוקף אחרי ${GTC_DAYS} יום`);
    }
  }
}

export function processDay(ctx: Ctx, d: string) {
  custody(ctx, d);
  splits(ctx, d);
  dividends(ctx, d);
  deposit(ctx, d);
  orders(ctx, d);
  expire(ctx, d);
}

/** מעבד את הימים (from, to] */
export function processRange(ctx: Ctx, from: string, to: string) {
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) processDay(ctx, d);
}

/** במצב חי עם בורסה פתוחה: בדיקת פקודות ממתינות מול המחיר הנוכחי */
export function processLive(ctx: Ctx, today: string) {
  if (!ctx.m.live) return;
  for (const o of pending(ctx)) {
    if (o.activeFrom > today) continue;
    const q = ctx.m.live(o.symbol);
    if (q?.open && triggerOnPrice(o, q.price)) fill(ctx, o, today, q.price);
  }
}

/* ---------- פקודה חדשה ---------- */

export type OrderInput = {
  side: "buy" | "sell";
  symbol: string;
  qty: number;
  type: OrderType;
  price: number | null;
  validity: "day" | "gtc";
  why: string;
  exitPlan: string | null;
};

export type Estimate = {
  refPrice: number;
  currency: Ccy;
  gross: number;
  fee: number;
  total: number; // קנייה: יורד מהקופה. מכירה: נכנס לקופה (לפני מס)
  reserve: number;
  available: number; // קנייה: מזומן פנוי במטבע. מכירה: מניות פנויות
  shortfall: number; // כמה חסר (במטבע הנייר), 0 אם מספיק
};

export function estimate(ctx: Ctx, input: Pick<OrderInput, "side" | "symbol" | "qty" | "type" | "price">, refPrice: number): Estimate {
  const ccy = ctx.m.currency(input.symbol);
  // בלימיט/סטופ מעריכים לפי המחיר שנקבע, כי זה המחיר הצפוי
  const px = input.type === "market" || input.price == null ? refPrice : input.price;
  const gross = round2(input.qty * px);
  const fee = tradeFee(ctx.p.fees, ccy, gross);
  if (input.side === "buy") {
    const total = round2(gross + fee);
    const reserve = round2(input.type === "limit" ? total : total * (1 + RESERVE_BUFFER));
    const available = availableCash(ctx, ccy);
    return { refPrice, currency: ccy, gross, fee, total, reserve, available, shortfall: round2(Math.max(0, reserve - available)) };
  }
  const available = availableShares(ctx, input.symbol);
  return { refPrice, currency: ccy, gross, fee, total: round2(gross - fee), reserve: 0, available, shortfall: Math.max(0, input.qty - available) };
}

export function validateInput(i: OrderInput): string | null {
  if (!Number.isInteger(i.qty) || i.qty < 1) return "הכמות חייבת להיות מספר שלם של מניות (לפחות 1)";
  if (i.type !== "market" && !(i.price != null && i.price > 0)) return "צריך לקבוע מחיר לפקודת לימיט או סטופ";
  if (!i.why || i.why.trim().length < 3) return "צריך לכתוב למה (לפחות כמה מילים). נחזור לזה ביומן";
  return null;
}
