import "dotenv/config";
import { db } from "../src/lib/db";
import { spisatKvotu, POTOLOK_SUTKI_RUB } from "../src/lib/kvota";

/*
  Проверяет три защиты от выкачивания денег.

  1. Гонка. Два одновременных списания при остатке, которого хватает только на одно.
     Пройти должно ровно одно: условие на остаток стоит внутри запроса, а не рядом с ним.
  2. Потолок в рублях. Квота ещё есть, но за сутки уже потрачено больше потолка.
  3. Одновременность. Пока идёт одна тяжёлая задача, вторая не берётся.
*/

async function main() {
  const user = await db.user.create({
    data: {
      email: `kvota-${Date.now()}@pocherk.local`,
      passwordHash: "заглушка",
      subscription: {
        create: {
          periodEnd: new Date(Date.now() + 30 * 86400_000),
          audioMinutesLeft: 90,
          handPagesLeft: 20,
          pdfPagesLeft: 50,
          rebuildsLeft: 15,
        },
      },
    },
  });

  const uspehov: boolean[] = [];

  // ── 1. Гонка: остатка 90 минут хватает на одно списание из двух по 90 ───
  const [a, b] = await Promise.all([
    db.$transaction((tx) => spisatKvotu(tx, user.id, "AUDIO_MINUTE", 90)),
    db.$transaction((tx) => spisatKvotu(tx, user.id, "AUDIO_MINUTE", 90)),
  ]);

  const proshloOdno = [a.ok, b.ok].filter(Boolean).length === 1;
  const ostatok = await db.subscription.findUnique({ where: { userId: user.id } });
  console.log(
    `гонка: прошло ${[a.ok, b.ok].filter(Boolean).length} из 2, остаток минут ${ostatok?.audioMinutesLeft}`,
  );
  uspehov.push(proshloOdno && ostatok?.audioMinutesLeft === 0);

  // ── 2. Потолок в рублях ────────────────────────────────────────────────
  await db.subscription.update({
    where: { userId: user.id },
    data: { handPagesLeft: 20 },
  });
  await db.quotaEntry.create({
    data: {
      userId: user.id,
      kind: "HAND_PAGE",
      amount: 1,
      costRub: POTOLOK_SUTKI_RUB + 1,
      vendor: "проверка",
    },
  });

  const c = await db.$transaction((tx) => spisatKvotu(tx, user.id, "HAND_PAGE", 1));
  console.log("потолок за сутки:", c.ok ? "НЕ сработал" : c.prichina);
  uspehov.push(!c.ok && c.prichina === "потолок за сутки");

  // ── 3. Одновременность ─────────────────────────────────────────────────
  await db.quotaEntry.deleteMany({ where: { userId: user.id } });

  const course = await db.course.create({
    data: { userId: user.id, title: "Проверка квоты" },
  });
  const source = await db.source.create({
    data: { courseId: course.id, kind: "AUDIO", title: "Идёт", authority: 3 },
  });
  await db.job.create({ data: { sourceId: source.id, stage: "TRANSCRIBE", status: "RUNNING" } });

  const d = await db.$transaction((tx) => spisatKvotu(tx, user.id, "HAND_PAGE", 1));
  console.log("одновременность:", d.ok ? "НЕ сработала" : d.prichina);
  uspehov.push(!d.ok && d.prichina === "уже идёт обработка");

  await db.user.delete({ where: { id: user.id } });
  await db.$disconnect();

  const vse = uspehov.every(Boolean);
  console.log(vse ? "СОШЛОСЬ" : "НЕ СОШЛОСЬ");
  process.exit(vse ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
