/**
 * אימות המנטור והיומן (חבילה 5).
 * הרצה: npx tsx scripts/verify-mentor.ts
 */
import { classifyReason, mentorOnOrder, type OrderFacts } from "../src/lib/mentor/rules";
import { FEE_PRESETS } from "../src/lib/engine/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail++;
};

function partA() {
  console.log("\n— כללים —");
  const cases: [string, string][] = [
    ["כולם מדברים על זה, עלתה 30% החודש ואני לא רוצה לפספס", "fomo"],
    ["זה רק ייגמר רע, יוצא לפני שיירד עוד", "panic"],
    ["בסיס רחב של כל השוק לטווח ארוך", "long"],
    ["המניה ירדה 20% מהשיא, הזדמנות", "dip"],
    ["חבר המליץ בקבוצת טלגרם", "tip"],
    ["הרווחים גדלים והמכפיל נמוך מהמתחרים", "fundamental"],
    ["הגעתי ליעד שקבעתי", "plan"],
  ];
  for (const [text, want] of cases) {
    const tags = classifyReason(text);
    check(`"${text.slice(0, 30)}…" → ${want}`, tags[0] === want, tags.join(","));
  }
  check("טקסט ניטרלי → אין תגיות", classifyReason("קנייה").length === 0);

  const base: OrderFacts = { side: "buy", symbol: "NVDA", kind: "EQUITY", why: "", exitPlan: null, grossIls: 10000, feeIls: 10, totalIls: 50000, positionIls: 0, cashIls: 30000, positionPnlPct: null, daysSinceLastBuy: null, marketFromPeak: -2, benchLabel: "S&P 500" };
  const ids = (f: Partial<OrderFacts>) => mentorOnOrder({ ...base, ...f }).notes.map((n) => n.id);
  check("FOMO בקנייה → הערה חמורה ראשונה", mentorOnOrder({ ...base, why: "כולם קונים, לא לפספס" }).notes[0]?.id === "fomo");
  check("ריכוז 46% → bad", mentorOnOrder({ ...base, why: "x", grossIls: 23000 }).notes.find((n) => n.id === "concentration")?.level === "bad");
  check("ריכוז 30% → warn", mentorOnOrder({ ...base, why: "x", grossIls: 15000 }).notes.find((n) => n.id === "concentration")?.level === "warn");
  check("קרן סל לא נחשבת ריכוז", !ids({ kind: "ETF", grossIls: 30000, why: "x" }).includes("concentration"));
  check("מכירה בהפסד בשוק יורד → panic-sell", ids({ side: "sell", positionPnlPct: -12, marketFromPeak: -20, why: "x" }).includes("panic-sell"));
  check("מכירה ברווח בשוק יורד → אין panic-sell", !ids({ side: "sell", positionPnlPct: 5, marketFromPeak: -20, why: "x" }).includes("panic-sell"));
  check("מכירה 3 ימים אחרי קנייה → overtrading", ids({ side: "sell", daysSinceLastBuy: 3, why: "x" }).includes("overtrading"));
  check("עמלה 2% → fee", ids({ grossIls: 300, feeIls: 6, why: "x" }).includes("fee"));
  check("קנייה בלי תוכנית יציאה → no-exit", ids({ why: "x" }).includes("no-exit"));
  check("עם תוכנית יציאה → אין no-exit", !ids({ why: "x", exitPlan: "אם תרד 15%" }).includes("no-exit"));
  check("קרן + טווח ארוך → good", ids({ kind: "ETF", why: "מדד לטווח ארוך" }).includes("long-etf"));
}

async function partB() {
  console.log("\n— יומן על נתונים אמיתיים —");
  const svc = await import("../src/lib/engine/service");
  const jr = await import("../src/lib/mentor/journal");
  const id = await svc.createPortfolio({ name: "בדיקת יומן", mode: "time", startDate: "2020-02-03", capital: 60000, fees: FEE_PRESETS.online, deposit: null, length: "1y" });
  await svc.convertCash(id, "ILS", 55000);

  const q = await svc.quoteForOrder(id, { side: "buy", symbol: "AAPL", qty: 30, type: "market", price: null, why: "כולם קונים ואני לא רוצה לפספס", exitPlan: null });
  check("הערכה כוללת הערות מנטור", q.mentor.notes.some((n) => n.id === "fomo") && q.mentor.tags[0] === "fomo", q.mentor.notes.map((n) => n.id).join(","));

  await svc.placeOrder(id, { side: "buy", symbol: "AAPL", qty: 30, type: "market", price: null, validity: "day", why: "כולם קונים ואני לא רוצה לפספס", exitPlan: null });
  await svc.placeOrder(id, { side: "buy", symbol: "VOO", qty: 10, type: "market", price: null, validity: "day", why: "מדד לטווח ארוך", exitPlan: "לא נוגע עשר שנים" });
  await svc.advance(id, "2020-03-16");
  await svc.placeOrder(id, { side: "sell", symbol: "AAPL", qty: 30, type: "market", price: null, validity: "day", why: "מפחד שזה ייגמר רע", exitPlan: null });
  await svc.advance(id, "2020-03-18");

  let j = await jr.journal(id);
  check("3 עסקאות ביומן", j.entries.length === 3, j.entries.map((e) => `${e.side}:${e.symbol}:${e.primary}`).join(" "));
  const sell = j.entries.find((e) => e.side === "sell");
  check("המכירה נשמרה עם הערת panic-sell", !!sell?.mentor.some((n) => n.id === "panic-sell"), sell?.mentor.map((n) => n.id).join(","));
  check("מכירה ממתינה לבדיקה מיד", sell?.due === true);
  check("קניות מלפני 43 יום ממתינות לבדיקה", j.entries.filter((e) => e.side === "buy").every((e) => e.due), j.entries.map((e) => `${e.symbol}:${e.age}d:${e.due}`).join(" "));

  await jr.saveReview(id, sell!.orderId, "wrong", "מכרתי בדיוק בשפל");
  await jr.addNote(id, "לא מוכר את VOO, קניתי לעשר שנים", "S&P 500 צנח 12%");
  await svc.advance(id, "2020-09-01");
  j = await jr.journal(id);
  check("הבדיקה נשמרה", j.entries.find((e) => e.side === "sell")?.review?.rating === "wrong");
  check("ההערה ביומן", j.notes.length === 1 && j.notes[0].context === "S&P 500 צנח 12%");
  check("2 ממתינות לבדיקה", j.dueCount === 2, String(j.dueCount));
  const voo = j.entries.find((e) => e.symbol === "VOO")!;
  check("VOO: תוצאה מאז הקנייה ומול המדד", voo.sinceFill != null && voo.benchPct != null && Math.abs(voo.vsBench!) < 3, `${voo.sinceFill}% מול ${voo.benchPct}%`);
  const aapl = j.entries.find((e) => e.symbol === "AAPL" && e.side === "buy")!;
  check("AAPL קנייה שנמכרה: נמדדת עד המכירה (הפסד), לא עד היום", aapl.soldOn === "2020-03-17" && aapl.sinceFill != null && aapl.sinceFill < 0, `${aapl.sinceFill}% עד ${aapl.soldOn}`);
  check("תובנה: טווח ארוך מנצח את FOMO", j.patterns[0].label === "טווח ארוך" && !!j.insight, j.patterns.map((x) => `${x.label}:${x.avgResult}%`).join(" | "));
  check("דפוסים לפי סוג נימוק", j.patterns.length >= 2, j.patterns.map((x) => `${x.label}:${x.avgResult}%`).join(" | "));
  console.log("  תובנה:", j.insight);
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
