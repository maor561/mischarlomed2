"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Term from "@/components/term";
import { api } from "@/lib/format";
import { GLOSSARY_BY_ID } from "@/lib/glossary";
import { LESSON_BY_N, LESSONS, MODULES, type MissionSetup } from "@/lib/lessons/content";
import type { LessonProgress } from "@/lib/lessons/progress";

/**
 * כל רצף באנגלית (S&P 500, VOO) וכל מספר מבודדים בנפרד, כדי ששני רצפים סמוכים
 * כמו "2024 S&P 500" לא יתמזגו לבלוק אחד משמאל לימין בתוך משפט עברי
 */
// מספר: בלי פסיק/נקודה בסוף (סימני פיסוק של המשפט), כולל טווח כמו 2008–2009
const LTR_RUN = /([A-Za-z][A-Za-z0-9&.'/-]*(?: [A-Za-z0-9&.'/-]+)*|[$₪]?\d(?:[\d.,]*\d)?%?(?:[–-]\d(?:[\d.,]*\d)?%?)?)/g;
function Iso({ text }: { text: string }) {
  return <>{text.split(LTR_RUN).map((p, i) => (i % 2 ? <bdi key={i} dir="ltr" className="whitespace-nowrap">{p}</bdi> : p))}</>;
}

/** **טקסט** → הדגשה */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}><Iso text={p.slice(2, -2)} /></b> : <Iso key={i} text={p} />))}</>;
}

/** קישור לאשף תיק חדש, ממולא לפי המשימה (D26) */
export function missionHref(n: number, s: MissionSetup): string {
  const q = new URLSearchParams({ lesson: String(n), name: s.name });
  if (s.start) q.set("start", s.start);
  if (s.length) q.set("length", s.length);
  if (s.capital) q.set("capital", String(s.capital));
  if (s.blind) q.set("blind", s.blind);
  if (s.bench) q.set("bench", s.bench);
  if (s.dep) q.set("dep", String(s.dep));
  if (s.auto) q.set("auto", s.auto);
  if (s.mode) q.set("mode", s.mode);
  return `/new?${q}`;
}

/** מפתח לפי מספר השיעור: מעבר לשיעור הבא מתחיל עם שאלות נקיות */
export default function LessonScreen() {
  const { n } = useParams<{ n: string }>();
  return <LessonInner key={n} n={Number(n)} />;
}

function LessonInner({ n }: { n: number }) {
  const l = LESSON_BY_N.get(n);
  const [pr, setPr] = useState<LessonProgress | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(() => (l ? l.quiz.map(() => null) : []));
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let alive = true;
    api<{ items: LessonProgress[] }>("/api/lessons/progress").then((x) => {
      if (!alive) return;
      const me = x.items.find((i) => i.n === n) ?? null;
      setPr(me);
      setNote(me?.note ?? "");
    }, () => {});
    return () => {
      alive = false;
    };
  }, [n]);

  if (!l) return <main className="max-w-3xl mx-auto p-6"><div className="card">השיעור לא נמצא. <Link href="/lessons" className="text-brand underline">לכל השיעורים</Link></div></main>;

  const allRight = answers.every((a, i) => a === l.quiz[i].answer);
  const save = async (patch: { quiz?: boolean; mission?: boolean; note?: string }) => {
    await api(`/api/lessons/${n}/progress`, { method: "POST", json: patch });
    setPr((p) => ({ n, quiz: patch.quiz ?? p?.quiz ?? false, mission: patch.mission ?? p?.mission ?? false, note: patch.note ?? p?.note ?? null }));
  };
  const answer = async (qi: number, oi: number) => {
    const next = answers.map((a, i) => (i === qi ? oi : a));
    setAnswers(next);
    if (next.every((a, i) => a === l.quiz[i].answer) && !pr?.quiz) await save({ quiz: true });
  };
  const prev = LESSON_BY_N.get(n - 1), nextL = LESSON_BY_N.get(n + 1);
  const mod = MODULES.find((m) => m.n === l.module)!;

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <Link href="/lessons" className="text-sm text-brand">→ כל השיעורים</Link>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <article className="card space-y-3 leading-relaxed">
          <div className="text-xs text-muted">מודול {l.module} · {mod.title} · שיעור {l.n} מתוך {LESSONS.length} · {l.minutes} דק&apos;</div>
          <h1 className="text-xl font-bold">{l.title}</h1>
          {l.body.map((p, i) => (
            <p key={i} className={p.startsWith("המידע כאן כללי") ? "text-sm rounded-lg p-2.5 bg-warn-soft text-[#6b4100]" : ""}>
              <Rich text={p} />
            </p>
          ))}
          <div className="bg-bg rounded-lg px-3.5 py-2.5">
            <b>דוגמה מהנתונים:</b> <Rich text={l.example} />
          </div>
          <div className="bg-up-soft text-[#0b5a34] rounded-lg px-3.5 py-2.5">💡 <b>הדבר האחד לזכור:</b> {l.key}</div>
          <div className="text-sm text-muted">
            מונחים בשיעור:{" "}
            {l.terms.map((t, i) => (
              <span key={t}>
                {i > 0 && " · "}
                <Term id={t}>{GLOSSARY_BY_ID.get(t)?.term ?? t}</Term>
              </span>
            ))}
          </div>
        </article>

        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold">📋 ההתקדמות בשיעור</h2>
            <div className="text-sm mt-1">{pr?.quiz ? "✅" : "⚪"} שאלות · {pr?.mission ? "✅" : "⚪"} משימה</div>
            {pr?.quiz && pr?.mission && <div className="text-sm text-up mt-1">השיעור הושלם 🎉</div>}
          </div>
          <div className="rounded-xl p-4 bg-time-soft border border-[#ddd2f7] space-y-2">
            <h2 className="font-semibold text-time">🎯 משימה</h2>
            <p className="text-sm">{l.mission.text}</p>
            <ol className="text-sm list-decimal ps-5 space-y-0.5">
              {l.mission.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <div className="flex gap-2 flex-wrap pt-1">
              {l.mission.setup && <Link href={missionHref(l.n, l.mission.setup)} className="btn !bg-time">פתח תיק למשימה ←</Link>}
              <button className={`px-4 py-2.5 rounded-lg border font-semibold ${pr?.mission ? "border-up text-up bg-up-soft" : "border-brand text-brand bg-white"}`} onClick={() => save({ mission: !pr?.mission })}>
                {pr?.mission ? "✅ סומנה כבוצעה" : "סיימתי את המשימה"}
              </button>
            </div>
            <label className="block pt-1">
              <span className="text-xs text-muted">מה למדת? (אופציונלי)</span>
              <textarea className="input mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="chip text-xs" onClick={async () => { await save({ note }); setSaved("נשמר"); setTimeout(() => setSaved(""), 1500); }}>
              שמור {saved && `· ${saved} ✓`}
            </button>
          </div>
        </div>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">📝 שאלות {pr?.quiz && <span className="text-up text-sm font-normal">· ✅ עברת</span>}</h2>
        {l.quiz.map((q, qi) => {
          const a = answers[qi];
          return (
            <div key={qi} className="border border-line rounded-xl p-3">
              <b className="block">{qi + 1}. {q.q}</b>
              <div className="space-y-1.5 mt-2">
                {q.options.map((o, oi) => {
                  const picked = a === oi;
                  const cls = picked ? (oi === q.answer ? "border-up bg-up-soft" : "border-down bg-down-soft") : "border-line bg-white hover:border-brand";
                  return (
                    <button key={oi} className={`block w-full text-start rounded-lg border px-3 py-2 ${cls}`} onClick={() => answer(qi, oi)}>
                      {o} {picked && (oi === q.answer ? "✓" : "✗")}
                    </button>
                  );
                })}
              </div>
              {a != null && (
                <div className={`text-sm rounded-lg p-2.5 mt-2 ${a === q.answer ? "bg-brand-soft text-[#1d3c9e]" : "bg-down-soft text-[#7a1f18]"}`}>
                  {a === q.answer ? "נכון. " : "לא בדיוק. "}
                  {q.explain}
                  {a !== q.answer && " נסה שוב."}
                </div>
              )}
            </div>
          );
        })}
        {!allRight && answers.some((a) => a != null) && <p className="text-xs text-muted">ענה נכון על כל השאלות כדי לסמן ✅.</p>}
      </section>

      <nav className="flex justify-between gap-2">
        {prev ? <Link href={`/lessons/${prev.n}`} className="chip">→ שיעור {prev.n}</Link> : <span />}
        {nextL ? <Link href={`/lessons/${nextL.n}`} className="btn">שיעור {nextL.n}: {nextL.title.slice(0, 28)}{nextL.title.length > 28 ? "…" : ""} ←</Link> : <Link href="/lessons" className="btn">סיימת את המסלול 🎓</Link>}
      </nav>
    </main>
  );
}
