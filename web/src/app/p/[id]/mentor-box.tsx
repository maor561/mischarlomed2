"use client";

import { TAG_INFO, type MentorNote, type ReasonTag } from "@/lib/mentor/rules";

export const LEVEL_CLS: Record<string, string> = {
  bad: "bg-down-soft text-[#7a1f18]",
  warn: "bg-warn-soft text-[#6b4100]",
  info: "bg-brand-soft text-[#1d3c9e]",
  good: "bg-up-soft text-[#0b5a34]",
};

export function NoteCard({ n }: { n: Pick<MentorNote, "icon" | "title" | "body"> & { level: string } }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-[13px] flex gap-2.5 items-start ${LEVEL_CLS[n.level] ?? LEVEL_CLS.info}`}>
      <span className="text-lg leading-none">{n.icon}</span>
      <div>
        <b className="block mb-0.5">{n.title}</b>
        {n.body}
      </div>
    </div>
  );
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {tags.map((t) => {
        const info = TAG_INFO[t as ReasonTag] ?? TAG_INFO.other;
        return <span key={t} className={`text-[11px] px-2 py-0.5 rounded-full ${info.cls}`}>{info.label}</span>;
      })}
    </span>
  );
}

/** המנטור בטופס הפקודה (D22): מגיב לנימוק ולמה שהפקודה תעשה לתיק. לא חוסם */
export default function MentorBox({ mentor, hasWhy }: { mentor: { tags: ReasonTag[]; notes: MentorNote[] }; hasWhy: boolean }) {
  if (!mentor.notes.length && !mentor.tags.length) return null;
  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <b className="text-sm">🤖 המנטור</b>
        {hasWhy && mentor.tags.length > 0 && (
          <span className="text-xs text-muted">
            זיהה: <TagChips tags={mentor.tags} />
          </span>
        )}
      </div>
      {mentor.notes.map((n) => (
        <NoteCard key={n.id} n={n} />
      ))}
      <p className="text-xs text-muted">אפשר לשלוח בכל זאת. המנטור רק שואל, וההערות נשמרות ביומן ליד העסקה.</p>
    </div>
  );
}
