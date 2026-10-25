import { execFile } from "node:child_process";
import { promisify } from "node:util";

const zapustit = promisify(execFile);

/*
  Работа с записью до распознавания.

  Длительность считается здесь и только здесь, и считается ДО постановки задачи в очередь.
  Это правило из модели угроз: объём работы задаёт пользователь, а платит владелец, поэтому
  списывать квоту после обработки поздно.

  Доверять заявленной длительности из формы нельзя вовсе: её присылает клиент.
*/

const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

// Полтора часа это обычная пара, три часа бывает у сдвоенных. Дальше почти наверняка ошибка
// или намеренная нагрузка, и такой файл лучше отклонить на входе, чем считать за него деньги.
export const PREDEL_SEKUND = 4 * 3600;

export async function dlitelnostSekund(put: string): Promise<number> {
  const { stdout } = await zapustit(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    put,
  ]);

  const sek = Number.parseFloat(stdout.trim());

  if (!Number.isFinite(sek) || sek <= 0) {
    throw new Error("не удалось определить длительность записи");
  }

  if (sek > PREDEL_SEKUND) {
    throw new Error(
      `запись длиннее ${PREDEL_SEKUND / 3600} часов, это почти наверняка ошибка`,
    );
  }

  return sek;
}

/** Минуты для списания квоты. Округление вверх: полминуты это тоже минута работы. */
export function minutyKvoty(sekund: number): number {
  return Math.ceil(sekund / 60);
}

/*
  Приведение к тому, что ест распознаватель: 16 кГц, моно, 16 бит.

  Никакого выравнивания громкости здесь нет намеренно. Тихую запись выправляет сам
  распознаватель, по перцентилю и уже после того, как посчитает уровень; автоматическая
  регулировка усиления на этом шаге портит паузы, а по паузам режется речь.

  Высокочастотный срез на 80 Гц убирает гул зала и стук по парте, которые в речь не входят,
  но уровень задирают.
*/
export async function privesti(vhod: string, vyhod: string): Promise<void> {
  await zapustit(FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    vhod,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-af",
    "highpass=f=80",
    "-c:a",
    "pcm_s16le",
    vyhod,
  ]);
}
