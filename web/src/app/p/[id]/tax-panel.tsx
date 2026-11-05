"use client";

import Term from "@/components/term";
import { money, signed, tone } from "@/lib/format";
import type { PortfolioView } from "@/lib/engine/service";

export default function TaxPanel({ view }: { view: PortfolioView }) {
  const c = view.costs;
  const parts = [
    { k: "מס רווחי הון", v: view.tax.years.reduce((a, y) => a + y.taxPaid, 0), color: "var(--brand)" },
    { k: "מס על דיבידנדים", v: view.tax.divTaxTotal, color: "var(--time)" },
    { k: "עמלות קנייה/מכירה", v: c.trade, color: "var(--warn)" },
    { k: "עמלות המרה", v: c.fx, color: "var(--down)" },
    { k: "דמי משמרת", v: c.custody, color: "#888" },
  ];
  const total = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
  const mine = c.trade + c.fx + c.custody;
  const bank = c.bank.trade + c.bank.fx + c.bank.custody;
  const isBank = view.portfolio.fees.kind === "bank";

  return (
    <div className="space-y-4">
      <div className="card text-sm text-muted">
        <Term id="cgt">מס רווחי הון</Term> בישראל: 25% מהרווח. הפסד מקזז רווח באותה שנה (ואז מקבלים החזר מס), ומה שנשאר עובר לשנים הבאות (<Term id="loss-shield">מגן מס</Term>).
        הרווח על מניה אמריקאית מחושב בשקלים: מחיר המכירה בשער של יום המכירה, פחות מחיר הקנייה בשער של יום הקנייה.
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-2">מס לפי שנה</h3>
        {view.tax.years.length === 0 ? (
          <p className="text-sm text-muted">עוד לא מכרת כלום ולא קיבלת דיבידנדים, ולכן אין מס.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line"><th className="text-start py-1.5">שנה</th><th className="text-start">רווח/הפסד שמומש</th><th className="text-start">מגן מס משנים קודמות</th><th className="text-start">מס רווחי הון</th><th className="text-start">מס דיבידנדים</th></tr>
            </thead>
            <tbody>
              {view.tax.years.map((y) => (
                <tr key={y.year} className="border-b border-line">
                  <td className="py-2 num">{y.year}</td>
                  <td className={`num ${tone(y.realized)}`}>{signed(y.realized)}</td>
                  <td className="num">{y.carryIn ? money(y.carryIn) : "—"}</td>
                  <td className="num">{money(y.taxPaid)}</td>
                  <td className="num">{money(y.divTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold mb-2">לאן הלך הכסף</h3>
          {total > 0 && (
            <div className="h-2.5 rounded-full overflow-hidden flex bg-bg mb-3">
              {parts.map((p) => p.v > 0 && <i key={p.k} style={{ width: `${(p.v / total) * 100}%`, background: p.color }} />)}
            </div>
          )}
          {parts.map((p) => (
            <div key={p.k} className="flex justify-between text-sm py-0.5">
              <span><i className="inline-block w-2.5 h-2.5 rounded-full me-1.5" style={{ background: p.color }} />{p.k}</span>
              <span className="num">{money(p.v)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold border-t border-line pt-2 mt-1"><span>סה&quot;כ</span><span className="num">{money(total)}</span></div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2">{isBank ? "🤔 ואם היית בברוקר אונליין?" : "🤔 ואם היית בבנק?"}</h3>
          {isBank ? (
            <p className="text-sm text-muted">התיק הזה כבר עם עמלות בנק. כדי להשוות, פתח תיק זהה עם פרופיל &quot;ברוקר אונליין&quot; ובצע את אותן פעולות.</p>
          ) : (
            <>
              <p className="text-sm">אותן תנועות בדיוק, עם עמלות טיפוסיות של בנק:</p>
              <div className="text-sm space-y-1 mt-2">
                <Cmp k="עמלות קנייה/מכירה" a={c.trade} b={c.bank.trade} />
                <Cmp k={`דמי משמרת${c.bank.custodyEstimated ? " (הערכה)" : ""}`} a={c.custody} b={c.bank.custody} />
                <Cmp k="עמלות המרה" a={c.fx} b={c.bank.fx} />
                <div className="flex justify-between font-bold border-t border-line pt-2"><span>הפרש</span><span className="num text-down">{money(bank - mine)}</span></div>
              </div>
              {view.totals.total > 0 && bank - mine > 0 && (
                <div className="text-sm rounded-lg p-2.5 bg-brand-soft text-[#1d3c9e] mt-3">
                  זה {((100 * (bank - mine)) / view.totals.total).toFixed(2)}% מהתיק. לאורך שנים ההפרש הזה מצטבר, כי גם הכסף שהלך לעמלות לא צובר תשואה.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Cmp({ k, a, b }: { k: string; a: number; b: number }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span className="num">{money(a)} ← {money(b)}</span>
    </div>
  );
}
