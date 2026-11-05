"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/format";
import { LESSONS, MODULES } from "@/lib/lessons/content";
import type { LessonProgress } from "@/lib/lessons/progress";

type Progress = { items: LessonProgress[]; done: number; total: number; next: number | null };

export default function LessonPath() {
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => {
    api<Progress>("/api/lessons/progress").then(setP, () => {});
  }, []);
  const by = new Map(p?.items.map((i) => [i.n, i]) ?? []);

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">מסלול הלימוד</h1>
        <p className="text-muted">מאפס למשקיע: 28 שיעורים קצרים, ולכל אחד משימה בסימולטור. יש סדר מומלץ, אבל כל שיעור פתוח.</p>
      </div>
      <div className="card">
        <div className="flex justify-between items-baseline">
          <b>ההתקדמות שלך</b>
          <span className="num">{p ? `${p.done} / ${p.total}` : "…"}</span>
        </div>
        <div className="h-2.5 bg-bg rounded-full overflow-hidden my-2">
          <i className="block h-full bg-up transition-all" style={{ width: `${p ? (p.done / p.total) * 100 : 0}%` }} />
        </div>
        <div className="text-xs text-muted">✅ שאלות + משימה · 🟡 חלקי · ⚪ עוד לא</div>
        {p?.next && (
          <Link href={`/lessons/${p.next}`} className="btn inline-block mt-3">
            {p.done ? "להמשיך" : "להתחיל"}: שיעור {p.next} ←
          </Link>
        )}
      </div>

      {MODULES.map((m) => {
        const lessons = LESSONS.filter((l) => l.module === m.n);
        const doneHere = lessons.filter((l) => by.get(l.n)?.quiz && by.get(l.n)?.mission).length;
        return (
          <section key={m.n} className="space-y-1.5">
            <h2 className="font-semibold text-sm flex gap-2 items-center pt-2">
              מודול {m.n} · {m.title} <span className="text-xs text-muted font-normal num">{doneHere}/{lessons.length}</span>
            </h2>
            {lessons.map((l) => {
              const pr = by.get(l.n);
              const done = pr?.quiz && pr?.mission;
              const half = !done && (pr?.quiz || pr?.mission);
              const isNext = p?.next === l.n;
              return (
                <Link
                  key={l.n}
                  href={`/lessons/${l.n}`}
                  className={`flex gap-3 items-center px-3 py-2.5 rounded-xl border bg-card hover:border-brand transition-colors ${isNext ? "border-brand ring-2 ring-brand-soft" : "border-line"}`}
                >
                  <span className={`w-8 h-8 rounded-full grid place-items-center text-sm font-bold shrink-0 ${done ? "bg-up text-white" : half ? "bg-warn-soft text-warn" : isNext ? "bg-brand text-white" : "bg-bg"}`}>
                    {done ? "✓" : l.n}
                  </span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-sm">{l.title}</b>
                    <span className="text-xs text-muted">{l.minutes} דק&apos;{isNext ? " · הבא בתור" : ""}</span>
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap hidden sm:inline">
                    {pr?.quiz ? "✅" : "⚪"} שאלות · {pr?.mission ? "✅" : "⚪"} משימה
                  </span>
                </Link>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
