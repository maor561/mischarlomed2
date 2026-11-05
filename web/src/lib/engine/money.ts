import type { Ccy, FeeProfile } from "./types";

export const TAX_RATE = 0.25;
export const RESERVE_BUFFER = 0.1; // שומרים בקופה הערכה + 10%
export const GTC_DAYS = 90;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** עמלת קנייה/מכירה במטבע הנייר */
export function tradeFee(fees: FeeProfile, ccy: Ccy, gross: number): number {
  const [pct, min] = ccy === "USD" ? [fees.usPct, fees.usMin] : [fees.ilPct, fees.ilMin];
  if (gross <= 0) return 0;
  return round2(Math.max((gross * pct) / 100, min));
}

export const toIls = (amount: number, ccy: Ccy, fx: number) => (ccy === "USD" ? amount * fx : amount);

/** המרת מט"ח: העמלה נגבית במטבע המקור */
export function convert(fees: FeeProfile, from: Ccy, amount: number, fx: number) {
  const fee = round2((amount * fees.fxPct) / 100);
  const net = amount - fee;
  const received = round2(from === "ILS" ? net / fx : net * fx);
  const effectiveRate = from === "ILS" ? amount / received : received / amount;
  return { fee, received, effectiveRate };
}

/** תאריכים כמחרוזות YYYY-MM-DD */
export function addDays(d: string, n: number): string {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function todayIL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export const quarterOf = (d: string) => `${d.slice(0, 4)}Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;

export function daysInMonth(d: string): number {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
