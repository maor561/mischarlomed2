/**
 * אימות מכונת הזמן (חבילה 3) על נתונים אמיתיים.
 * הרצה: npx tsx scripts/verify-timemachine.ts
 */
import { FEE_PRESETS } from "../src/lib/engine/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail++;
};
const ALL = { orders: true, market: true, drawdown: true, events: true };

async function main() {
  const svc = await import("../src/lib/engine/service");
  const tm = await import("../src/lib/timemachine/journey");

  /* ---- מסע רגיל: קורונה, שנה ---- */
  const id = await svc.createPortfolio({ name: "בדיקת מסע", mode: "time", startDate: "2020-02-03", capital: 50000, fees: FEE_PRESETS.online, deposit: null, length: "1y", benchmark: "SPY" });
  let p = await svc.loadPortfolio(id);
  check("תאריך סיום שנה קדימה", p.endDate === "2021-02-02", String(p.endDate));

  await svc.convertCash(id, "ILS", 40000);
  await svc.placeOrder(id, { side: "buy", symbol: "VOO", qty: 35, type: "market", price: null, validity: "day", why: "מדד לטווח ארוך", exitPlan: null });

  const stops: string[] = [];
  for (let i = 0; i < 40; i++) {
    const r = await svc.advanceUntil(id, 400, ALL);
    if (!r.stop) break;
    stops.push(`${r.stop.d}:${r.stop.kind}`);
    if (r.stop.kind === "end" || r.stop.kind === "present") break;
  }
  console.log("  עצירות:", stops.slice(0, 12).join(" | "), stops.length > 12 ? `… (${stops.length})` : "");
  check("עצירה ראשונה: הפקודה בוצעה ב-4.2", stops[0] === "2020-02-04:orders", stops[0]);
  check("עצירה באירוע שיא 19.2", stops.includes("2020-02-19:event"));
  check("עצירה בצניחה של 9.3 (שוק)", stops.includes("2020-03-09:market"));
  check("עצירה בירידה של 10% מהשיא", stops.some((s) => s.endsWith(":drawdown")));
  check("עצירה אחרונה: סוף המסע", stops.at(-1) === "2021-02-02:end", stops.at(-1));
  const ddCount = stops.filter((s) => s.endsWith(":drawdown")).length;
  check("התראת ירידה מהשיא לא חוזרת בלי שיא חדש", ddCount <= 2, `${ddCount} פעמים`);

  let threw = false;
  try {
    await svc.advanceUntil(id, 1, ALL);
  } catch (e) {
    threw = (e as Error).message.includes("המסע הסתיים");
  }
  check("אי אפשר לעבור את סוף המסע", threw);

  const ser = await tm.journeySeries(id);
  check("סדרה עם נקודות", ser.points.length > 200, `${ser.points.length} נקודות`);
  check("S&P 500 עלה בשנה הזו (פבר' 20 עד פבר' 21)", ser.ret.bench > 5 && ser.ret.bench < 30, `${ser.ret.bench}%`);
  // כ-70% מהתיק ב-VOO שירד 34% → ירידה של כ-22%, עם שפל ב-23.3
  check("ירידה מקסימלית בקריסה (~22%, שפל 23.3)", ser.drawdown.pct < -18 && ser.drawdown.pct > -27 && ser.drawdown.troughD === "2020-03-23", JSON.stringify(ser.drawdown));
  check("פחות עצירות שוק בזכות זמן השקט", stops.filter((s) => s.endsWith(":market")).length <= 10, `${stops.filter((s) => s.endsWith(":market")).length} עצירות שוק`);
  const last = ser.points.at(-1)!;
  const v = await svc.view(id);
  check("שווי בסוף הסדרה = שווי בתצוגה", Math.abs(last.v - v.totals.total) < 1, `${last.v} מול ${v.totals.total}`);

  const rep = await tm.journeyReport(id);
  check("דו\"ח: המסע הסתיים", rep.finished);
  check("דו\"ח: יש תובנות", rep.lessons.length >= 1, rep.lessons.map((l) => l.slice(0, 40)).join(" / "));
  check("דו\"ח: עסקה פתוחה מופיעה", rep.trades.best?.symbol === "VOO", JSON.stringify(rep.trades.best?.symbol));
  check("דו\"ח: קרן סל לא נחשבת ריכוז", !rep.lessons.some((l) => l.includes("VOO")), rep.lessons.join(" | ").slice(0, 120));
  check("דו\"ח: אין חשיפה למסע רגיל", rep.reveal === null);
  await svc.deletePortfolio(id);

  /* ---- מסע עיוור ---- */
  const bid = await svc.createPortfolio({ name: "עיוור", mode: "time", capital: 30000, fees: FEE_PRESETS.online, deposit: null, length: "1y", blind: "stormy" });
  p = await svc.loadPortfolio(bid);
  check("עיוור: נבחרה תקופה סוערת", p.blind && !!p.periodName && !!p.endDate, `${p.startDate} → ${p.endDate} (${p.periodName})`);
  const dateRe = /\d{4}-\d{2}-\d{2}/;
  const masked = JSON.stringify(tm.mask(p, await svc.view(bid)));
  check("עיוור: אין תאריכים בתצוגה", !dateRe.test(masked), masked.match(dateRe)?.[0] ?? "");
  check("עיוור: שם התקופה מוסתר", !masked.includes(p.periodName!));
  const r1 = await svc.advanceUntil(bid, 60, { ...ALL, month: true });
  check("עיוור: אין עצירה על אירוע היסטורי", r1.stop?.kind !== "event", r1.stop?.kind ?? "");
  const mStop = JSON.stringify(tm.mask(await svc.loadPortfolio(bid), r1));
  check("עיוור: באמצע המסע גם העצירה בלי תאריכים", !dateRe.test(mStop), mStop.slice(0, 120));
  const mRep = JSON.stringify(tm.mask(await svc.loadPortfolio(bid), await tm.journeyReport(bid)));
  check("עיוור: דו\"ח ביניים בלי תאריכים ובלי חשיפה", !dateRe.test(mRep) && mRep.includes('"reveal":null'));
  await svc.advanceUntil(bid, 400, {});
  p = await svc.loadPortfolio(bid);
  const rep2 = tm.mask(p, await tm.journeyReport(bid));
  check("עיוור: בסוף יש חשיפה עם שם התקופה", rep2.reveal?.name === p.periodName && rep2.reveal?.start === p.startDate, JSON.stringify(rep2.reveal));
  await svc.deletePortfolio(bid);

  console.log(fail ? `\n${fail} בדיקות נכשלו` : "\nכל הבדיקות עברו");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
