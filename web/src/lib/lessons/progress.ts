import { query } from "../db";
import { UserError } from "../engine/service";
import { LESSONS, LESSON_BY_N } from "./content";

export type LessonProgress = { n: number; quiz: boolean; mission: boolean; note: string | null };

export async function getProgress(): Promise<{ items: LessonProgress[]; done: number; total: number; next: number | null }> {
  const rows = await query<{ n: number; quiz_done: boolean; mission_done: boolean; note: string | null }>(`SELECT n, quiz_done, mission_done, note FROM lesson_progress`);
  const by = new Map(rows.map((r) => [Number(r.n), r]));
  const items = LESSONS.map((l) => {
    const r = by.get(l.n);
    return { n: l.n, quiz: Boolean(r?.quiz_done), mission: Boolean(r?.mission_done), note: r?.note ?? null };
  });
  const done = items.filter((i) => i.quiz && i.mission).length;
  // השיעור הבא: הראשון לפי הסדר המומלץ שעוד לא הושלם (D27)
  const next = items.find((i) => !(i.quiz && i.mission))?.n ?? null;
  return { items, done, total: LESSONS.length, next };
}

export async function setProgress(n: number, patch: { quiz?: boolean; mission?: boolean; note?: string | null }) {
  if (!LESSON_BY_N.has(n)) throw new UserError("שיעור לא קיים");
  if (patch.note && patch.note.length > 2000) throw new UserError("ההערה ארוכה מדי");
  await query(
    `INSERT INTO lesson_progress (n, quiz_done, mission_done, note, updated_at) VALUES ($1, COALESCE($2,false), COALESCE($3,false), $4, now())
     ON CONFLICT (n) DO UPDATE SET
       quiz_done = COALESCE($2, lesson_progress.quiz_done),
       mission_done = COALESCE($3, lesson_progress.mission_done),
       note = CASE WHEN $5 THEN $4 ELSE lesson_progress.note END,
       updated_at = now()`,
    [n, patch.quiz ?? null, patch.mission ?? null, patch.note?.trim() || null, patch.note !== undefined],
  );
}
