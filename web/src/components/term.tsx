"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GLOSSARY_BY_ID } from "@/lib/glossary";

/**
 * מונח עם קו מקווקו (D17). במחשב: בועה במעבר עכבר או בלחיצה. בטלפון: חלון שנפתח מלמטה.
 * ההסבר מגיע מהמילון המרכזי, כך שהוא זהה בכל מסך.
 */
export default function Term({ id, children }: { id: string; children?: React.ReactNode }) {
  const t = GLOSSARY_BY_ID.get(id);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-term-box]")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!t) return <>{children}</>;

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const m = window.matchMedia("(max-width: 767px)").matches;
    setMobile(m);
    const r = ref.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - 328, r.right - 320)) });
    setOpen(true);
  };
  const hideSoon = () => {
    hideTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const box = (
    <>
      <b className="text-[#9fb6ff] block mb-1">{t.term}</b>
      <span className="block">{t.body}</span>
      <span className="block mt-2 opacity-90">
        <b className="text-[#9fb6ff]">דוגמה:</b> {t.example}
      </span>
      <Link href={`/glossary#${t.id}`} className="block mt-2 text-[#9fb6ff] underline">
        עוד במילון ←
      </Link>
    </>
  );

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        className="border-b-[1.5px] border-dashed border-brand cursor-help"
        onMouseEnter={() => !window.matchMedia("(max-width: 767px)").matches && show()}
        onMouseLeave={hideSoon}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), show())}
      >
        {children ?? t.term}
      </span>
      {open && pos && !mobile && (
        <span
          data-term-box
          role="tooltip"
          className="fixed z-[60] w-80 bg-ink text-white rounded-xl p-3.5 text-[13px] leading-relaxed shadow-2xl text-start font-normal"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => hideTimer.current && clearTimeout(hideTimer.current)}
          onMouseLeave={hideSoon}
        >
          {box}
        </span>
      )}
      {open && mobile && (
        <span data-term-box className="fixed inset-x-0 bottom-0 z-[60] bg-ink text-white rounded-t-2xl p-4 pb-6 text-sm leading-relaxed shadow-2xl text-start font-normal block">
          <button className="absolute top-2 left-3 text-white/70 text-lg" onClick={() => setOpen(false)} aria-label="סגור">
            ✕
          </button>
          {box}
        </span>
      )}
    </>
  );
}
