/**
 * אימות רשימת האירועים מול נתוני S&P 500 (^GSPC):
 * - אירוע עם spx: השינוי היומי בפועל צריך להיות קרוב (±0.6 נקודות אחוז)
 * - תאריכי שיא/שפל שמוזכרים בטקסט נבדקים בנפרד
 * הרצה: npx tsx scripts/verify-events.ts
 */
import { getHistory } from "../src/lib/market";
import { EVENTS, STORMY } from "../src/lib/timemachine/events";

let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
  if (!ok) fail++;
};

async function main() {
  const bars = await getHistory("^GSPC", { from: "1995-01-01" });
  const idx = new Map(bars.map((b, i) => [b.d, i]));
  const change = (d: string) => {
    const i = idx.get(d);
    if (i == null || i === 0) return null;
    return (bars[i].close / bars[i - 1].close - 1) * 100;
  };

  for (const e of EVENTS) {
    if (e.spx == null) continue;
    const c = change(e.d);
    check(`${e.d} ${e.title}`, c != null && Math.abs(c - e.spx) <= 0.6, `צפוי ${e.spx}%, בפועל ${c?.toFixed(2)}%`);
  }

  // שיאים ושפלים שהטקסט מציין
  const maxUntil = (from: string, to: string) => bars.filter((b) => b.d >= from && b.d <= to).reduce((a, b) => (b.close > a.close ? b : a));
  const minUntil = (from: string, to: string) => bars.filter((b) => b.d >= from && b.d <= to).reduce((a, b) => (b.close < a.close ? b : a));
  const peaks: [string, string, string][] = [
    ["2007-10-09", "2007-01-01", "2008-12-31"],
    ["2020-02-19", "2019-06-01", "2020-06-30"],
    ["2022-01-03", "2021-06-01", "2022-12-31"],
    ["2000-03-24", "1999-06-01", "2001-12-31"],
  ];
  for (const [d, a, b] of peaks) check(`שיא ${d}`, maxUntil(a, b).d === d, `השיא בפועל ${maxUntil(a, b).d}`);
  const troughs: [string, string, string][] = [
    ["2002-10-09", "2002-01-01", "2003-06-30"],
    ["2009-03-09", "2008-06-01", "2009-12-31"],
    ["2020-03-23", "2020-01-01", "2020-12-31"],
    ["2022-10-12", "2022-01-01", "2023-06-30"],
  ];
  for (const [d, a, b] of troughs) check(`שפל ${d}`, minUntil(a, b).d === d, `השפל בפועל ${minUntil(a, b).d}`);

  const p = bars[idx.get("2007-10-09")!].close, t = bars[idx.get("2009-03-09")!].close;
  check("ירידה 2007–2009 ≈ 57%", Math.abs((1 - t / p) * 100 - 57) < 1, `${((1 - t / p) * 100).toFixed(1)}%`);
  const p2 = bars[idx.get("2020-02-19")!].close, t2 = bars[idx.get("2020-03-23")!].close;
  check("ירידת הקורונה ≈ 34%", Math.abs((1 - t2 / p2) * 100 - 34) < 1, `${((1 - t2 / p2) * 100).toFixed(1)}%`);

  for (const s of STORMY) {
    const before = bars.filter((b) => b.d <= s.peak).slice(-60);
    const after = bars.filter((b) => b.d > s.peak).slice(0, 250);
    const hi = Math.max(...before.map((b) => b.close));
    const lo = Math.min(...after.map((b) => b.close));
    check(`סוערת ${s.name}`, idx.has(s.peak) && lo / hi < 0.9, `ירידה של ${((1 - lo / hi) * 100).toFixed(0)}% בשנה שאחרי`);
  }

  console.log(fail ? `\n${fail} בדיקות נכשלו` : "\nכל הבדיקות עברו");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
