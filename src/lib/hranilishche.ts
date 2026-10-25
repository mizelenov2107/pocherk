import { mkdir } from "node:fs/promises";
import path from "node:path";

/*
  Хранилище файлов.

  На сервере это S3 Timeweb, локально папка. Разница спрятана за одним обращением, потому что
  работнику всё равно, откуда пришёл файл, а вот требование локализации первичной записи
  касается именно этого слоя: файл обязан лечь в российское хранилище до любой отправки
  куда-либо ещё.

  Ключ объекта строится по владельцу и источнику. Проверять владельца по ключу нельзя, это
  делается запросом к базе: угадать чужой ключ проще, чем кажется.
*/

const KOREN = process.env.POCHERK_STORAGE ?? path.join(process.cwd(), ".hranilishche");

export function kluchObjekta(userId: string, sourceId: string, imya: string): string {
  return `${userId}/${sourceId}/${imya}`;
}

export async function putFayla(objectKey: string): Promise<string> {
  const polnyj = path.join(KOREN, objectKey);
  await mkdir(path.dirname(polnyj), { recursive: true });
  return polnyj;
}

export function korenHranilishcha(): string {
  return KOREN;
}
