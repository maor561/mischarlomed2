"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "התיקים שלי" },
  { href: "/lessons", label: "שיעורים" },
  { href: "/glossary", label: "מילון" },
  { href: "/rules", label: "חוקי המנוע" },
  { href: "/data", label: "בדיקת נתונים" },
];

export default function TopNav({ children }: { children?: React.ReactNode }) {
  const path = usePathname();
  return (
    <header className="bg-card border-b border-line px-4 md:px-6 py-2.5 flex items-center gap-4 flex-wrap">
      <Link href="/" className="text-lg font-bold">
        📈 מסחר<span className="text-brand">־לומד</span>
      </Link>
      <nav className="flex gap-1">
        {LINKS.map((l) => {
          const on = l.href === "/" ? path === "/" || path.startsWith("/p/") || path === "/new" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={`px-3 py-1.5 rounded-lg text-sm ${on ? "bg-brand-soft text-brand font-semibold" : "text-muted hover:text-ink"}`}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <span className="flex-1" />
      {children}
    </header>
  );
}
