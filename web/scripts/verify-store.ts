/**
 * בדיקות החנות (חבילה 12): כל נייר באוספים קיים ב-Yahoo עם היסטוריה,
 * במכונת זמן נייר שעוד לא נסחר לא זמין לקנייה, וקנייה של אוסף יוצרת פקודה לכל נייר זמין.
 * הרצה: npm run verify:store
 */
import { COLLECTIONS } from "../src/lib/store/collections";
import { buyCollection, storeView } from "../src/lib/store/store";
import * as svc from "../src/lib/engine/service";
import { FEE_PRESETS } from "../src/lib/engine/types";
import { getHistory, getInstrument } from "../src/lib/market";

let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail++;
}

(async () => {
  console.log("\n— אוספים —");
  check("8 אוספים", COLLECTIONS.length === 8);
  check("בכל אוסף 5 עד 10 ניירות", COLLECTIONS.every((c) => c.symbols.length >= 5 && c.symbols.length <= 10));
  const missing: string[] = [];
  for (const s of new Set(COLLECTIONS.flatMap((c) => c.symbols))) {
    const m = await getInstrument(s).catch(() => null);
    const h = m ? await getHistory(s, { from: "2024-01-01" }) : [];
    if (!m || h.length < 100) missing.push(s);
  }
  check("לכל נייר יש נתונים ב-Yahoo", !missing.length, missing.join(", "));

  console.log("\n— מכונת זמן —");
  const id = await svc.createPortfolio({ name: "בדיקת חנות", mode: "time", startDate: "2018-03-01", capital: 20000, fees: FEE_PRESETS.app, deposit: null });
  const v = await storeView(id);
  const ai = v.collections.find((c) => c.id === "ai")!;
  const pltr = ai.items.find((x) => x.symbol === "PLTR");
  check("PLTR לא זמינה ב-2018 (נסחרת מ-2020)", !!pltr && !pltr.available && pltr.since === "2020-09-30", JSON.stringify(pltr?.since));
  check("NVDA זמינה, במחיר של אז (לפני הפיצולים)", !!ai.items.find((x) => x.symbol === "NVDA" && x.available && x.price! > 150));
  check("יש רשימת \"הפעילים ביותר\"", v.active.length > 0, v.active.slice(0, 3).map((x) => x.symbol).join(","));
  const r = await buyCollection(id, "ai", 1400);
  check("קנייה של אוסף: פקודה לכל נייר זמין (7)", r.results.length === 7 && r.results.every((x) => !x.error), `₪${r.share} לכל אחד`);
  let tooSmall = false;
  try {
    await buyCollection(id, "broad", 30);
  } catch (e) {
    tooSmall = (e as Error).message.includes("המינימום");
  }
  check("סכום קטן מדי לחלוקה נחסם", tooSmall);
  await svc.deletePortfolio(id);

  console.log(fail ? `\n${fail} בדיקות נכשלו` : "\nכל הבדיקות עברו");
  process.exit(fail ? 1 : 0);
})();
