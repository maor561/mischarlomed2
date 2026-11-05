/**
 * אימות מבנה מסלול השיעורים (חבילה 6).
 * הרצה: npx tsx scripts/verify-lessons.ts
 */
import { LESSONS, MODULES, LESSON_FOR_NOTE } from "../src/lib/lessons/content";
import { GLOSSARY_BY_ID } from "../src/lib/glossary";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) console.log(`✗ ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail++;
};

check("28 שיעורים", LESSONS.length === 28, String(LESSONS.length));
LESSONS.forEach((l, i) => {
  check(`שיעור ${l.n}: מספור רציף`, l.n === i + 1);
  check(`שיעור ${l.n}: מודול קיים`, MODULES.some((m) => m.n === l.module));
  check(`שיעור ${l.n}: 4 שיעורים במודול`, LESSONS.filter((x) => x.module === l.module).length === 4);
  check(`שיעור ${l.n}: 3 שאלות`, l.quiz.length === 3);
  for (const q of l.quiz) {
    check(`שיעור ${l.n}: תשובה בטווח`, q.answer >= 0 && q.answer < q.options.length, q.q);
    check(`שיעור ${l.n}: הסבר`, q.explain.length > 10, q.q);
  }
  for (const t of l.terms) check(`שיעור ${l.n}: מונח ${t} במילון`, GLOSSARY_BY_ID.has(t));
  check(`שיעור ${l.n}: משימה עם צעדים`, l.mission.steps.length >= 2);
  const s = l.mission.setup;
  if (s?.start) check(`שיעור ${l.n}: תאריך התחלה תקין`, /^\d{4}-\d{2}-\d{2}$/.test(s.start) && s.start < "2026-01-01", s.start);
  if (s && !s.start && !s.blind && s.mode !== "live") check(`שיעור ${l.n}: למשימה יש תאריך או עיוור`, false);
  if (l.module === 7) check(`שיעור ${l.n}: המלצה ליועץ מורשה`, l.body.some((p) => p.includes("בעל רישיון")));
});
for (const [id, n] of Object.entries(LESSON_FOR_NOTE)) check(`הערת מנטור ${id} → שיעור קיים`, n >= 1 && n <= 28);
// מודול 7: בלי מספרי תקרות שמשתנים כל שנה (D28)
for (const l of LESSONS.filter((x) => x.module === 7)) {
  check(`שיעור ${l.n}: בלי סכומי תקרה`, !/תקרה.{0,20}₪\d/.test(l.body.join(" ")));
}

console.log(fail ? `\n${fail} בדיקות נכשלו` : `כל הבדיקות עברו (${LESSONS.length} שיעורים, ${LESSONS.length * 3} שאלות)`);
process.exit(fail ? 1 : 0);
