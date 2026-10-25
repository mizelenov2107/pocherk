"""Распознавание лекции: GigaAM v3 E2E RNN-T с гибридной нарезкой.

Вызывается работником как отдельный процесс:

    python3 worker/asr/raspoznat.py вход.wav выход.json

На выходе массив сегментов с таймкодами, текстом и пометкой о том, откуда сегмент взялся.
Пометка нужна приёмке: сегменты, добитые окнами, доверия чуть меньше, и это видно.

Три ловушки, каждая ломает распознавание молча, и каждая измерена на реальной записи
лекции с задней парты.

1. CoreML роняет энкодер GigaAM. Провайдер задаётся явно.

2. Запись с телефона с задней парты идёт около −46 дБ. Определитель речи на таком уровне
   находит около четырёх процентов речи вместо всей и не сообщает об этом. Поэтому уровень
   выправляется до определения речи, а не после.

3. Определитель речи теряет целые куски даже на выправленной записи: на измеренной лекции
   пропало одиннадцать минут середины, при том что речь там есть и уровень нормальный. Тот
   же движок на фиксированных окнах читает этот кусок чисто. Поэтому все дыры длиннее шести
   секунд добиваются окнами.
"""

from __future__ import annotations

import json
import sys
import time
import wave

import numpy as np
import onnx_asr

# CoreML падает на энкодере, провайдер только процессорный
PROVIDERS = ["CPUExecutionProvider"]

MODEL = "gigaam-v3-e2e-rnnt"

# Нарезка
VAD_THRESHOLD = 0.35
VAD_PAD_MS = 200
VAD_MIN_SILENCE_MS = 300
VAD_MIN_SPEECH_MS = 250
VAD_MAX_SPEECH_S = 20

# Добивание дыр
OKNO_S = 18.0
NAHLEST_S = 1.0
DYRA_S = 6.0

# Целевой уровень громких мест после выправления. Считается по перцентилю, а не по пику:
# один щелчок микрофона иначе задаёт усиление на всю запись.
CEL_P999 = 0.3
MAX_USILENIE = 40.0


def chitat_wav(put: str) -> tuple[np.ndarray, int]:
    with wave.open(put) as w:
        if w.getsampwidth() != 2:
            raise SystemExit("ожидается 16-битный WAV")
        sr = w.getframerate()
        syrye = w.readframes(w.getnframes())
    audio = np.frombuffer(syrye, dtype=np.int16).astype(np.float32) / 32768.0
    if w.getnchannels() > 1:
        audio = audio.reshape(-1, w.getnchannels()).mean(axis=1)
    return audio, sr


def vypravit_uroven(audio: np.ndarray) -> tuple[np.ndarray, float]:
    """Возвращает выправленный сигнал и применённое усиление."""
    p999 = float(np.percentile(np.abs(audio), 99.9))
    if p999 <= 1e-6:
        return audio, 1.0
    usilenie = min(CEL_P999 / p999, MAX_USILENIE)
    if usilenie <= 1.0:
        return audio, 1.0
    return np.clip(audio * usilenie, -1.0, 1.0), usilenie


def segmenty_vad(vad, audio: np.ndarray, sr: int) -> list[tuple[float, float]]:
    partiya = next(
        vad.segment_batch(
            audio[None, :],
            np.array([len(audio)]),
            sr,
            threshold=VAD_THRESHOLD,
            speech_pad_ms=VAD_PAD_MS,
            min_silence_duration_ms=VAD_MIN_SILENCE_MS,
            min_speech_duration_ms=VAD_MIN_SPEECH_MS,
            max_speech_duration_s=VAD_MAX_SPEECH_S,
        )
    )
    return [(s / sr, e / sr) for s, e in partiya]


def okna_v_dyrah(segmenty: list[tuple[float, float]], dlitelnost: float) -> list[tuple[float, float]]:
    okna: list[tuple[float, float]] = []
    tekushchiy = 0.0
    for nachalo, konec in segmenty + [(dlitelnost, dlitelnost)]:
        if nachalo - tekushchiy > DYRA_S:
            t = tekushchiy
            while t < nachalo:
                okna.append((t, min(t + OKNO_S, nachalo)))
                t += OKNO_S - NAHLEST_S
        tekushchiy = max(tekushchiy, konec)
    return okna


def naiti_zalipaniya(segmenty: list[dict]) -> list[int]:
    """Подряд идущие одинаковые реплики. Классическая порча распознавания на тишине."""
    zalipli: list[int] = []
    for i in range(1, len(segmenty)):
        tekst = segmenty[i]["text"].strip()
        if tekst and tekst == segmenty[i - 1]["text"].strip():
            zalipli.append(i)
    return zalipli


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("использование: raspoznat.py вход.wav выход.json")

    put_vhod, put_vyhod = sys.argv[1], sys.argv[2]
    t0 = time.time()

    audio, sr = chitat_wav(put_vhod)
    dlitelnost = len(audio) / sr

    audio, usilenie = vypravit_uroven(audio)
    print(f"аудио {dlitelnost:.0f}с, усиление ×{usilenie:.1f}", flush=True)

    vad = onnx_asr.load_vad("silero", providers=PROVIDERS)
    model = onnx_asr.load_model(MODEL, providers=PROVIDERS)
    print(f"[{time.time() - t0:.0f}с] модели загружены", flush=True)

    rechevye = segmenty_vad(vad, audio, sr)
    pokryto = sum(k - n for n, k in rechevye)
    print(
        f"[{time.time() - t0:.0f}с] речь: {len(rechevye)} сегм., покрыто {pokryto:.0f}с из {dlitelnost:.0f}с",
        flush=True,
    )

    dobivka = okna_v_dyrah(rechevye, dlitelnost)
    print(
        f"[{time.time() - t0:.0f}с] добивка: {len(dobivka)} окон, {sum(k - n for n, k in dobivka):.0f}с",
        flush=True,
    )

    zadaniya = [(n, k, "речь") for n, k in rechevye] + [(n, k, "добивка") for n, k in dobivka]
    zadaniya.sort()

    segmenty: list[dict] = []
    for nachalo, konec, otkuda in zadaniya:
        kusok = audio[int(nachalo * sr) : int(konec * sr)]
        if len(kusok) < sr // 4:
            continue
        tekst = model.recognize(kusok, sample_rate=sr).strip()
        if not tekst:
            continue
        segmenty.append(
            {"start": round(nachalo, 3), "end": round(konec, 3), "text": tekst, "src": otkuda}
        )

    zalipli = naiti_zalipaniya(segmenty)
    for i in zalipli:
        segmenty[i]["zalipanie"] = True

    itog = {
        "durationSec": round(dlitelnost, 3),
        "gain": round(usilenie, 3),
        "coveredSec": round(sum(s["end"] - s["start"] for s in segmenty), 3),
        "stickCount": len(zalipli),
        "segments": segmenty,
    }

    with open(put_vyhod, "w") as f:
        json.dump(itog, f, ensure_ascii=False, indent=1)

    print(
        f"[{time.time() - t0:.0f}с] сегментов {len(segmenty)}, залипаний {len(zalipli)}",
        flush=True,
    )


if __name__ == "__main__":
    main()
