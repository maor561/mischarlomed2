"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, dateHe } from "@/lib/format";
import type { PortfolioView, Stop, StopPrefs } from "@/lib/engine/service";

export type AdvanceResult = { from: string; to: string; entries: number; stop: Stop | null };

const SPEEDS = [
  { days: 1, label: "יום בשנייה" },
  { days: 7, label: "שבוע בשנייה" },
  { days: 30, label: "חודש בשנייה" },
];
const STOP_LABELS: { k: keyof StopPrefs; label: string }[] = [
  { k: "orders", label: "פקודה בוצעה / נדחתה / פגה" },
  { k: "market", label: "השוק זז ±4% ביום" },
  { k: "drawdown", label: "התיק ירד 10% מהשיא" },
  { k: "events", label: "אירוע היסטורי" },
  { k: "corporate", label: "דיבידנד / פיצול" },
  { k: "month", label: "תחילת חודש" },
];
const DEFAULT_STOPS: StopPrefs = { orders: true, market: true, drawdown: true, events: true, corporate: false, month: false };
const LS_KEY = "stock-sim:time-bar";

/** מספר ימים מתחילת המסע. תומך גם בתאריכים מוסתרים ("@47") */
function dayIndex(d: string, start: string): number {
  if (d.startsWith("@")) return Number(d.slice(1));
  return Math.round((Date.parse(d) - Date.parse(start)) / 86400_000);
}

export default function TimeBar({ id, view, onAdvanced, onPlayingChange, resume }: {
  id: string;
  view: PortfolioView;
  onAdvanced: (r: AdvanceResult | null, error?: string) => Promise<void> | void;
  onPlayingChange: (playing: boolean) => void;
  /** כל שינוי במספר הזה ממשיך את הנגן (כפתור "להמשיך" בחלון העצירה) */
  resume: number;
}) {
  const p = view.portfolio;
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  // העדפות הנגן נשמרות בדפדפן (נוחות אישית בלבד). הרכיב נטען רק אחרי שהתיק נטען בדפדפן, ולכן אין בעיית רינדור בשרת
  const [saved] = useState<{ speed?: number; stops?: StopPrefs }>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [speed, setSpeed] = useState(saved.speed ?? 7);
  const [stops, setStops] = useState<StopPrefs>({ ...DEFAULT_STOPS, ...(saved.stops ?? {}) });
  const [showStops, setShowStops] = useState(false);
  const playRef = useRef(false);
  const persist = (next: { speed?: number; stops?: StopPrefs }) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ speed, stops, ...next }));
    } catch {}
  };

  const step = useCallback(
    async (days: number): Promise<AdvanceResult | null> => {
      try {
        const r = await api<AdvanceResult>(`/api/portfolios/${id}/advance`, { method: "POST", json: { days, stops } });
        await onAdvanced(r);
        return r;
      } catch (e) {
        await onAdvanced(null, (e as Error).message);
        return null;
      }
    },
    [id, stops, onAdvanced],
  );

  const setPlay = useCallback(
    (v: boolean) => {
      playRef.current = v;
      setPlaying(v);
      onPlayingChange(v);
    },
    [onPlayingChange],
  );

  async function play() {
    setPlay(true);
    while (playRef.current) {
      const t0 = Date.now();
      const r = await step(speed);
      if (!r || r.stop) break;
      const wait = 1000 - (Date.now() - t0);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    }
    setPlay(false);
  }

  const resumeSeen = useRef(resume);
  useEffect(() => {
    if (resume === resumeSeen.current) return;
    resumeSeen.current = resume;
    if (!playRef.current) play();
  });

  async function jump(days: number) {
    setBusy(true);
    await step(days);
    setBusy(false);
  }

  // רווח = נגן/עצור
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== "Space" || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName)) return;
      e.preventDefault();
      if (playRef.current) setPlay(false);
      else if (!busy) play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = p.endDate ? dayIndex(p.endDate, p.startDate) : null;
  const now = dayIndex(p.simDate, p.startDate);
  const finished = total != null && now >= total;
  const pct = total ? Math.min(100, (now / total) * 100) : null;

  return (
    <div className="bg-time-soft border-b border-[#ddd2f7] px-4 md:px-6 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <b className="text-base">{p.name}</b>
        <span className="text-xs px-2 py-0.5 rounded-full bg-time text-white">{p.blind ? "🎭 מסע עיוור" : "⏳ מכונת זמן"}</span>
        <button
          className="w-10 h-10 rounded-full bg-time text-white text-lg disabled:opacity-40"
          disabled={finished || busy}
          title="נגן / עצור (מקש רווח)"
          onClick={() => (playing ? setPlay(false) : play())}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div>
          <div className="text-xs text-muted">{p.blind ? "מסע עיוור" : "התאריך בסימולציה"}</div>
          <div className="text-lg font-bold text-time num leading-tight">{dateHe(p.simDate)}</div>
        </div>
        <span className="flex-1" />
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-xs text-muted">מהירות:</span>
          {SPEEDS.map((s) => (
            <button key={s.days} className={`chip text-xs ${speed === s.days ? "!bg-time !text-white !border-time" : ""}`} onClick={() => { setSpeed(s.days); persist({ speed: s.days }); }}>
              {s.label}
            </button>
          ))}
          <span className="text-xs text-muted ms-2">צעד:</span>
          {[
            [1, "+יום"],
            [7, "+שבוע"],
            [30, "+חודש"],
          ].map(([n, l]) => (
            <button key={n} className="chip text-xs" disabled={playing || busy || finished} onClick={() => jump(n as number)}>
              {l}
            </button>
          ))}
          <button className="chip text-xs" onClick={() => setShowStops(!showStops)} title="מתי הנגן עוצר">
            ⚙️ עצירות
          </button>
        </div>
      </div>
      {pct != null && (
        <div className="mt-2">
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <i className="block h-full bg-time transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted mt-0.5 num">
            <span>{dateHe(p.startDate)} · התחלה</span>
            <span>{finished ? "🏁 המסע הסתיים" : `יום ${now} מתוך ${total}`}</span>
            <span>סוף המסע · {dateHe(p.endDate)}</span>
          </div>
        </div>
      )}
      {showStops && (
        <div className="flex gap-1.5 flex-wrap mt-2 text-xs items-center">
          <span className="text-muted">לעצור כש:</span>
          {STOP_LABELS.filter((s) => !(p.blind && s.k === "events")).map((s) => (
            <label key={s.k} className="flex items-center gap-1 bg-white border border-[#ddd2f7] rounded-full px-2.5 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!stops[s.k]}
                onChange={(e) => {
                  const next = { ...stops, [s.k]: e.target.checked };
                  setStops(next);
                  persist({ stops: next });
                }}
              />
              {s.label}
            </label>
          ))}
          <span className="text-muted">· הנגן תמיד עוצר בסוף המסע</span>
        </div>
      )}
      {playing && <div className="text-xs text-time mt-1">⏸ בזמן שהנגן רץ אי אפשר לשלוח פקודות. עוצרים (או מקש רווח), פועלים וממשיכים.</div>}
    </div>
  );
}
