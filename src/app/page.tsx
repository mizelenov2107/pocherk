import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Glavnaya() {
  const kursov = await db.course.count();

  return (
    <main className="mx-auto w-full max-w-[var(--canvas-w)] px-6 py-16">
      <p className="font-[family-name:var(--font-head)] text-[13px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Почерк
      </p>

      <h1 className="mt-4 font-[family-name:var(--font-head)] text-[40px] leading-[48px] tracking-[-0.02em] text-[var(--text)]">
        Лекция, тетрадь, слайды и учебник превращаются в один конспект
      </h1>

      <p className="mt-6 text-[19px] leading-[32px] text-[var(--text-secondary)]">
        Каждое определение раскрыто на маленьких числах и проверено контрпримером, а у каждого
        абзаца видно, откуда он взялся: таймкод записи, страница тетради, номер слайда.
      </p>

      <p className="mt-10 border-t border-[var(--border)] pt-4 text-[15px] leading-[26px] text-[var(--text-muted)]">
        Каркас поднят. Курсов в базе: {kursov}.
      </p>
    </main>
  );
}
