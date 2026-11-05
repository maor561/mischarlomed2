"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, dateHe, money } from "@/lib/format";
import type { Portfolio } from "@/lib/engine/types";

const FEE_HE = { bank: "🏦 בנק", online: "💻 ברוקר אונליין", custom: "✏️ מותאם" };

export default function PortfolioList() {
  const [list, setList] = useState<Portfolio[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Portfolio[]>("/api/portfolios").then(setList, (e) => setErr(e.message));
  }, []);

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">התיקים שלי</h1>
        <span className="flex-1" />
        <Link href="/new" className="btn">
          + תיק חדש
        </Link>
      </div>
      {err && <div className="card bg-down-soft text-down">{err}</div>}
      {list && list.length === 0 && (
        <div className="card text-center py-10 space-y-3">
          <p className="text-lg">עוד אין לך תיקים.</p>
          <p className="text-muted">כדאי להתחיל בתיק &quot;מכונת זמן&quot;, למשל מפברואר 2020, ולראות מה קורה לכסף בקריסה ובהתאוששות.</p>
          <Link href="/new" className="btn inline-block">
            פתח תיק ראשון
          </Link>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {list?.map((p) => (
          <Link key={p.id} href={`/p/${p.id}`} className="card hover:border-brand transition-colors block">
            <div className="flex items-baseline gap-2">
              <b className="text-base">{p.name}</b>
              <span className={`text-xs px-2 py-0.5 rounded-full ${p.mode === "time" ? "bg-time-soft text-time" : "bg-down-soft text-down"}`}>
                {p.mode === "time" ? "⏳ מכונת זמן" : "🔴 חי"}
              </span>
            </div>
            <div className="text-sm text-muted mt-1">
              {p.mode === "time" ? (
                <>
                  התחיל ב-<span className="num">{dateHe(p.startDate)}</span> · עכשיו ב-<span className="num">{dateHe(p.simDate)}</span>
                </>
              ) : (
                <>
                  נפתח ב-<span className="num">{dateHe(p.startDate)}</span>
                </>
              )}
            </div>
            <div className="text-sm text-muted">
              הון התחלתי <span className="num">{money(p.initialCapital, "ILS", 0)}</span> · {FEE_HE[p.fees.kind]}
              {p.deposit && (
                <>
                  {" "}· הפקדה <span className="num">{money(p.deposit.amount, "ILS", 0)}</span> בחודש
                </>
              )}
            </div>
          </Link>
        ))}
      </div>
      {!list && !err && <div className="card text-muted">טוען…</div>}
    </main>
  );
}
