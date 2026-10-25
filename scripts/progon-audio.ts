import "dotenv/config";
import { copyFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../src/lib/db";
import { dlitelnostSekund, minutyKvoty } from "../src/lib/audio";
import { kluchObjekta, putFayla } from "../src/lib/hranilishche";
import { spisatKvotu, vernutKvotu, zapisatRashod } from "../src/lib/kvota";
import { postavitZadanie, ostanovitOchered } from "../src/lib/ochered";
import { zapustitRabotnika } from "../worker/index";

/*
  Сквозной прогон одного источника: файл на входе, фрагменты с таймкодами на выходе.

  Проверяет порядок, ради которого всё и строилось: длительность считается до постановки
  задачи, квота списывается в той же транзакции, что создаёт источник и ставит задачу, и при
  неудаче квота возвращается.

    npx tsx scripts/progon-audio.ts путь/к/записи.m4a
*/

async function main() {
  const vhod = process.argv[2];
  if (!vhod) throw new Error("укажите путь к записи");

  // ── 1. Длительность до всего остального ─────────────────────────────────
  const sekund = await dlitelnostSekund(vhod);
  const minut = minutyKvoty(sekund);
  console.log(`запись ${Math.round(sekund)}с, к списанию ${minut} мин`);

  const user = await db.user.create({
    data: {
      email: `progon-${Date.now()}@pocherk.local`,
      passwordHash: "заглушка",
      subscription: {
        create: {
          periodEnd: new Date(Date.now() + 30 * 86400_000),
          audioMinutesLeft: 240,
          handPagesLeft: 20,
          pdfPagesLeft: 50,
          rebuildsLeft: 15,
        },
      },
    },
  });

  const course = await db.course.create({
    data: { userId: user.id, title: "Прогон", discipline: "Математический анализ" },
  });

  // ── 2. Источник, квота и задача одной транзакцией ───────────────────────
  const sourceId = await db.$transaction(async (tx) => {
    const spisano = await spisatKvotu(tx, user.id, "AUDIO_MINUTE", minut);
    if (!spisano.ok) throw new Error(`квота: ${spisano.prichina}`);

    const source = await tx.source.create({
      data: { courseId: course.id, kind: "AUDIO", title: path.basename(vhod), authority: 3 },
    });

    const kluch = kluchObjekta(user.id, source.id, "original" + path.extname(vhod));

    await tx.asset.create({
      data: {
        sourceId: source.id,
        role: "original",
        objectKey: kluch,
        mimeType: "audio/mp4",
        bytes: BigInt(0),
        sha256: "",
      },
    });

    const job = await tx.job.create({ data: { sourceId: source.id, stage: "TRANSCODE" } });

    await zapisatRashod(tx, user.id, "AUDIO_MINUTE", minut, 0, "gigaam-svoj-host", job.id);
    await postavitZadanie(tx, { sourceId: source.id, stage: "TRANSCODE", jobRef: job.id });

    return source.id;
  });

  // Файл кладётся после транзакции: если она откатится, мусора в хранилище не останется.
  const asset = await db.asset.findFirstOrThrow({ where: { sourceId, role: "original" } });
  await copyFile(vhod, await putFayla(asset.objectKey));

  console.log("источник создан, задача поставлена");

  // ── 3. Работник ─────────────────────────────────────────────────────────
  await zapustitRabotnika();

  const dozhdalis = await zhdat(sourceId);

  // ── 4. Что вышло ────────────────────────────────────────────────────────
  const fragmentov = await db.fragment.count({ where: { sourceId } });
  const pervye = await db.fragment.findMany({
    where: { sourceId },
    orderBy: { startMs: "asc" },
    take: 3,
  });

  console.log(`\nстадия распознавания: ${dozhdalis}`);
  console.log(`фрагментов: ${fragmentov}`);
  for (const f of pervye) {
    const t = Math.round((f.startMs ?? 0) / 1000);
    console.log(`  ${f.shortRef} @ ${t}с [${f.confidence}] ${f.text.slice(0, 70)}`);
  }

  if (dozhdalis === "FAILED") {
    const job = await db.job.findFirstOrThrow({
      where: { sourceId, stage: "TRANSCRIBE" },
    });
    console.log("причина:", job.error);

    // Обработка не состоялась, значит минуты возвращаются пользователю.
    await db.$transaction((tx) => vernutKvotu(tx, user.id, "AUDIO_MINUTE", minut));
    console.log("квота возвращена");
  }

  const ostatok = await db.subscription.findUniqueOrThrow({ where: { userId: user.id } });
  console.log(`остаток минут: ${ostatok.audioMinutesLeft} из 240`);

  await db.user.delete({ where: { id: user.id } });
  await ostanovitOchered();
  await db.$disconnect();

  process.exit(dozhdalis === "DONE" && fragmentov > 0 ? 0 : 1);
}

async function zhdat(sourceId: string): Promise<string> {
  const predel = Date.now() + 20 * 60_000;

  while (Date.now() < predel) {
    const job = await db.job.findFirst({ where: { sourceId, stage: "TRANSCRIBE" } });

    if (job?.status === "DONE" || job?.status === "FAILED") return job.status;

    const transkod = await db.job.findFirst({ where: { sourceId, stage: "TRANSCODE" } });
    if (transkod?.status === "FAILED") return "FAILED";

    await new Promise((r) => setTimeout(r, 2000));
  }

  return "не дождались";
}

main().catch(async (e) => {
  console.error(e);
  await ostanovitOchered();
  await db.$disconnect();
  process.exit(1);
});
