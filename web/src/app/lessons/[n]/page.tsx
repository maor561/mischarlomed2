import { Suspense } from "react";
import TopNav from "@/components/top-nav";
import LessonScreen from "./lesson-screen";

export default function LessonPage() {
  return (
    <Suspense fallback={<main className="max-w-5xl mx-auto p-6 text-muted">טוען…</main>}>
      <TopNav />
      <LessonScreen />
    </Suspense>
  );
}
