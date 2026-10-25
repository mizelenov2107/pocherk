import { PgBoss, fromPrisma } from "pg-boss";
import type { JobStage } from "@/generated/prisma/enums";

/*
  Очередь живёт в той же базе, что и данные, и это не экономия на Redis, а требование.

  Задача обязана вставать в одной транзакции с записью источника. Иначе появляются два вида
  порчи, и оба видны только пользователю: источник загружен, а задача не поставлена, и файл
  висит необработанным навсегда; либо задача поставлена, транзакция откатилась, и работник
  берёт задачу на несуществующий источник. С внешней очередью такой транзакции не бывает.
*/

function stroka(): string {
  const v = process.env.DATABASE_URL;
  if (!v) throw new Error("Не задана переменная DATABASE_URL");
  return v;
}

export const OCHERED = "obrabotka";

export type ZadanieObrabotki = {
  sourceId: string;
  stage: JobStage;
  /*
    Ссылка на задание вместо userId. К модели уходят фрагменты и изображения страниц, и
    связывать их с учёткой на той стороне незачем: контур персональных данных проходит по
    границе этой структуры.
  */
  jobRef: string;
};

let boss: PgBoss | null = null;

export async function poluchitOchered(): Promise<PgBoss> {
  if (boss) return boss;

  const b = new PgBoss({
    connectionString: stroka(),
    schema: "pgboss",
    /*
      Работник просыпается по уведомлению базы, а не ждёт опроса. Опрос при этом остаётся как
      подстраховка, поэтому потеря соединения слушателя приводит к задержке, а не к потере
      задачи.
    */
    useListenNotify: true,
  });

  b.on("error", (e: Error) => console.error("[очередь]", e));

  await b.start();
  await b.createQueue(OCHERED, { notify: true });

  boss = b;
  return b;
}

/*
  Постановка задачи внутри транзакции Prisma. Вызывается только из `db.$transaction`, куда
  передаётся тот же tx, что писал источник.
*/
export async function postavitZadanie(
  tx: { $queryRawUnsafe<T = unknown>(q: string, ...v: unknown[]): Promise<T> },
  zadanie: ZadanieObrabotki,
): Promise<string | null> {
  const b = await poluchitOchered();

  return b.send(OCHERED, zadanie, {
    db: fromPrisma(tx),
    // Повтор с растущей паузой: у поставщиков бывают короткие отказы, и ронять из-за них
    // всю лекцию незачем.
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    // Стадия распознавания часовой записи идёт минутами, но не часами. Задача, которая
    // висит дольше, считается зависшей и уходит на повтор.
    expireInSeconds: 60 * 30,
  });
}

export async function ostanovitOchered(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
}
