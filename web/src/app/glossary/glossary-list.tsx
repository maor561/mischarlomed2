"use client";

import { useEffect, useMemo, useState } from "react";
import { GLOSSARY, TERM_CATS, type TermCat } from "@/lib/glossary";

export default function GlossaryList() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<TermCat | null>(null);
  const [hash, setHash] = useState("");

  // קפיצה למונח מתוך "עוד במילון"
  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    const t = setTimeout(() => {
      setHash(h);
      document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const list = useMemo(() => {
    const s = q.trim();
    return GLOSSARY.filter((t) => (!cat || t.cat === cat) && (!s || t.term.includes(s) || t.body.includes(s) || t.id.includes(s.toLowerCase())));
  }, [q, cat]);

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <h1 className="text-xl font-bold">מילון</h1>
      <p className="text-muted">כל המונחים במקום אחד. בכל מסך, מונח עם קו מקווקו פותח את ההסבר שלו מכאן.</p>
      <div className="card space-y-3">
        <input className="input" placeholder="🔍 חפש מונח: דיבידנד, סטופ, מגן מס…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1.5 flex-wrap">
          <button className={`chip ${!cat ? "chip-on" : ""}`} onClick={() => setCat(null)}>הכול ({GLOSSARY.length})</button>
          {TERM_CATS.map((c) => (
            <button key={c} className={`chip ${cat === c ? "chip-on" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="text-muted text-sm">לא נמצא מונח. נסה מילה אחרת.</p>}
        {list.map((t) => (
          <div key={t.id} id={t.id} className={`border-b border-line last:border-0 py-3 scroll-mt-24 ${hash === t.id ? "bg-brand-soft -mx-4 px-4 rounded-lg" : ""}`}>
            <h2 className="font-semibold text-base">
              {t.term} <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-bg text-muted">{t.cat}</span>
            </h2>
            <p className="text-sm mt-1">{t.body}</p>
            <div className="text-sm bg-bg rounded-md px-3 py-2 mt-2">דוגמה: {t.example}</div>
            <div className="text-xs text-muted mt-1">מופיע ב: {t.where}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
