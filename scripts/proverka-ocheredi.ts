import "dotenv/config";
import { db } from "../src/lib/db";
import { poluchitOchered, postavitZadanie, ostanovitOchered, OCHERED } from "../src/lib/ochered";

/*
  Проверяет главное свойство очереди: задача и источник появляются вместе либо не появляются
  вовсе.

  Два прогона. Первый успешный, и после него в очереди лежит ровно одна задача. Второй
  падает внутри транзакции уже после постановки задачи, и после него в очереди по-прежнему
  одна задача, а не две: откат забирает её с собой.
*/

async function main() {
  await poluchitOchered();

  const pochta = `proverka-${Date.now()}@pocherk.local`;

  const user = await db.user.create({
    data: { email: pochta, passwordHash: "заглушка" },
  });

  const course = await db.course.create({
    data: { userId: user.id, title: "Проверка очереди", discipline: "Матанализ" },
  });

  // ── Прогон 1: транзакция проходит ────────────────────────────────────────
  const id1 = await db.$transaction(async (tx) => {
    const source = await tx.source.create({
      data: { courseId: course.id, kind: "AUDIO", title: "Лекция 1", authority: 3 },
    });

    const job = await tx.job.create({
      data: { sourceId: source.id, stage: "TRANSCODE" },
    });

    await postavitZadanie(tx, {
      sourceId: source.id,
      stage: "TRANSCODE",
      jobRef: job.id,
    });

    return source.id;
  });

  console.log("прогон 1: источник создан", id1);

  // ── Прогон 2: транзакция падает после постановки задачи ──────────────────
  let upalo = false;
  try {
    await db.$transaction(async (tx) => {
      const source = await tx.source.create({
        data: { courseId: course.id, kind: "AUDIO", title: "Лекция 2", authority: 3 },
      });

      const job = await tx.job.create({
        data: { sourceId: source.id, stage: "TRANSCODE" },
      });

      await postavitZadanie(tx, {
        sourceId: source.id,
        stage: "TRANSCODE",
        jobRef: job.id,
      });

      throw new Error("нарочный сбой после постановки задачи");
    });
  } catch {
    upalo = true;
  }

  console.log("прогон 2: транзакция откатилась —", upalo);

  // ── Что осталось ────────────────────────────────────────────────────────
  const istochnikov = await db.source.count({ where: { courseId: course.id } });

  const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*)::bigint as count from pgboss.job where name = $1 and state = 'created'`,
    OCHERED,
  );

  console.log("источников в базе:", istochnikov, "(ожидается 1)");
  console.log("задач в очереди:", Number(count), "(ожидается 1)");

  const sошлось = istochnikov === 1 && Number(count) === 1;
  console.log(sошлось ? "СОШЛОСЬ" : "НЕ СОШЛОСЬ");

  // прибираем за собой
  await db.user.delete({ where: { id: user.id } });
  await db.$executeRawUnsafe(`delete from pgboss.job where name = $1`, OCHERED);

  await ostanovitOchered();
  await db.$disconnect();

  process.exit(sошлось ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await ostanovitOchered();
  await db.$disconnect();
  process.exit(1);
});
