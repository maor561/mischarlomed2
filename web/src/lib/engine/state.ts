/**
 * מצב התיק נגזר תמיד מהיומן (ledger): מזומן, החזקות, מנות FIFO, רווחים ומס לפי שנה.
 * המנוע משתמש באותה פונקציית apply גם כשהוא מוסיף רשומה חדשה, כך שאין שתי דרכי חישוב.
 */
import { TAX_RATE, round2 } from "./money";
import type { Ccy, LedgerEntry } from "./types";

export type Lot = { qty: number; costCcy: number; costIls: number; d: string };
export type Position = { symbol: string; currency: Ccy; qty: number; lots: Lot[] };
export type YearTax = { realized: number; taxPaid: number; divTax: number };

export type State = {
  cash: Record<Ccy, number>;
  positions: Map<string, Position>;
  years: Map<number, YearTax>;
  costs: { trade: number; fx: number; custody: number };
  /** אירועים שכבר עובדו (פיצול/דיבידנד/הפקדה/משמרת), כדי שעיבוד חוזר לא יכפיל */
  done: Set<string>;
};

export const eventKey = (kind: string, symbol: string | null, d: string) => `${kind}:${symbol ?? ""}:${d}`;

export function emptyState(): State {
  return { cash: { ILS: 0, USD: 0 }, positions: new Map(), years: new Map(), costs: { trade: 0, fx: 0, custody: 0 }, done: new Set() };
}

function year(s: State, d: string): YearTax {
  const y = Number(d.slice(0, 4));
  let t = s.years.get(y);
  if (!t) s.years.set(y, (t = { realized: 0, taxPaid: 0, divTax: 0 }));
  return t;
}

/** עלות FIFO של מכירת qty מניות, בלי לשנות את המצב */
export function fifoCost(pos: Position, qty: number): { costIls: number; costCcy: number } {
  let left = qty,
    costIls = 0,
    costCcy = 0;
  for (const lot of pos.lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.qty);
    costIls += (lot.costIls * take) / lot.qty;
    costCcy += (lot.costCcy * take) / lot.qty;
    left -= take;
  }
  return { costIls, costCcy };
}

/** מגן מס שעובר לשנה y: הפסדים משנים קודמות שעוד לא קוזזו */
export function carryLossInto(s: State, y: number): number {
  let carry = 0;
  for (const yy of [...s.years.keys()].sort((a, b) => a - b)) {
    if (yy >= y) break;
    carry = Math.max(0, carry - s.years.get(yy)!.realized);
  }
  return carry;
}

/** כמה מס צריך לנכות (או להחזיר, אם שלילי) אחרי רווח/הפסד נוסף gainIls בשנה של d */
export function taxDelta(s: State, d: string, gainIls: number): number {
  const y = Number(d.slice(0, 4));
  const t = s.years.get(y) ?? { realized: 0, taxPaid: 0, divTax: 0 };
  const target = TAX_RATE * Math.max(0, t.realized + gainIls - carryLossInto(s, y));
  return round2(target - t.taxPaid);
}

export function apply(s: State, e: LedgerEntry): void {
  s.cash.ILS = round2(s.cash.ILS + e.cashIls);
  s.cash.USD = round2(s.cash.USD + e.cashUsd);
  if (["split", "dividend", "deposit", "custody"].includes(e.kind)) s.done.add(eventKey(e.kind, e.symbol, e.d));

  switch (e.kind) {
    case "fx":
      s.costs.fx += e.fee;
      break;
    case "custody":
      s.costs.custody += e.fee;
      break;
    case "buy": {
      const ccy = (e.meta.currency as Ccy) ?? "USD";
      let pos = s.positions.get(e.symbol!);
      if (!pos) s.positions.set(e.symbol!, (pos = { symbol: e.symbol!, currency: ccy, qty: 0, lots: [] }));
      const costCcy = -(ccy === "USD" ? e.cashUsd : e.cashIls);
      pos.lots.push({ qty: e.qty, costCcy, costIls: e.fxRate ? costCcy * e.fxRate : costCcy, d: e.d });
      pos.qty += e.qty;
      s.costs.trade += e.fee;
      break;
    }
    case "sell": {
      const pos = s.positions.get(e.symbol!)!;
      let left = -e.qty;
      while (left > 0 && pos.lots.length) {
        const lot = pos.lots[0];
        const take = Math.min(left, lot.qty);
        if (take === lot.qty) pos.lots.shift();
        else {
          const k = (lot.qty - take) / lot.qty;
          pos.lots[0] = { ...lot, qty: lot.qty - take, costCcy: lot.costCcy * k, costIls: lot.costIls * k };
        }
        left -= take;
      }
      pos.qty += e.qty;
      if (pos.qty === 0) s.positions.delete(e.symbol!);
      const t = year(s, e.d);
      t.realized = round2(t.realized + Number(e.meta.gainIls ?? 0));
      t.taxPaid = round2(t.taxPaid + e.tax);
      s.costs.trade += e.fee;
      break;
    }
    case "dividend":
      year(s, e.d).divTax = round2(year(s, e.d).divTax + e.tax);
      break;
    case "split": {
      const pos = s.positions.get(e.symbol!);
      const ratio = Number(e.meta.ratio);
      if (pos) {
        pos.lots = pos.lots.map((l) => ({ ...l, qty: l.qty * ratio }));
        pos.qty += e.qty;
        // פיצול הפוך שמשאיר שבר מניה: השבר נמכר במזומן (נרשם ב-cash של הרשומה), ומקטינים את המנה האחרונה
        const excess = pos.lots.reduce((a, l) => a + l.qty, 0) - pos.qty;
        if (excess > 1e-9) {
          const last = pos.lots[pos.lots.length - 1];
          const k = (last.qty - excess) / last.qty;
          pos.lots[pos.lots.length - 1] = { ...last, qty: last.qty - excess, costCcy: last.costCcy * k, costIls: last.costIls * k };
          pos.lots = pos.lots.filter((l) => l.qty > 1e-9);
        }
        if (pos.qty === 0) s.positions.delete(e.symbol!);
      }
      break;
    }
  }
}

export function replay(entries: LedgerEntry[]): State {
  const s = emptyState();
  for (const e of entries) apply(s, e);
  return s;
}
