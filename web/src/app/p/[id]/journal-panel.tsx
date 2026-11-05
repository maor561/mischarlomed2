"use client";

import { useState } from "react";
import Link from "next/link";
import { api, dateHe, money, pct, tone } from "@/lib/format";
import type { Journal, JournalEntry, Rating } from "@/lib/mentor/journal";
import { NoteCard, TagChips } from "./mentor-box";

const RATINGS: { k: Rating; label: string }[] = [
  { k: "right", label: "✅ נכון" },
  { k: "partial", label: "🟡 חלקית" },
  { k: "wrong", label: "❌ לא נכון" },
  { k: "luck", label: "🎲 מזל (הרווחתי מסיבה אחרת)" },
];
const RATING_ICON: Record<Rating, string> = { right: "✅", partial: "🟡", wrong: "❌", luck: "🎲" };

type Filter = "all" | "due" | "buy" | "sell" | "notes";

export default function JournalPanel({ id, journal: j, onChange }: { id: string; journal: Journal | null; onChange: () => void }) {
  const [filter, setFilter] = useState<Filter>(j && j.dueCount ? "due" : "all");
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!j) return <div className="card text-muted">טוען יומן…</div>;

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/api/portfolios/${id}/journal/note`, { method: "POST", json: { text: note } });
      setNote("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const list = j.entries.filter((e) => filter === "all" || (filter === "due" && e.due) || e.side === filter);
  const FILTERS: { k: Filter; label: string; n: number }[] = [
    { k: "all", label: "הכול", n: j.entries.length + j.notes.length },
    { k: "due", label: "⏰ מחכות לבדיקה", n: j.dueCount },
    { k: "buy", label: "קניות", n: j.entries.filter((e) => e.side === "buy").length },
    { k: "sell", label: "מכירות", n: j.entries.filter((e) => e.side === "sell").length },
    { k: "notes", label: "הערות", n: j.notes.length },
  ];

  return (
    <div className="space-y-4">
      {j.patterns.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-2">📊 הדפוסים שלך</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-start py-1.5">סוג נימוק</th><th className="text-start">עסקאות</th><th className="text-start">תוצאה ממוצעת</th><th className="text-start">מול המדד</th><th className="text-start">הבדיקות שלך</th>
              </tr>
            </thead>
            <tbody>
              {j.patterns.map((p) => (
                <tr key={p.tag} className="border-b border-line last:border-0">
                  <td className="py-2"><TagChips tags={[p.tag]} /></td>
                  <td className="num">{p.count}</td>
                  <td className={`num ${tone(p.avgResult ?? 0)}`}>{p.avgResult == null ? "—" : pct(p.avgResult)}</td>
                  <td className={`num ${tone(p.avgVsBench ?? 0)}`}>{p.avgVsBench == null ? "—" : pct(p.avgVsBench)}</td>
                  <td>{p.ratings.map((r) => RATING_ICON[r]).join("") || <span className="text-muted text-xs">עוד לא</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {j.insight && <div className="mt-2"><NoteCard n={{ level: "good", icon: "🤖", title: "הדפוס הבולט", body: j.insight }} /></div>}
          <p className="text-xs text-muted mt-2">קנייה נמדדת מהביצוע עד היום, או עד שמכרת. מכירה נמדדת לפי הרווח שמומש. סוג הנימוק מזוהה לפי מילים במה שכתבת, אז הוא יכול לטעות.</p>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold mb-2">✍️ הערה ליומן</h3>
        <div className="flex gap-2">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="מה אתה חושב עכשיו? למשל: לא מוכר, קניתי לעשר שנים" onKeyDown={(e) => e.key === "Enter" && addNote()} />
          <button className="btn whitespace-nowrap" disabled={busy || !note.trim()} onClick={addNote}>שמור</button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.k} className={`chip ${filter === f.k ? "chip-on" : ""}`} onClick={() => setFilter(f.k)}>
            {f.label} ({f.n})
          </button>
        ))}
      </div>

      {filter !== "notes" && list.length === 0 && <div className="card text-sm text-muted">{filter === "due" ? "אין עסקאות שמחכות לבדיקה. 👏" : "עוד אין עסקאות ביומן."}</div>}

      {filter !== "notes" &&
        list.map((e) => <Entry key={e.orderId} id={id} e={e} open={open === e.orderId} onToggle={() => setOpen(open === e.orderId ? null : e.orderId)} onSaved={() => { setOpen(null); onChange(); }} />)}

      {(filter === "all" || filter === "notes") &&
        j.notes.map((n) => (
          <div key={`n${n.id}`} className="bg-card border border-line border-s-4 rounded-xl px-4 py-3">
            <div className="flex gap-2 flex-wrap items-baseline">
              <b>📝 הערה · <span className="num">{dateHe(n.d)}</span></b>
              {n.context && <span className="text-xs px-2 rounded-full bg-bg text-muted">{n.context}</span>}
            </div>
            <div className="mt-1 bg-bg rounded-md px-2.5 py-1 inline-block italic">&quot;{n.text}&quot;</div>
          </div>
        ))}
    </div>
  );
}

function Entry({ id, e, open, onToggle, onSaved }: { id: string; e: JournalEntry; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const [rating, setRating] = useState<Rating | null>(e.review?.rating ?? null);
  const [lesson, setLesson] = useState(e.review?.lesson ?? "");
  const [busy, setBusy] = useState(false);
  const good = e.review ? e.review.rating === "right" : (e.result ?? 0) > 0;
  const border = e.due ? "border-s-time" : e.review ? (good ? "border-s-up" : "border-s-down") : "border-s-line";

  async function save() {
    if (!rating) return;
    setBusy(true);
    try {
      await api(`/api/portfolios/${id}/journal/review`, { method: "POST", json: { orderId: e.orderId, rating, lesson } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`bg-card border border-line border-s-4 ${border} rounded-xl px-4 py-3`}>
      <div className="flex gap-2 flex-wrap items-baseline">
        <b>
          {e.side === "buy" ? "קנייה" : "מכירה"} · <Link href={`/p/${id}/stock/${encodeURIComponent(e.symbol)}`} className="num hover:text-brand">{e.symbol}</Link> · {e.qty} יח&apos; · <span className="num">{dateHe(e.d)}</span> · <span className="num">{money(e.price, e.currency)}</span>
        </b>
        {e.due && <span className="text-[11px] bg-time text-white px-2 py-0.5 rounded-full">⏰ {e.side === "sell" ? "מכרת. מה למדת?" : `עברו ${e.age} ימים, הגיע הזמן לבדוק`}</span>}
        {e.review && <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg text-muted">נבדקה</span>}
      </div>
      <div className="mt-1 flex gap-2 flex-wrap items-center">
        <span className="bg-bg rounded-md px-2.5 py-1 italic">&quot;{e.why}&quot;</span>
        <TagChips tags={e.tags} />
      </div>
      <div className="text-xs text-muted mt-1.5 flex gap-x-3 flex-wrap">
        {e.side === "buy" ? (
          <>
            <span>{e.soldOn ? <>עד המכירה ב-<span className="num">{dateHe(e.soldOn)}</span>:</> : "מאז:"} <b className={`num ${tone(e.sinceFill ?? 0)}`}>{e.sinceFill == null ? "—" : pct(e.sinceFill)}</b></span>
            {e.benchPct != null && <span>(המדד: <span className={`num ${tone(e.benchPct)}`}>{pct(e.benchPct)}</span>)</span>}
          </>
        ) : (
          <>
            <span>רווח/הפסד במכירה: <b className={`num ${tone(e.realizedPct ?? 0)}`}>{e.realizedPct == null ? "—" : pct(e.realizedPct)}</b></span>
            {e.sinceFill != null && <span>· מאז המכירה הנייר {e.sinceFill >= 0 ? "עלה" : "ירד"} <span className="num">{pct(e.sinceFill)}</span></span>}
          </>
        )}
        {e.exitPlan && <span>· תוכנית יציאה: &quot;{e.exitPlan}&quot;</span>}
      </div>
      {e.review && !open && (
        <div className="text-sm mt-1.5">📝 הבדיקה שלך: <b>{RATINGS.find((r) => r.k === e.review!.rating)?.label}</b>{e.review.lesson && <> · &quot;{e.review.lesson}&quot;</>}</div>
      )}
      <div className="flex gap-2 mt-2 flex-wrap">
        {(e.due || e.review) && (
          <button className={e.due && !open ? "btn !py-1.5 !px-3 text-sm" : "chip text-xs"} onClick={onToggle}>
            {open ? "סגור" : e.review ? "ערוך בדיקה" : "לבדוק את העסקה ←"}
          </button>
        )}
        {e.mentor.length > 0 && !open && <span className="text-xs text-muted self-center">🤖 {e.mentor.length} הערות מנטור</span>}
      </div>

      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-muted">מה המנטור אמר אז</div>
            {e.mentor.length ? e.mentor.map((n) => <NoteCard key={n.id} n={n} />) : <p className="text-sm text-muted">אין הערות.</p>}
          </div>
          <div>
            <div className="text-sm font-semibold mb-1.5">הנימוק שלך התברר…</div>
            <div className="flex gap-1.5 flex-wrap">
              {RATINGS.map((r) => (
                <button key={r.k} className={`chip text-sm ${rating === r.k ? "chip-on" : ""}`} onClick={() => setRating(r.k)}>
                  {r.label}
                </button>
              ))}
            </div>
            <label className="block mt-2">
              <span className="text-xs text-muted">מה למדת? (משפט אחד)</span>
              <textarea className="input mt-1" rows={2} value={lesson} onChange={(ev) => setLesson(ev.target.value)} />
            </label>
            <button className="btn mt-2" disabled={!rating || busy} onClick={save}>שמור בדיקה</button>
            <p className="text-xs text-muted mt-2">🤖 &quot;מזל&quot; היא תשובה כנה וחשובה: רווח שלא בא מהסיבה שחשבת לא מלמד אותך לחזור עליו.</p>
          </div>
        </div>
      )}
    </div>
  );
}
