/*
  Восстановление обозначений в расшифровке.

  Замер на живой лекции: распознаватель пишет одну и ту же букву то латиницей, то русским
  словом. За 81 минуту `X` встретился 61 раз буквой и 25 раз словом «икс», `y` — 2 раза
  буквой против 30 раз словом «игрек», плюс транслитерационный мусор вроде `igrek`, `Yek`,
  `ix`, `igr`. Греческих букв не было выдано ни одной за всю лекцию, они звучат словами.

  Эта работа делается кодом, а не моделью, по двум причинам. Она детерминированная, то есть
  на одном входе всегда даёт один выход и проверяется тестом. И она дешёвая: отдавать модели
  замену «икс» на `x` значит платить за словарь.

  Модели остаётся то, что кодом не решается: кванторы, формулы целиком и сверка со слайдом.

  Главная опасность здесь — переусердствовать. «А» это союз, «пи» встречается внутри слов, и
  безусловная замена испортит текст сильнее, чем исходная ошибка. Поэтому список разделён на
  два: безусловный и требующий математического окружения.
*/

/** Слова, которые в русском тексте лекции ничем, кроме обозначения, быть не могут. */
const BEZUSLOVNO: Record<string, string> = {
  икс: "x",
  игрек: "y",
  зет: "z",
  эпсилон: "ε",
  дельта: "δ",
  альфа: "α",
  бета: "β",
  гамма: "γ",
  лямбда: "λ",
  сигма: "σ",
  омега: "ω",
  тета: "θ",
  кси: "ξ",
  дзета: "ζ",
  каппа: "κ",
};

/** Мусор от распознавателя: попытка записать то же слово латиницей. */
const MUSOR: Record<string, string> = {
  igrek: "y",
  grek: "y",
  yek: "y",
  igr: "y",
  ix: "x",
  is: "x",
  pex: "x",
};

/*
  Слова, которые заменяются только рядом с математикой. «Эн» бывает буквой, «а» почти всегда
  союз, «пи» без окружения тоже подозрительно.
*/
const PRI_MATEMATIKE: Record<string, string> = {
  эн: "n",
  эм: "m",
  ка: "k",
  эф: "f",
  жэ: "g",
  пэ: "p",
  ку: "q",
  эр: "r",
  тэ: "t",
  бэ: "b",
  цэ: "c",
  пи: "π",
  мю: "μ",
  ро: "ρ",
  тау: "τ",
  фи: "φ",
  хи: "χ",
  пси: "ψ",
};

/*
  Признаки того, что рядом идёт выкладка, а не обычная речь.

  Границы слов заданы через отрицательные проверки по буквам, а не через `\b`. Это не
  придирка к стилю: `\b` в JavaScript опирается на латиницу с цифрами, кириллическая буква
  для него не словесный знак, и по русскому слову он не срабатывает вовсе. Ошибка молчаливая,
  выражение просто ничего не находит.
*/
const GRANICA = "(?<![\\p{L}\\p{N}])";
const GRANICA_KONEC = "(?![\\p{L}\\p{N}])";

const SLOVA_MATEMATIKI = [
  "равно",
  "равна",
  "равен",
  "плюс",
  "минус",
  "умножить",
  "делить",
  "степени",
  "квадрате",
  "кубе",
  "индекс",
  "функция",
  "функции",
  "функцию",
  "множество",
  "множества",
  "множеству",
  "принадлежит",
  "предел",
  "производная",
  "интеграл",
  "сумма",
  "больше",
  "меньше",
  "не",
  "любого",
  "существует",
].join("|");

const PRIZNAKI = [
  /[=<>≤≥≠+×÷^]/u,
  new RegExp(`${GRANICA}\\d+${GRANICA_KONEC}`, "u"),
  /[a-zα-ω]\s*\(/iu,
  new RegExp(`${GRANICA}(${SLOVA_MATEMATIKI})${GRANICA_KONEC}`, "iu"),
];

const OKNO = 40;

function estMatematika(tekst: string, poz: number): boolean {
  const kusok = tekst.slice(Math.max(0, poz - OKNO), poz + OKNO);
  return PRIZNAKI.some((p) => p.test(kusok));
}

export type Zamena = { bylo: string; stalo: string; poz: number };

export type ItogVypravki = {
  tekst: string;
  zameny: Zamena[];
};

/*
  Возвращает выправленный текст и список замен. Список нужен не для отладки: правка
  распознанного показывается пользователю, и он должен видеть, что именно мы поменяли за него.
*/
export function vypravitOboznacheniya(tekst: string): ItogVypravki {
  const zameny: Zamena[] = [];

  const zamenit = (
    vhod: string,
    slovar: Record<string, string>,
    tolkoPriMatematike: boolean,
  ): string => {
    const slova = Object.keys(slovar).sort((a, b) => b.length - a.length);
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])(${slova.join("|")})(?![\\p{L}\\p{N}])`,
      "giu",
    );

    return vhod.replace(re, (sovpadenie, _g, poz: number) => {
      const kluch = sovpadenie.toLowerCase();
      const stalo = slovar[kluch];
      if (!stalo) return sovpadenie;

      if (tolkoPriMatematike && !estMatematika(vhod, poz)) return sovpadenie;

      zameny.push({ bylo: sovpadenie, stalo, poz });
      return stalo;
    });
  };

  let out = zamenit(tekst, BEZUSLOVNO, false);
  out = zamenit(out, MUSOR, false);
  out = zamenit(out, PRI_MATEMATIKE, true);

  return { tekst: out, zameny };
}
