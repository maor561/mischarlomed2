"use client";

import Link from "next/link";
import { setAdvanced, useAdvanced } from "@/lib/use-advanced";

export type MoreTab = "journal" | "chart" | "analysis" | "history" | "tax" | "report" | "cash" | "details";

type Item = { k: MoreTab; icon: string; title: string; sub?: string; timeOnly?: boolean; advancedOnly?: boolean };
export const MORE_ITEMS: Item[] = [
  { k: "journal", icon: "📓", title: "יומן", sub: "עסקאות, בדיקות חוזרות ודפוסים" },
  { k: "chart", icon: "📈", title: "מול המדד", sub: "הגרף המלא וירידה מהשיא" },
  { k: "analysis", icon: "🥧", title: "ניתוח התיק", sub: "פיזור לפי נייר, מטבע וסקטור" },
  { k: "history", icon: "📜", title: "היסטוריה ופקודות", sub: "כולל ביטול פקודות ממתינות" },
  { k: "tax", icon: "🧾", title: "מס ועלויות" },
  { k: "report", icon: "📊", title: "דו\"ח המסע", sub: "מכונת זמן", timeOnly: true },
  { k: "cash", icon: "💱", title: "מזומן ומט\"ח", sub: "קופות נפרדות והמרה ידנית", advancedOnly: true },
  { k: "details", icon: "⚙️", title: "פרטי התיק", sub: "עמלות, תוכניות, מחיקה" },
];

/** "עוד" (סקיצה 07): כל מה שלא בחזית. כלום לא נמחק, ומתג "מתקדם" מחזיר את הכלים המלאים (D32) */
export default function MorePanel({ isTime, dueCount, onOpen }: { isTime: boolean; dueCount: number; onOpen: (k: MoreTab) => void }) {
  const advanced = useAdvanced();
  const items = MORE_ITEMS.filter((m) => (!m.timeOnly || isTime) && (!m.advancedOnly || advanced));
  return (
    <div className="space-y-3 max-w-xl">
      <div className="card !py-1">
        {items.map((m) => (
          <button key={m.k} className="w-full flex items-center gap-3 py-3 border-b border-line last:border-0 text-start" onClick={() => onOpen(m.k)}>
            <span className="text-xl w-7 text-center">{m.icon}</span>
            <span className="flex-1">
              <b className="block text-sm">{m.title}</b>
              {m.sub && <span className="text-xs text-muted">{m.sub}</span>}
            </span>
            {m.k === "journal" && dueCount > 0 && <span className="pill bg-plum text-white">⏰{dueCount}</span>}
            <span className="text-muted">‹</span>
          </button>
        ))}
      </div>
      <div className="card !py-1">
        <Link href="/" className="flex items-center gap-3 py-3 border-b border-line">
          <span className="text-xl w-7 text-center">💼</span>
          <span className="flex-1"><b className="block text-sm">התיקים שלי</b><span className="text-xs text-muted">החלפה בין תיקים, תיק חדש</span></span>
          <span className="text-muted">‹</span>
        </Link>
        <Link href="/glossary" className="flex items-center gap-3 py-3 border-b border-line">
          <span className="text-xl w-7 text-center">📖</span>
          <b className="flex-1 text-sm">מילון מונחים</b>
          <span className="text-muted">‹</span>
        </Link>
        <Link href="/rules" className="flex items-center gap-3 py-3 border-b border-line">
          <span className="text-xl w-7 text-center">⚖️</span>
          <span className="flex-1"><b className="block text-sm">חוקי המנוע</b><span className="text-xs text-muted">איך הסימולטור מחשב ביצוע, עמלות ומס</span></span>
          <span className="text-muted">‹</span>
        </Link>
        <label className="flex items-center gap-3 py-3 cursor-pointer">
          <span className="text-xl w-7 text-center">🛠️</span>
          <span className="flex-1"><b className="block text-sm">מצב מתקדם</b><span className="text-xs text-muted">לימיט, סטופ, תוקף, קופות נפרדות והמרה ידנית</span></span>
          <Toggle on={advanced} onChange={setAdvanced} />
        </label>
      </div>
      <p className="text-xs text-muted px-1">שיעור 10 (לימיט וסטופ-לוס) מסביר מתי הכלים המתקדמים שימושיים.</p>
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-ink" : "bg-line"}`}
    >
      <i className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${on ? "left-[3px]" : "left-[23px]"}`} />
    </button>
  );
}
