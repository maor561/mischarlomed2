/**
 * אימות מנוע המסחר.
 * חלק א: נתונים סינתטיים, כל חוק מחושב ביד.
 * חלק ב: נתונים אמיתיים דרך השירות המלא ומסד הנתונים.
 * הרצה: npx tsx scripts/verify-engine.ts
 */
import { FEE_PRESETS, type Bar, type Market, type Order, type Portfolio } from "../src/lib/engine/types";
import { makeCtx, processRange, triggerOnBar, estimate, type Ctx } from "../src/lib/engine/process";
import { emptyState, apply } from "../src/lib/engine/state";
import { addDays } from "../src/lib/engine/money";

let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail++;
}
const near = (a: number, b: number, t = 0.011) => Math.abs(a - b) <= t;

/* ---------- עזרים סינתטיים ---------- */

type Synth = { bars: Record<string, Record<string, Partial<Bar>>>; ccy?: Record<string, "ILS" | "USD">; splits?: Record<string, Record<string, number>>; divs?: Record<string, Record<string, number>>; fx?: number };
function synthMarket(x: Synth): Market {
  const bar = (s: string, d: string) => {
    const b = x.bars[s]?.[d];
    if (!b) return undefined;
    const c = b.close ?? b.open!;
    return { d, open: b.open ?? c, high: b.high ?? Math.max(b.open ?? c, c), low: b.low ?? Math.min(b.open ?? c, c), close: c };
  };
  return {
    bar,
    closeOn: (s, d) => {
      const ds = Object.keys(x.bars[s] ?? {}).filter((k) => k <= d).sort();
      return ds.length ? bar(s, ds.at(-1)!)!.close : undefined;
    },
    fx: () => x.fx ?? 3.5,
    split: (s, d) => x.splits?.[s]?.[d],
    dividend: (s, d) => x.divs?.[s]?.[d],
    currency: (s) => x.ccy?.[s] ?? "ILS",
    isComplete: () => true,
  };
}

function pf(over: Partial<Portfolio> = {}): Portfolio {
  return { id: 1, name: "t", mode: "time", startDate: "2024-01-01", simDate: "2024-01-01", processedThrough: "2024-01-01", initialCapital: 100000, fees: { ...FEE_PRESETS.online, kind: "custom", ilPct: 0.1, ilMin: 5, usPct: 0.1, usMin: 2 }, deposit: null, createdAt: "", ...over };
}

let oid = 1;
function order(o: Partial<Order>): Order {
  return { id: oid++, portfolioId: 1, createdD: "2024-01-01", activeFrom: "2024-01-02", liveToday: false, side: "buy", symbol: "X", currency: "ILS", qty: 10, budget: null, type: "market", price: null, validity: "gtc", expiresD: "2024-12-31", status: "pending", reason: null, filledD: null, fillPrice: null, fillQty: null, reserved: 0, why: "t", exitPlan: null, source: "user", splitsApplied: [], ...o };
}

function ctxWith(m: Market, cashIls: number, orders: Order[], p = pf()): Ctx {
  const s = emptyState();
  apply(s, { portfolioId: 1, d: "2024-01-01", kind: "deposit", symbol: null, qty: 0, price: null, cashIls, cashUsd: 0, fee: 0, tax: 0, fxRate: null, orderId: null, meta: {} });
  return makeCtx(p, s, m, orders);
}

function partA() {
  console.log("\n— חלק א: חוקים על נתונים סינתטיים —");
  // 1. חוקי ביצוע על נר
  const bar = { d: "x", open: 95, high: 101, low: 90, close: 98 };
  check("לימיט קנייה 100 עם פתיחה 95 → 95", triggerOnBar({ side: "buy", type: "limit", price: 100 }, bar) === 95);
  check("לימיט קנייה 92 → 92", triggerOnBar({ side: "buy", type: "limit", price: 92 }, bar) === 92);
  check("לימיט קנייה 89 לא מתבצע", triggerOnBar({ side: "buy", type: "limit", price: 89 }, bar) === undefined);
  check("סטופ מכירה 97 עם פתיחה 95 (פער) → 95", triggerOnBar({ side: "sell", type: "stop", price: 97 }, bar) === 95);
  check("סטופ מכירה 91 → 91", triggerOnBar({ side: "sell", type: "stop", price: 91 }, bar) === 91);
  check("לימיט מכירה 100 → 100", triggerOnBar({ side: "sell", type: "limit", price: 100 }, bar) === 100);
  check("שוק → פתיחה", triggerOnBar({ side: "buy", type: "market", price: null }, bar) === 95);

  // 2. FIFO, עמלות ומס
  const m = synthMarket({ bars: { X: { "2024-01-02": { open: 100 }, "2024-01-03": { open: 120 }, "2024-01-04": { open: 130 }, "2024-01-05": { open: 80 }, "2025-01-02": { open: 150 } } } });
  const o1 = order({ activeFrom: "2024-01-02", validity: "day" });
  const o2 = order({ activeFrom: "2024-01-03", validity: "day" });
  const o3 = order({ side: "sell", qty: 15, activeFrom: "2024-01-04", validity: "day" });
  const ctx = ctxWith(m, 100000, [o1, o2, o3]);
  processRange(ctx, "2024-01-01", "2024-01-04");
  // קנייה 1: 1000 + עמלה 5 (מינימום). קנייה 2: 1200 + 5. מכירה 15×130=1950, עמלה 5 → נטו 1945
  // עלות FIFO: 10 מהמנה הראשונה (1005) + 5 מהשנייה (602.5) = 1607.5 → רווח 337.5 → מס 84.38
  const sell = ctx.entries.find((e) => e.kind === "sell")!;
  check("FIFO: רווח 337.50", near(Number(sell.meta.gainIls), 337.5), String(sell.meta.gainIls));
  check("מס 25% = 84.38", near(sell.tax, 84.38), String(sell.tax));
  check("מזומן אחרי 3 עסקאות", near(ctx.s.cash.ILS, 100000 - 1005 - 1205 + 1945 - 84.38), String(ctx.s.cash.ILS));
  check("נשארו 5 מניות", ctx.s.positions.get("X")?.qty === 5);

  // 3. הפסד באותה שנה מחזיר מס
  const o4 = order({ side: "sell", qty: 5, activeFrom: "2024-01-05", validity: "day" });
  ctx.orders.push(o4);
  processRange(ctx, "2024-01-04", "2024-01-05");
  // מכירה 5×80=400−5=395, עלות 602.5 → הפסד 207.5. נטו שנתי 130 → מס 32.5 → החזר 51.88
  const s2 = ctx.entries.filter((e) => e.kind === "sell")[1];
  check("הפסד: החזר מס 51.88", near(s2.tax, -51.88), String(s2.tax));
  check("מס שנתי נטו 32.50", near(ctx.s.years.get(2024)!.taxPaid, 32.5), String(ctx.s.years.get(2024)!.taxPaid));

  // 4. מגן מס עובר לשנה הבאה
  const m4 = synthMarket({ bars: { X: { "2024-01-02": { open: 100 }, "2024-06-03": { open: 50 }, "2025-01-02": { open: 100 }, "2025-02-03": { open: 130 } } } });
  // הפקודות נשלחות בזו אחר זו, כמו במציאות (פקודת מכירה ממתינה "תופסת" את המניות)
  const c4 = ctxWith(m4, 100000, [order({ qty: 10, activeFrom: "2024-01-02", validity: "day" })]);
  processRange(c4, "2024-01-01", "2024-01-02");
  c4.orders.push(order({ side: "sell", qty: 10, activeFrom: "2024-06-03", validity: "day" }));
  processRange(c4, "2024-01-02", "2024-06-03");
  c4.orders.push(order({ qty: 10, activeFrom: "2025-01-02", validity: "day" }));
  processRange(c4, "2024-06-03", "2025-01-02");
  c4.orders.push(order({ side: "sell", qty: 10, activeFrom: "2025-02-03", validity: "day" }));
  processRange(c4, "2025-01-02", "2025-02-03");
  // 2024: 1005 → 495 = הפסד 510. 2025: 1005 → 1295 = רווח 290 < 510 → אין מס
  const sells4 = c4.entries.filter((e) => e.kind === "sell");
  check("מגן מס: אין מס ב-2025 על רווח 290", sells4[1]?.tax === 0, `רווח ${sells4[1]?.meta.gainIls}, מס ${sells4[1]?.tax}`);

  // 5. פיצול: כמות מוכפלת ופקודת לימיט מותאמת
  const m5 = synthMarket({ bars: { X: { "2024-01-02": { open: 400 }, "2024-01-03": { open: 100, low: 95 }, "2024-01-04": { open: 99, low: 70 } } }, splits: { X: { "2024-01-03": 4 } } });
  const lim = order({ side: "buy", qty: 2, type: "limit", price: 360, activeFrom: "2024-01-02", reserved: 800, createdD: "2024-01-01" });
  const c5 = ctxWith(m5, 10000, [order({ qty: 10, activeFrom: "2024-01-02", validity: "day" }), lim]);
  processRange(c5, "2024-01-01", "2024-01-03");
  check("פיצול 4:1: 10 מניות הופכות ל-40", c5.s.positions.get("X")?.qty === 40, String(c5.s.positions.get("X")?.qty));
  check("לימיט 360×2 הופך ל-90×8 ולא מתבצע מיד", lim.price === 90 && lim.qty === 8 && lim.status === "pending", `${lim.qty}@${lim.price} ${lim.status}`);
  processRange(c5, "2024-01-03", "2024-01-04");
  check("הלימיט המותאם מתבצע ב-90", lim.status === "filled" && lim.fillPrice === 90);
  const avg = c5.s.positions.get("X")!.lots[0];
  check("עלות המנה לא השתנתה בפיצול", near(avg.costIls, 4005), String(avg.costIls));

  // 6. דיבידנד: רק למי שהחזיק לפני יום האקס
  const m6 = synthMarket({ bars: { X: { "2024-01-02": { open: 100 }, "2024-01-03": { open: 100 } } }, divs: { X: { "2024-01-03": 2 } } });
  const c6 = ctxWith(m6, 10000, [order({ qty: 10, activeFrom: "2024-01-02", validity: "day" }), order({ qty: 5, activeFrom: "2024-01-03", validity: "day" })]);
  processRange(c6, "2024-01-01", "2024-01-03");
  const div = c6.entries.find((e) => e.kind === "dividend");
  check("דיבידנד על 10 מניות בלבד, נטו 15", div?.cashIls === 15 && div?.tax === 5, `${div?.meta.shares} מניות, נטו ${div?.cashIls}`);

  // 7. הפקדה חודשית וקנייה אוטומטית בדולרים
  const m7 = synthMarket({ bars: { V: { "2024-02-01": { open: 100 }, "2024-02-02": { open: 100 } } }, ccy: { V: "USD" }, fx: 4 });
  const c7 = ctxWith(m7, 0, [], pf({ deposit: { amount: 1000, day: 1, autoBuy: "V" } }));
  processRange(c7, "2024-01-01", "2024-02-02");
  const buy7 = c7.entries.find((e) => e.kind === "buy");
  // 1000 ₪ − 0.2% = 998 → $249.50. 2 מניות × 100 + עמלה $2 = $202
  check("הוראת קבע: המרה ל-$249.50 וקנייה של 2 מניות", buy7?.qty === 2 && near(c7.s.cash.USD, 47.5), `${buy7?.qty} מניות, נשאר $${c7.s.cash.USD}`);

  // 8. אין מספיק כסף ביום הביצוע
  const m8 = synthMarket({ bars: { X: { "2024-01-02": { open: 200 } } } });
  const o8 = order({ qty: 10, activeFrom: "2024-01-02", validity: "day" });
  const c8 = ctxWith(m8, 1500, [o8]);
  processRange(c8, "2024-01-01", "2024-01-02");
  check("פקודה ללא כיסוי נדחית", o8.status === "rejected", o8.reason ?? "");

  // 9. דמי משמרת רבעוניים
  const m9 = synthMarket({ bars: { X: { "2024-01-02": { open: 100 }, "2024-03-29": { open: 100 } } } });
  const c9 = ctxWith(m9, 20000, [order({ qty: 100, activeFrom: "2024-01-02", validity: "day" })], pf({ fees: { ...FEE_PRESETS.bank } }));
  processRange(c9, "2024-01-01", "2024-04-01");
  const cus = c9.entries.find((e) => e.kind === "custody");
  check("דמי משמרת 0.15%/4 על 10,000 = 3.75", cus?.fee === 3.75 && cus?.d === "2024-04-01", `${cus?.fee} ב-${cus?.d}`);

  // 10. פקודת יום שלא בוצעה פגה; GTC נשארת
  const m10 = synthMarket({ bars: { X: { "2024-01-02": { open: 100, low: 99 } } } });
  const day = order({ type: "limit", price: 90, validity: "day", activeFrom: "2024-01-02" });
  const gtc = order({ type: "limit", price: 90, validity: "gtc", activeFrom: "2024-01-02", expiresD: addDays("2024-01-01", 90) });
  const c10 = ctxWith(m10, 10000, [day, gtc]);
  processRange(c10, "2024-01-01", "2024-01-02");
  check("פקודת יום פגה, GTC ממתינה", day.status === "expired" && gtc.status === "pending");

  // 11. הערכה ושמירת מקום
  const est = estimate(ctxWith(m8, 1500, []), { side: "buy", symbol: "X", qty: 5, type: "market", price: null }, 200);
  check("הערכה: 1000+5, שמירה +10% = 1105.5", est.total === 1005 && est.reserve === 1105.5 && est.shortfall === 0, JSON.stringify(est));
}

/* ---------- חלק ב: נתונים אמיתיים ---------- */

async function partB() {
  console.log("\n— חלק ב: נתונים אמיתיים דרך השירות —");
  const svc = await import("../src/lib/engine/service");
  const id = await svc.createPortfolio({ name: "בדיקה", mode: "time", startDate: "2020-02-03", capital: 50000, fees: FEE_PRESETS.online, deposit: null });
  const { priceOn } = await import("../src/lib/market");
  const rate = (await priceOn("ILS=X", "2020-02-03"))!.close;
  const c = await svc.convertCash(id, "ILS", 20000);
  check("המרה ₪20,000 ב-3.2.2020 (עמלה 0.2%)", near(c.received, (20000 - 40) / rate), `$${c.received} בשער ${rate.toFixed(4)}`);

  const q = await svc.quoteForOrder(id, { side: "buy", symbol: "AAPL", qty: 10, type: "market", price: null });
  check("מחיר ייחוס AAPL ב-3.2.2020 כפי שנסחר (~$308.66)", near(q.refPrice, 308.66, 0.05), `$${q.refPrice}`);

  await svc.placeOrder(id, { side: "buy", symbol: "AAPL", qty: 10, type: "market", price: null, validity: "day", why: "בדיקת מנוע", exitPlan: null });
  await svc.placeOrder(id, { side: "buy", symbol: "AAPL", qty: 5, type: "limit", price: 250, validity: "gtc", why: "לקנות בירידה", exitPlan: null });
  let v = await svc.view(id);
  check("פקודה ממתינה לפני קידום הזמן", v.pending.length === 2 && v.positions.length === 0);

  await svc.advance(id, "2020-02-05");
  v = await svc.view(id);
  const aapl = v.positions.find((x) => x.symbol === "AAPL");
  const o = v.orders.find((x) => x.type === "market");
  check("נקנתה בפתיחה של 4.2.2020 (~$315.31)", o?.filledD === "2020-02-04" && near(o?.fillPrice ?? 0, 315.31, 0.05), `${o?.filledD} $${o?.fillPrice}`);
  check("10 מניות בתיק", aapl?.qty === 10);

  await svc.advance(id, "2020-03-23");
  v = await svc.view(id);
  const lim = v.orders.find((x) => x.type === "limit");
  check("לימיט $250 התבצע בקריסת מרץ 2020", lim?.status === "filled" && (lim?.fillPrice ?? 999) <= 250, `${lim?.filledD} $${lim?.fillPrice}`);

  await svc.advance(id, "2020-09-01");
  v = await svc.view(id);
  const after = v.positions.find((x) => x.symbol === "AAPL");
  check("אחרי פיצול 31.8.2020: 15 → 60 מניות", after?.qty === 60, String(after?.qty));
  const divs = v.history.filter((e) => e.kind === "dividend");
  // פברואר: 10 מניות × $0.77. מאי ואוגוסט: 15 מניות × $0.82. נטו אחרי 25%
  check(
    "3 דיבידנדים של AAPL (פבר', מאי, אוג')",
    divs.length === 3 && divs.some((e) => near(e.cashUsd, 5.78, 0.02)) && divs.filter((e) => near(e.cashUsd, 9.23, 0.02)).length === 2,
    divs.map((e) => `${e.d}: $${e.cashUsd}`).join(", "),
  );

  await svc.placeOrder(id, { side: "sell", symbol: "AAPL", qty: 60, type: "market", price: null, validity: "day", why: "מימוש רווח לבדיקה", exitPlan: null });
  await svc.advance(id, "2020-09-03");
  v = await svc.view(id);
  const sale = v.history.find((e) => e.kind === "sell");
  check("מכירה עם מס 25% על הרווח בשקלים", !!sale && sale.tax > 0 && near(sale.tax, Number(sale.meta.gainIls) * 0.25, 0.02), `רווח ₪${sale?.meta.gainIls}, מס ₪${sale?.tax}`);
  check("התיק ריק ממניות", v.positions.length === 0);

  // עקביות: הכסף שווה לסכום התנועות
  const sumUsd = v.history.reduce((a, e) => a + e.cashUsd, 0);
  check("קופת הדולר = סכום התנועות", near(v.cash.USD, sumUsd, 0.02), `$${v.cash.USD}`);

  let blocked = false;
  try {
    await svc.placeOrder(id, { side: "sell", symbol: "MSFT", qty: 1, type: "market", price: null, validity: "day", why: "אין לי", exitPlan: null });
  } catch (e) {
    blocked = e instanceof svc.UserError;
  }
  check("אי אפשר למכור מניה שאין", blocked);

  let future = false;
  try {
    await svc.placeOrder(id, { side: "buy", symbol: "ABNB", qty: 1, type: "market", price: null, validity: "day", why: "עוד לא הונפקה", exitPlan: null });
  } catch (e) {
    future = (e as Error).message.includes("עוד לא נסחרה");
  }
  check("אין הצצה לעתיד: Airbnb לא נסחרה בספטמבר 2020", future);
  await svc.deletePortfolio(id);
}

async function main() {
  partA();
  await partB();
  console.log(fail ? `\n${fail} בדיקות נכשלו` : "\nכל הבדיקות עברו");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
