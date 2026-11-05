"use client";

import { useSearchParams } from "next/navigation";
import PortfolioScreen from "./portfolio-screen";

/**
 * Next.js שומר מצב של מסכים שכבר ביקרת בהם. קישור מדף נייר (?tab=order&symbol=…)
 * צריך מסך "טרי" שיקרא את הפרמטרים, ולכן המפתח תלוי בהם.
 */
export default function PortfolioRoute() {
  const sp = useSearchParams();
  return <PortfolioScreen key={sp.toString()} />;
}
