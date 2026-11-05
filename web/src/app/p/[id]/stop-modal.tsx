"use client";

import { dateHe, pct } from "@/lib/format";
import type { Stop } from "@/lib/engine/service";

const HEAD: Record<Stop["kind"], { icon: string; cls: string }> = {
  market: { icon: "📉", cls: "bg-down" },
  drawdown: { icon: "⚠️", cls: "bg-warn" },
  event: { icon: "🗞", cls: "bg-time" },
  orders: { icon: "💼", cls: "bg-brand" },
  corporate: { icon: "💵", cls: "bg-brand" },
  month: { icon: "📅", cls: "bg-brand" },
  end: { icon: "🏁", cls: "bg-up" },
  present: { icon: "📍", cls: "bg-up" },
};

const QUESTION: Partial<Record<Stop["kind"], string>> = {
  market: "הרבה משקיעים מגיבים ביום כזה מפחד או מהתלהבות. מה התוכנית שלך: למכור, לקנות, או לא לעשות כלום? כתוב לעצמך למה, לפני שאתה ממשיך.",
  drawdown: "ירידה של 10% קורה בממוצע כמעט כל שנה. השאלה החשובה: האם הסיבה שבגללה קנית עדיין נכונה?",
  event: "איך אתה חושב שהשוק יגיב? נסה לנחש לפני שאתה ממשיך, ותבדוק אם צדקת.",
};

export default function StopModal({ stop, blind, onContinue, onOrder, onReport, onClose }: {
  stop: Stop;
  blind: boolean;
  onContinue: () => void;
  onOrder: () => void;
  onReport: () => void;
  onClose: () => void;
}) {
  const h = HEAD[stop.kind];
  const isUp = stop.kind === "market" && (stop.marketChange ?? 0) > 0;
  const done = stop.kind === "end" || stop.kind === "present";
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(27,35,51,.4)] grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`${isUp ? "bg-up" : h.cls} text-white px-5 py-3.5`}>
          <div className="text-sm opacity-85 num">{dateHe(stop.d)} · ⏸ הנגן נעצר</div>
          <h3 className="text-lg font-bold mt-0.5">
            {isUp ? "📈" : h.icon} {stop.title}
          </h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          {stop.body && <p>{stop.body}</p>}
          {blind && stop.kind === "market" && <p className="text-muted">🎭 במסע עיוור לא מספרים מה קרה בעולם, רק מה עשה השוק.</p>}
          {stop.items.length > 0 && (
            <ul className="space-y-1">
              {stop.items.map((t, i) => (
                <li key={i} className="bg-bg rounded-md px-2.5 py-1.5">💼 {t}</li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="התיק שלך היום" v={stop.dayChange} />
            <Mini label="התיק מהשיא" v={stop.fromPeak} />
            <Mini label={`${stop.marketLabel} מהשיא השנתי`} v={stop.marketFromPeak} />
          </div>
          {QUESTION[stop.kind] && <div className="rounded-lg p-2.5 bg-warn-soft text-[#6b4100]">🤔 <b>שאלה למחשבה:</b> {QUESTION[stop.kind]}</div>}
        </div>
        <div className="flex gap-2 flex-wrap px-5 pb-4">
          {done ? (
            <button className="btn" onClick={onReport}>📊 לדו&quot;ח המסע</button>
          ) : (
            <>
              <button className="btn !bg-time" onClick={onContinue}>▶ להמשיך</button>
              <button className="px-4 py-2.5 rounded-lg border border-brand text-brand font-semibold" onClick={onOrder}>📝 לפקודה</button>
            </>
          )}
          <button className="px-4 py-2.5 rounded-lg text-muted" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="bg-bg rounded-lg p-2">
      <div className="text-xs text-muted">{label}</div>
      <b className={`num text-base ${v == null ? "" : v < 0 ? "text-down" : v > 0 ? "text-up" : ""}`}>{v == null ? "—" : pct(v)}</b>
    </div>
  );
}
