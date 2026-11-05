/**
 * אימות שכבת הנתונים מול עובדות ידועות.
 * הרצה: npx tsx scripts/verify-data.ts
 */
import { getHistory, priceOn, splits, dividends, usdIls, getQuote, getInstrument, search } from "../src/lib/market";

let fail = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
  if (!ok) fail++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

async function main() {
  // 1. Apple ב-9.3.2020 נסגרה ב-‎$266.17 כפי שנסחר (לפני פיצול 4:1 באוגוסט 2020)
  const aapl = await priceOn("AAPL", "2020-03-09");
  check("AAPL כפי שנסחר 9.3.2020", !!aapl && near(aapl.close, 266.17, 0.05), `${aapl?.close.toFixed(2)}`);

  const sp = await splits("AAPL");
  check("פיצולי AAPL", sp.some((s) => s.d === "2020-08-31" && s.value === 4) && sp.some((s) => s.d === "2014-06-09" && s.value === 7), sp.map((s) => `${s.d}×${s.value}`).join(", "));

  // 2. סוף שבוע ← מחיר יום שישי
  const wkend = await priceOn("AAPL", "2020-03-08");
  check("שבת/ראשון מחזיר את יום המסחר האחרון", wkend?.d === "2020-03-06", `${wkend?.d}`);

  // 3. מחיר שאחרי הפיצול לא מוכפל
  const post = await priceOn("AAPL", "2020-09-01");
  check("AAPL אחרי הפיצול", !!post && post.close > 100 && post.close < 150, `${post?.close.toFixed(2)}`);

  // 4. טבע בת"א: בשקלים ולא באגורות
  const teva = await getInstrument("TEVA.TA");
  const tq = await getQuote("TEVA.TA");
  check("TEVA.TA במטבע שקל", teva?.currency === "ILS" && tq.price > 10 && tq.price < 1000, `${teva?.currency} ${tq.price}`);
  const tevaHist = await priceOn("TEVA.TA", "2020-03-09");
  check("TEVA.TA היסטורי בשקלים", !!tevaHist && tevaHist.close > 10 && tevaHist.close < 200, `${tevaHist?.d} ₪${tevaHist?.close.toFixed(2)}`);

  // 5. דולר-שקל
  const fx2020 = await usdIls("2020-03-09");
  const fxNow = await usdIls();
  check("שער דולר 9.3.2020", fx2020 > 3.3 && fx2020 < 3.8, fx2020.toFixed(4));
  check("שער דולר עכשיו", fxNow > 2.5 && fxNow < 4.5, fxNow.toFixed(4));

  // 6. דיבידנד של VOO ב-2020
  const div = await dividends("VOO", "2020-01-01", "2020-12-31");
  check("4 דיבידנדים של VOO ב-2020", div.length === 4, div.map((x) => `${x.d}:$${x.value.toFixed(4)}`).join(", "));

  // 6ב. שינוי יומי סביר (לא מול מחיר מלפני עשרות שנים)
  const aq = await getQuote("AAPL");
  const dchg = aq.prevClose ? Math.abs(aq.price / aq.prevClose - 1) : 1;
  check("שינוי יומי של AAPL סביר", dchg < 0.25, `${aq.prevClose} → ${aq.price}`);

  // 7. היסטוריה ארוכה
  const hist = await getHistory("VOO", { from: "2020-01-01", to: "2020-12-31" });
  check("VOO 2020 ~253 ימי מסחר", hist.length >= 250 && hist.length <= 254, `${hist.length} ימים`);

  // 8. חיפוש
  const s = await search("teva");
  check("חיפוש מוצא את טבע בת\"א", s.some((x) => x.symbol === "TEVA.TA"), s.map((x) => x.symbol).join(", "));

  // 9. מטמון: קריאה שנייה מהירה
  const t = Date.now();
  await getHistory("AAPL", { from: "2015-01-01" });
  check("קריאה שנייה מהמטמון", Date.now() - t < 1500, `${Date.now() - t}ms`);

  console.log(fail ? `\n${fail} בדיקות נכשלו` : "\nכל הבדיקות עברו");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
