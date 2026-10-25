import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Literata, Golos_Text, PT_Mono, Caveat } from "next/font/google";
import "./globals.css";

/*
  Кириллица у всех четырёх подтверждена по блокам подмножеств в CSS API Google Fonts, а не по
  описанию на странице шрифта. Проверять надо именно так: у Merriweather Sans на странице
  кириллица упомянута, а подмножества cyrillic нет, есть только cyrillic-ext, то есть основной
  русский алфавит не покрыт вовсе.
*/

const literata = Literata({
  variable: "--font-literata",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const ptMono = PT_Mono({
  variable: "--font-pt-mono",
  subsets: ["cyrillic", "latin"],
  weight: "400",
  display: "swap",
});

// Единственное место, где живёт рукописный: пометка на полях. Ни в заголовках, ни в кнопках.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Почерк",
  description:
    "Запись лекции, фотографии тетради, слайды и учебник превращаются в связное дерево заметок.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

/*
  Тема выставляется до первой отрисовки, иначе при системной тёмной теме страница успевает
  моргнуть светлой. Скрипт читает сохранённый выбор и ничего не делает, если выбора не было:
  дальше решает prefers-color-scheme.
*/
const temaScript = `
try {
  var t = localStorage.getItem('pocherk-tema');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Разовое число из proxy.ts: без него встроенный скрипт темы не выполнится под политикой.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="ru"
      className={`${literata.variable} ${golos.variable} ${ptMono.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: temaScript }} />
      </head>
      <body className="grain lamp flex min-h-full flex-col">{children}</body>
    </html>
  );
}
