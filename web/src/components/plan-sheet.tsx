"use client";

import { useState } from "react";
import Keypad from "@/components/keypad";
import SymbolDot from "@/components/symbol-dot";
import { api, money } from "@/lib/format";
import type { PlanFreq } from "@/lib/engine/types";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];

/**
 * השקעה קבועה מהירה מדף נייר (אושר לחבילה 13): סכום במקלדת, תדירות, ויום.
 * יוצר תוכנית עם הנייר הזה בלבד (100%), מכסף חדש. עריכה מלאה בלשונית "תוכניות".
 */
export default function PlanSheet({ id, symbol, name, onClose, onDone }: { id: string; symbol: string; name: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [value, setValue] = useState("500");
  const [freq, setFreq] = useState<PlanFreq>("monthly");
  const [day, setDay] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amount = Number(value) || 0;

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/portfolios/${id}/plans`, { method: "POST", json: { name: `השקעה קבועה ב-${symbol}`, amount, freq, day: freq === "daily" ? 0 : day, items: [{ symbol, pct: 100 }], source: "deposit" } });
      onDone(`🔁 נוצרה תוכנית: ${money(amount, "ILS", 0)} ${freq === "monthly" ? "כל חודש" : freq === "weekly" ? "כל שבוע" : "כל יום מסחר"} ב-${symbol}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[rgba(29,22,64,0.35)]" onClick={onClose}>
      <div role="dialog" aria-label="השקעה קבועה" className="bg-white w-full md:max-w-md rounded-t-[28px] md:rounded-[28px] max-h-[94vh] overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1.5 rounded-full bg-line mx-auto md:hidden" />
        <div className="flex items-center gap-2.5">
          <SymbolDot symbol={symbol} />
          <div className="min-w-0 flex-1">
            <b className="block">הגדרת השקעה קבועה</b>
            <span className="text-xs text-muted truncate block"><bdi>{name}</bdi></span>
          </div>
          <button className="text-muted text-xl" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="text-center text-4xl font-extrabold num">{money(amount, "ILS", amount % 1 ? 2 : 0)}</div>
        <div>
          <div className="text-xs text-muted mb-1">תדירות</div>
          <div className="seg">
            <button aria-pressed={freq === "monthly"} onClick={() => { setFreq("monthly"); setDay(1); }}>חודשית</button>
            <button aria-pressed={freq === "weekly"} onClick={() => { setFreq("weekly"); setDay(1); }}>שבועית</button>
            <button aria-pressed={freq === "daily"} onClick={() => setFreq("daily")}>יומית</button>
          </div>
        </div>
        {freq === "monthly" && (
          <label className="flex items-center gap-2 text-sm justify-center">
            ביום
            <select className="input !w-20 !py-1" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            בחודש
          </label>
        )}
        {freq === "weekly" && (
          <div className="flex gap-1.5 justify-center flex-wrap">
            {WEEKDAYS.map((w, i) => (
              <button key={w} className={`chip text-xs ${day === i ? "chip-on" : ""}`} onClick={() => setDay(i)}>{w}</button>
            ))}
          </div>
        )}
        {freq === "daily" && <p className="text-xs text-muted text-center">כל יום מסחר (ב&apos;–ו&apos;). שים לב: הרבה פעולות קטנות מכלות מהר את מכסת העמלות החינמית.</p>}
        <p className="text-xs text-muted text-center">כסף חדש נכנס לתיק בכל פעם ונקנה אוטומטית, כולל שברי מניות. אפשר להשהות ולערוך בלשונית &quot;תוכניות&quot;.</p>
        {err && <div className="text-sm rounded-xl p-2.5 bg-down-soft text-down">{err}</div>}
        <Keypad value={value} onChange={setValue} maxDecimals={0} />
        <button className="btn w-full !py-3" disabled={busy || amount < 10} onClick={save}>{busy ? "שומר…" : `להפעיל תוכנית של ${money(amount, "ILS", 0)}`}</button>
      </div>
    </div>
  );
}
