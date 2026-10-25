import "dotenv/config";
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { db } from "../src/lib/db";
import { privesti } from "../src/lib/audio";
import { vypravitOboznacheniya } from "../src/lib/oboznacheniya";
import { putFayla } from "../src/lib/hranilishche";
import {
  poluchitOchered,
  OCHERED,
  type ZadanieObrabotki,
} from "../src/lib/ochered";

const zapustit = promisify(execFile);

/*
  Работник конвейера.

  Стадии идут одна за другой и каждая ставит следующую. Разбиение на стадии не украшение:
  распознавание часовой записи идёт минутами, и если уронить весь конвейер целиком, повтор
  начнётся с нуля и второй раз заплатит за то, что уже сделано.

  Каждая стадия идемпотентна по паре «источник и стадия»: запись `Job` уникальна по ним, а
  повторный запуск переписывает результат, а не добавляет второй.
*/

const PYTHON = process.env.POCHERK_PYTHON ?? "python3";
const RASPOZNAT = path.join(process.cwd(), "worker", "asr", "raspoznat.py");

// Порог уверенности покрытия. Расшифровка, покрывающая меньше половины записи, почти
// наверняка означает, что определитель речи провалил кусок, а не что человек молчал.
const MIN_POKRYTIE = 0.5;

type Segment = {
  start: number;
  end: number;
  text: string;
  src: string;
  zalipanie?: boolean;
};

type ItogRaspoznavaniya = {
  durationSec: number;
  gain: number;
  coveredSec: number;
  stickCount: number;
  segments: Segment[];
};

async function stadiyaTranskod(zadanie: ZadanieObrabotki): Promise<void> {
  const istochnik = await db.source.findUniqueOrThrow({
    where: { id: zadanie.sourceId },
    include: { assets: { where: { role: "original" } }, course: true },
  });

  const original = istochnik.assets[0];
  if (!original) throw new Error("у источника нет исходного файла");

  const vhod = await putFayla(original.objectKey);
  const kluchWav = original.objectKey.replace(/\.[^.]+$/, "") + ".16k.wav";
  const vyhod = await putFayla(kluchWav);

  await privesti(vhod, vyhod);

  await db.asset.upsert({
    where: { objectKey: kluchWav },
    create: {
      sourceId: istochnik.id,
      role: "wav16k",
      objectKey: kluchWav,
      mimeType: "audio/wav",
      bytes: BigInt(0),
      sha256: "",
    },
    update: {},
  });

  await postavitSleduyushchuyu(zadanie, "TRANSCRIBE");
}

async function stadiyaRaspoznat(zadanie: ZadanieObrabotki): Promise<void> {
  const istochnik = await db.source.findUniqueOrThrow({
    where: { id: zadanie.sourceId },
    include: { assets: { where: { role: "wav16k" } } },
  });

  const wav = istochnik.assets[0];
  if (!wav)
    throw new Error("нет приведённого файла, стадия транскода не отработала");

  const putWav = await putFayla(wav.objectKey);
  const putJson = putWav.replace(/\.wav$/, ".asr.json");

  await zapustit(PYTHON, [RASPOZNAT, putWav, putJson], {
    maxBuffer: 32 * 1024 * 1024,
  });

  const itog: ItogRaspoznavaniya = JSON.parse(await readFile(putJson, "utf8"));

  /*
    Слой приёмки «покрытие источника». Измерено на живой лекции: определитель речи потерял
    одиннадцать минут середины и не сказал об этом. Расхождение блокирует стадию, а не
    проходит дальше молча.
  */
  const dolya = itog.coveredSec / itog.durationSec;
  if (dolya < MIN_POKRYTIE) {
    throw new Error(
      `расшифровка покрывает ${Math.round(dolya * 100)} % записи, это ниже порога`,
    );
  }

  // Повторный прогон переписывает фрагменты, а не добавляет второй набор.
  await db.fragment.deleteMany({ where: { sourceId: istochnik.id } });

  /*
    Выправление обозначений идёт до записи фрагментов, потому что дальше по конвейеру текст
    попадает в поиск и в запрос к модели, и разнобой «икс» против `x` портит оба. Исходная
    расшифровка при этом не теряется: она лежит рядом с записью, а фрагмент держит таймкод,
    по которому место всегда можно переслушать.
  */
  let zamen = 0;

  await db.fragment.createMany({
    data: itog.segments
      .filter((s) => !s.zalipanie && s.text.trim().length > 0)
      .map((s, i) => {
        const vypravleno = vypravitOboznacheniya(s.text);
        zamen += vypravleno.zameny.length;
        return {
          sourceId: istochnik.id,
          shortRef: `frg_${i + 1}`,
          text: vypravleno.tekst,
          startMs: Math.round(s.start * 1000),
          endMs: Math.round(s.end * 1000),
          // Сегмент, добитый окнами, чуть менее надёжен, и приёмка должна это видеть.
          confidence: s.src === "речь" ? 1 : 0.8,
        };
      }),
  });

  console.log(`[работник] обозначений выправлено: ${zamen}`);

  await db.source.update({
    where: { id: istochnik.id },
    data: { durationMs: Math.round(itog.durationSec * 1000) },
  });

  await unlink(putJson).catch(() => {});
}

async function postavitSleduyushchuyu(
  zadanie: ZadanieObrabotki,
  stage: ZadanieObrabotki["stage"],
): Promise<void> {
  const { postavitZadanie } = await import("../src/lib/ochered");

  await db.$transaction(async (tx) => {
    const job = await tx.job.upsert({
      where: { sourceId_stage: { sourceId: zadanie.sourceId, stage } },
      create: { sourceId: zadanie.sourceId, stage },
      update: { status: "QUEUED", error: null },
    });

    await postavitZadanie(tx, {
      sourceId: zadanie.sourceId,
      stage,
      jobRef: job.id,
    });
  });
}

async function vypolnit(zadanie: ZadanieObrabotki): Promise<void> {
  await db.job.updateMany({
    where: { sourceId: zadanie.sourceId, stage: zadanie.stage },
    data: { status: "RUNNING", startedAt: new Date(), error: null },
  });

  try {
    if (zadanie.stage === "TRANSCODE") await stadiyaTranskod(zadanie);
    else if (zadanie.stage === "TRANSCRIBE") await stadiyaRaspoznat(zadanie);
    else throw new Error(`стадия ${zadanie.stage} ещё не собрана`);

    await db.job.updateMany({
      where: { sourceId: zadanie.sourceId, stage: zadanie.stage },
      data: { status: "DONE", finishedAt: new Date() },
    });
  } catch (e) {
    const soobshchenie = e instanceof Error ? e.message : String(e);

    await db.job.updateMany({
      where: { sourceId: zadanie.sourceId, stage: zadanie.stage },
      data: { status: "FAILED", finishedAt: new Date(), error: soobshchenie },
    });

    throw e;
  }
}

export async function zapustitRabotnika() {
  const boss = await poluchitOchered();

  await boss.work<ZadanieObrabotki>(
    OCHERED,
    // По одной задаче за раз: тяжёлые стадии упираются в процессор, и параллельность здесь
    // только замедлит обе.
    { batchSize: 1 },
    async ([zadacha]) => {
      console.log(
        `[работник] ${zadacha.data.stage} источник ${zadacha.data.sourceId}`,
      );
      await vypolnit(zadacha.data);
    },
  );

  console.log("[работник] слушает очередь");
}

if (process.argv[1] && process.argv[1].endsWith("worker/index.ts")) {
  zapustitRabotnika().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
