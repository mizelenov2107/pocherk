import type { Prisma } from "@/generated/prisma/client";
import type { QuotaKind } from "@/generated/prisma/enums";

/*
  Квота и потолок расходов.

  Это самая дорогая угроза продукта, и она не про взлом. Объём работы задаёт пользователь,
  а счёт поставщикам оплачивает владелец. Без верхней границы её не существует вовсе: один
  человек с трёхчасовыми записями и сотней пересборок в сутки способен вынести месячную
  выручку.

  Три правила, и все три обязательны.

  Первое: объём считается ДО постановки задачи в очередь. Длительность записи берётся у
  ffprobe, число страниц у pdfinfo, и только потом задача ставится. Считать после обработки
  поздно: деньги уже потрачены.

  Второе: списание атомарное. Проверка «хватает ли» и вычитание идут одним запросом с
  условием на остаток, иначе два одновременных запроса пройдут оба и остаток уйдёт в минус.

  Третье: помимо квоты есть потолок в рублях на сутки и на месяц. Квота защищает от честного
  перерасхода, потолок от подобранной нагрузки, которая укладывается в квоту, но стоит
  непропорционально дорого.
*/

// Потолки стоимости на пользователя. Ниже месячной себестоимости самого дорогого тарифа,
// потому что выборка квоты целиком это уже край, а не норма.
export const POTOLOK_SUTKI_RUB = 120;
export const POTOLOK_MESYAC_RUB = 900;

// Одна тяжёлая задача на пользователя одновременно. Иначе десять записей, поставленных
// разом, занимают весь сервер и разгоняют счёт за минуты.
export const ODNOVREMENNO = 1;

const POLE: Record<QuotaKind, keyof PoleOstatka | null> = {
  AUDIO_MINUTE: "audioMinutesLeft",
  HAND_PAGE: "handPagesLeft",
  PDF_PAGE: "pdfPagesLeft",
  PDF_SCAN_PAGE: "pdfPagesLeft",
  REBUILD: "rebuildsLeft",
};

type PoleOstatka = {
  audioMinutesLeft: number;
  handPagesLeft: number;
  pdfPagesLeft: number;
  rebuildsLeft: number;
};

export type Otkaz =
  | { ok: true }
  | { ok: false; prichina: "нет подписки" }
  | { ok: false; prichina: "кончилась квота"; kind: QuotaKind; nuzhno: number }
  | { ok: false; prichina: "потолок за сутки"; potracheno: number }
  | { ok: false; prichina: "потолок за месяц"; potracheno: number }
  | { ok: false; prichina: "уже идёт обработка"; zadach: number };

type Tx = Prisma.TransactionClient;

/*
  Проверяет и списывает квоту одним заходом. Вызывается внутри той же транзакции, что создаёт
  источник и ставит задачу: либо всё вместе, либо ничего.
*/
export async function spisatKvotu(
  tx: Tx,
  userId: string,
  kind: QuotaKind,
  skolko: number,
): Promise<Otkaz> {
  const podpiska = await tx.subscription.findUnique({ where: { userId } });
  if (!podpiska) return { ok: false, prichina: "нет подписки" };

  const idet = await tx.job.count({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      source: { course: { userId } },
    },
  });
  if (idet >= ODNOVREMENNO) {
    return { ok: false, prichina: "уже идёт обработка", zadach: idet };
  }

  const sutki = await potracheno(tx, userId, 24);
  if (sutki >= POTOLOK_SUTKI_RUB) {
    return { ok: false, prichina: "потолок за сутки", potracheno: sutki };
  }

  const mesyac = await potracheno(tx, userId, 24 * 30);
  if (mesyac >= POTOLOK_MESYAC_RUB) {
    return { ok: false, prichina: "потолок за месяц", potracheno: mesyac };
  }

  const pole = POLE[kind];
  if (!pole) return { ok: true };

  /*
    Условие на остаток внутри самого запроса. Если между чтением и записью влезет второй
    запрос, обновится ноль строк, и мы честно откажем вместо ухода остатка в минус.
  */
  const { count } = await tx.subscription.updateMany({
    where: { userId, [pole]: { gte: skolko } },
    data: { [pole]: { decrement: skolko } },
  });

  if (count === 0) {
    return { ok: false, prichina: "кончилась квота", kind, nuzhno: skolko };
  }

  return { ok: true };
}

/*
  Возврат квоты, когда обработка не состоялась. Без него неудачная попытка съедает у
  пользователя оплаченные минуты, а это самая обидная из возможных претензий.
*/
export async function vernutKvotu(
  tx: Tx,
  userId: string,
  kind: QuotaKind,
  skolko: number,
): Promise<void> {
  const pole = POLE[kind];
  if (!pole) return;

  await tx.subscription.updateMany({
    where: { userId },
    data: { [pole]: { increment: skolko } },
  });
}

/*
  Запись факта расхода. Тот же журнал служит двум целям сразу: показывает пользователю, куда
  ушла квота, и копит нашу себестоимость по поставщикам. Вторая половина нужна, чтобы видеть
  просадку маржи до счёта, а не после.
*/
export async function zapisatRashod(
  tx: Tx,
  userId: string,
  kind: QuotaKind,
  skolko: number,
  costRub: number,
  vendor: string,
  jobId?: string,
): Promise<void> {
  await tx.quotaEntry.create({
    data: { userId, kind, amount: skolko, costRub, vendor, jobId },
  });
}

async function potracheno(tx: Tx, userId: string, chasov: number): Promise<number> {
  const s = new Date(Date.now() - chasov * 3600_000);

  const itog = await tx.quotaEntry.aggregate({
    where: { userId, createdAt: { gte: s } },
    _sum: { costRub: true },
  });

  return Number(itog._sum.costRub ?? 0);
}
