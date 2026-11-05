/**
 * יומן המסחר (D24): כל עסקה עם הנימוק, הערות המנטור, מה קרה מאז מול המדד, בדיקה חוזרת,
 * הערות חופשיות ודפוסים לפי סוג נימוק. הכול נחתך ביום הסימולציה.
 */
import { query } from "../db";
import { addDays, round2, todayIL } from "../engine/money";
import { buildMarket, loadLedger, loadOrders, loadPortfolio, UserError, type LoadedMarket } from "../engine/service";
import { BENCH, type Order } from "../engine/types";
import { classifyReason, primaryTag, TAG_INFO, type ReasonTag } from "./rules";

export const REVIEW_AFTER_DAYS = 30;
export type Rating = "right" | "partial" | "wrong" | "luck";
export const RATINGS: Record<Rating, string> = { right: "✅ נכון", partial: "🟡 חלקית", wrong: "❌ לא נכון", luck: "🎲 מזל" };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

function closeOn(m: LoadedMarket, sym: string, d: string) {
  return m.closeOn(sym, d) ?? null;
}
/** מכפלת הפיצולים בין שני תאריכים: כדי להשוות מחיר של מניה "מקורית" לאורך זמן */
function splitFactor(m: LoadedMarket, sym: string, from: string, to: string) {
  let f = 1;
  for (const [d, r] of m.series.get(sym)?.splits ?? []) if (d > from && d <= to) f *= r;
  return f;
}

export async function journal(id: number) {
  const p = await loadPortfolio(id);
  const end = p.mode === "time" ? p.simDate : todayIL();
  const orders = (await loadOrders(id, false)).filter((o) => o.source === "user" && o.status === "filled" && o.filledD && o.filledD <= end);
  const ledger = await loadLedger(id);
  const reviews = new Map(
    (await query<{ order_id: number; d: string; rating: Rating; lesson: string | null }>(
      `SELECT order_id, d::text AS d, rating, lesson FROM journal_reviews WHERE portfolio_id=$1`, [id],
    )).map((r) => [Number(r.order_id), r]),
  );
  const notes = await query<{ id: number; d: string; text: string; context: string | null }>(
    `SELECT id, d::text AS d, text, context FROM journal_notes WHERE portfolio_id=$1 AND d <= $2 ORDER BY d DESC, id DESC`, [id, end],
  );

  const bench = BENCH[p.benchmark];
  const syms = new Set(orders.map((o) => o.symbol));
  syms.add(bench.index);
  const earliest = orders.reduce((a, o) => (o.filledD! < a ? o.filledD! : a), end);
  const m = await buildMarket(p, syms, end, addDays(earliest, -10));

  /** קנייה שהמניות שלה כבר נמכרו: נמדדת עד יום המכירה (שבו ההחזקה בנייר התאפסה), לא עד היום */
  function exitOf(o: Order): { d: string; price: number } | null {
    let qty = 0, after = false;
    for (const e of ledger) {
      if (e.symbol !== o.symbol || e.d > end) continue;
      if (e.orderId === o.id) after = true;
      qty += e.qty;
      if (after && e.orderId !== o.id && e.kind === "sell" && qty <= 0 && e.price) return { d: e.d, price: e.price };
    }
    return null;
  }

  const entries = orders.map((o: Order) => {
    const tags = (o.tags?.length ? o.tags : classifyReason(o.why)) as ReasonTag[];
    const exit = o.side === "buy" ? exitOf(o) : null;
    const until = exit?.d ?? end;
    const nowPx = exit ? exit.price : closeOn(m, o.symbol, end);
    const sinceFill = nowPx != null && o.fillPrice ? round2(((nowPx * splitFactor(m, o.symbol, o.filledD!, until)) / o.fillPrice - 1) * 100) : null;
    const b0 = closeOn(m, bench.index, o.filledD!), b1 = closeOn(m, bench.index, until);
    const benchPct = b0 && b1 ? round2((b1 / b0 - 1) * 100) : null;
    const sale = o.side === "sell" ? ledger.find((e) => e.kind === "sell" && e.orderId === o.id) : undefined;
    const realizedPct = sale && Number(sale.meta.costIls) ? round2((Number(sale.meta.gainIls) / Number(sale.meta.costIls)) * 100) : null;
    const age = daysBetween(o.filledD!, end);
    const review = reviews.get(o.id) ?? null;
    // קנייה: התוצאה היא מה קרה למניה מאז. מכירה: הרווח שמומש (ו"מאז המכירה" כמידע נוסף)
    const result = o.side === "buy" ? sinceFill : realizedPct;
    return {
      orderId: o.id, d: o.filledD!, side: o.side, symbol: o.symbol, qty: o.fillQty ?? o.qty, price: o.fillPrice, currency: o.currency, type: o.type,
      why: o.why, exitPlan: o.exitPlan, tags, primary: primaryTag(tags), mentor: o.mentor ?? [],
      sinceFill, benchPct, vsBench: o.side === "buy" && sinceFill != null && benchPct != null ? round2(sinceFill - benchPct) : null,
      realizedPct, result, age, soldOn: exit?.d ?? null,
      due: !review && (o.side === "sell" || age >= REVIEW_AFTER_DAYS),
      review,
    };
  });
  entries.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.orderId - a.orderId));

  // דפוסים לפי סוג הנימוק הראשי
  const groups = new Map<string, typeof entries>();
  for (const e of entries) groups.set(e.primary, [...(groups.get(e.primary) ?? []), e]);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const patterns = [...groups.entries()]
    .map(([tag, es]) => ({
      tag, label: TAG_INFO[tag as ReasonTag | "other"].label, count: es.length,
      avgResult: avg(es.map((e) => e.result)), avgVsBench: avg(es.map((e) => e.vsBench)),
      ratings: es.map((e) => e.review?.rating).filter((r): r is Rating => !!r),
    }))
    .sort((a, b) => (b.avgResult ?? -999) - (a.avgResult ?? -999));

  const scored = patterns.filter((x) => x.avgResult != null);
  // ⁦…⁩ מבודדים את המספר משמאל לימין בתוך טקסט עברי, כדי שהמינוס לא "יקפוץ" לסוף
  const fmt = (x: number) => `⁦${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}%⁩`;
  const best = scored[0], worst = scored.at(-1);
  const insight = best && worst && scored.length >= 2 && best.avgResult! - worst.avgResult! >= 3
    ? `ההחלטות שנימקת "${best.label}" ${best.avgResult! >= 0 ? "הצליחו יותר" : "הפסידו פחות"} (${fmt(best.avgResult!)} בממוצע) מאלה שנימקת "${worst.label}" (${fmt(worst.avgResult!)}). לפני כל פקודה, שאל את עצמך איזה מהסוגים האלה הנימוק שלך.`
    : null;

  return { simDate: end, entries, notes, patterns, insight, dueCount: entries.filter((e) => e.due).length };
}

export async function saveReview(id: number, orderId: number, rating: Rating, lesson: string | null) {
  if (!(rating in RATINGS)) throw new UserError("דירוג לא תקין");
  const p = await loadPortfolio(id);
  const [o] = await query(`SELECT id FROM orders WHERE id=$1 AND portfolio_id=$2 AND status='filled'`, [orderId, id]);
  if (!o) throw new UserError("העסקה לא נמצאה");
  const d = p.mode === "time" ? p.simDate : todayIL();
  await query(
    `INSERT INTO journal_reviews (order_id, portfolio_id, d, rating, lesson) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (order_id) DO UPDATE SET rating=$4, lesson=$5, d=$3`,
    [orderId, id, d, rating, lesson?.trim() || null],
  );
}

export async function addNote(id: number, text: string, context: string | null) {
  if (!text?.trim()) throw new UserError("ההערה ריקה");
  if (text.length > 2000) throw new UserError("ההערה ארוכה מדי");
  const p = await loadPortfolio(id);
  const d = p.mode === "time" ? p.simDate : todayIL();
  await query(`INSERT INTO journal_notes (portfolio_id, d, text, context) VALUES ($1,$2,$3,$4)`, [id, d, text.trim(), context?.slice(0, 200) ?? null]);
}

export type Journal = Awaited<ReturnType<typeof journal>>;
export type JournalEntry = Journal["entries"][number];
