"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import SymbolSearch from "@/components/symbol-search";
import { api } from "@/lib/format";
import { FEE_PRESETS, type FeeProfile } from "@/lib/engine/types";

const PRESETS = [
  { label: "קורונה · פבר' 2020", d: "2020-02-03", hint: "שבועיים לפני הקריסה המהירה בהיסטוריה, ואחריה התאוששות מהירה" },
  { label: "המשבר הפיננסי · 2007", d: "2007-10-01", hint: "השיא שלפני המשבר. השוק ירד יותר מ-50% ולקח שנים לחזור" },
  { label: "בועת הדוט-קום · 2000", d: "2000-03-01", hint: "שיא בועת האינטרנט. מניות טכנולוגיה איבדו עד 80%" },
  { label: "עליית הריבית · 2022", d: "2022-01-03", hint: "שנה של ירידות בגלל העלאות ריבית חדות" },
  { label: "10 שנים רגילות · 2014", d: "2014-01-02", hint: "עשור טוב יחסית. מתאים לתרגול הוראת קבע לטווח ארוך" },
];

const FEE_ROWS: { k: keyof Omit<FeeProfile, "kind">; label: string; unit: string }[] = [
  { k: "usPct", label: "עמלת קנייה/מכירה בארה\"ב", unit: "%" },
  { k: "usMin", label: "מינימום לעסקה בארה\"ב", unit: "$" },
  { k: "ilPct", label: "עמלת קנייה/מכירה בת\"א", unit: "%" },
  { k: "ilMin", label: "מינימום לעסקה בת\"א", unit: "₪" },
  { k: "custodyPctYear", label: "דמי משמרת לשנה", unit: "%" },
  { k: "fxPct", label: "עמלת המרת מט\"ח", unit: "%" },
];

export default function NewPortfolio() {
  const router = useRouter();
  const [name, setName] = useState("מכונת זמן — קורונה");
  const [capital, setCapital] = useState(50000);
  const [mode, setMode] = useState<"time" | "live">("time");
  const [start, setStart] = useState("2020-02-03");
  const [fees, setFees] = useState<FeeProfile>({ ...FEE_PRESETS.online });
  const [depOn, setDepOn] = useState(false);
  const [dep, setDep] = useState({ amount: 1000, day: 1, autoBuy: "VOO" as string | null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pickFees = (kind: FeeProfile["kind"]) => setFees(kind === "custom" ? { ...fees, kind } : { ...FEE_PRESETS[kind] });

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const { id } = await api<{ id: number }>("/api/portfolios", {
        method: "POST",
        json: { name, capital, mode, startDate: mode === "time" ? start : undefined, fees, deposit: depOn ? dep : null },
      });
      router.push(`/p/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">פתיחת תיק חדש</h1>
        <p className="text-muted">
          אפשר להחזיק כמה תיקים במקביל. למשל, שני תיקים זהים עם עמלות שונות, כדי לראות כמה זה משנה.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="font-semibold">1. בסיס</h3>
          <Field label="שם התיק">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="הון התחלתי (₪)" hint="כדאי לבחור סכום קרוב למה שתשקיע באמת, אחרת התרגול פחות שווה.">
            <input className="input num" type="number" min={1000} step={1000} value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
          </Field>
          <Field label="מצב זמן">
            <div className="grid grid-cols-2 gap-2">
              <Opt on={mode === "live"} onClick={() => setMode("live")} title="🔴 חי" sub="מחירים של היום. הזמן זז כמו במציאות" />
              <Opt on={mode === "time"} onClick={() => setMode("time")} title="⏳ מכונת זמן" sub="מתחילים בעבר ומריצים קדימה" />
            </div>
          </Field>
          {mode === "time" && (
            <>
              <Field label="תאריך התחלה">
                <input className="input num" type="date" value={start} min="1990-01-01" onChange={(e) => setStart(e.target.value)} />
              </Field>
              <div className="flex gap-1.5 flex-wrap">
                {PRESETS.map((p) => (
                  <button key={p.d} type="button" title={p.hint} className={`text-xs px-2.5 py-1 rounded-full border ${start === p.d ? "border-time bg-time-soft text-time font-semibold" : "border-line bg-white"}`} onClick={() => setStart(p.d)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">{PRESETS.find((p) => p.d === start)?.hint}</p>
              <div className="text-sm rounded-lg p-2.5 bg-time-soft text-time">
                במכונת זמן אין הצצה לעתיד: מחירים, גרפים ושווי מוצגים רק עד התאריך של הסימולציה.
              </div>
            </>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold">2. מבנה עמלות</h3>
          <div className="grid grid-cols-3 gap-2">
            <Opt on={fees.kind === "bank"} onClick={() => pickFees("bank")} title="🏦 בנק" sub="יקר, הכי נפוץ" />
            <Opt on={fees.kind === "online"} onClick={() => pickFees("online")} title="💻 אונליין" sub="זול, בלי משמרת" />
            <Opt on={fees.kind === "custom"} onClick={() => pickFees("custom")} title="✏️ מותאם" sub="מההצעה שקיבלת" />
          </div>
          <table className="w-full text-sm">
            <tbody>
              {FEE_ROWS.map((r) => (
                <tr key={r.k} className="border-b border-line">
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 w-32">
                    <div className="flex items-center gap-1">
                      <input
                        className="input num py-1"
                        type="number"
                        step="0.01"
                        min={0}
                        value={fees[r.k]}
                        onChange={(e) => setFees({ ...fees, kind: "custom", [r.k]: Number(e.target.value) })}
                      />
                      <span className="text-muted w-4">{r.unit}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">
            מספרים טיפוסיים להמחשה. שינוי של ערך הופך את הפרופיל ל&quot;מותאם&quot;. כשתקבל הצעה מבנק או מברוקר, הקלד כאן את המספרים שלה.
          </p>

          <h3 className="font-semibold pt-2">3. הפקדה חודשית</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={depOn} onChange={(e) => setDepOn(e.target.checked)} /> להפקיד כל חודש
          </label>
          {depOn && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="סכום (₪)">
                  <input className="input num" type="number" min={100} step={100} value={dep.amount} onChange={(e) => setDep({ ...dep, amount: Number(e.target.value) })} />
                </Field>
                <Field label="ביום בחודש">
                  <input className="input num" type="number" min={1} max={31} value={dep.day} onChange={(e) => setDep({ ...dep, day: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="מה לעשות עם ההפקדה?">
                <select className="input" value={dep.autoBuy ? "auto" : "cash"} onChange={(e) => setDep({ ...dep, autoBuy: e.target.value === "auto" ? "VOO" : null })}>
                  <option value="cash">להשאיר במזומן (אחליט לבד)</option>
                  <option value="auto">לקנות אוטומטית נייר אחד (הוראת קבע)</option>
                </select>
              </Field>
              {dep.autoBuy && (
                <Field label={`נייר לקנייה אוטומטית: ${dep.autoBuy}`} hint="קונים כמה שיותר מניות שלמות בכל חודש. לנייר בדולרים, ההפקדה מומרת אוטומטית (עם עמלה).">
                  <SymbolSearch value={dep.autoBuy} onPick={(s) => setDep({ ...dep, autoBuy: s })} />
                </Field>
              )}
            </div>
          )}
          {err && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{err}</div>}
          <button className="btn w-full" disabled={busy} onClick={submit}>
            {busy ? "פותח…" : "פתח תיק"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-muted block mt-1">{hint}</span>}
    </label>
  );
}

function Opt({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={`text-start rounded-lg border px-3 py-2 ${on ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
      <b className="block text-sm">{title}</b>
      <small className="text-muted">{sub}</small>
    </button>
  );
}
