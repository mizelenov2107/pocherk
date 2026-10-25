# Дизайн-код «Абажур»

Направление выбрано из трёх: полотно текста под одной тёплой лампой, без карточек, иерархию держат кегль, воздух и тонкие линии. Главный экран продукта это чтение длинной связной заметки, и только это направление построено вокруг полотна.

Шрифты, кириллица проверена по блокам подмножеств в CSS API Google Fonts, а не по описанию на странице: **Literata** (заголовки), **Golos Text** (текст), **PT Mono** (формулы), **Caveat** (единственный рукописный акцент, пометка на полях). Иконки Phosphor Regular.

Основной кегль 17/30, полотно 704 px, 68–74 знака в строке. Ни одного чистого белого в основном потоке и ни одного нейтрально-серого: вся лестница на hue 32–38°.

### CSS-переменные

```css
:root {
  /* поверхности */
  --bg: #FAF6EF;
  --surface: #FFFCF6;
  --surface-raised: #FFFFFF;
  --border: #E7DCCB;
  --border-strong: #D3C4AD;

  /* текст */
  --text: #2B2621;
  --text-secondary: #5B5147;
  --text-muted: #8B8074;

  /* акцент */
  --accent: #B4762B;
  --accent-hover: #96601F;
  --accent-bg: #F6E8D2;

  /* статусы */
  --success: #4E7A45;
  --warning: #A8770F;
  --error: #A63A2C;

  /* источники материала */
  --src-audio: #9E4A38;
  --src-hand: #6C7A45;
  --src-slide: #2F6F80;
  --src-book: #7C4F73;

  /* форма */
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 999px;

  --shadow-1: 0 1px 2px rgba(58, 42, 24, 0.05);
  --shadow-2: 0 2px 6px rgba(58, 42, 24, 0.06), 0 1px 2px rgba(58, 42, 24, 0.04);
  --shadow-3: 0 8px 24px rgba(58, 42, 24, 0.08);
  --shadow-lamp: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 12px 40px rgba(180, 118, 43, 0.10);

  /* ритм */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px; --sp-9: 96px;

  --row-h: 52px;
  --btn-h: 44px;
  --input-h: 48px;

  --grain-opacity: 0.035;
  --grain-blend: soft-light;
  --lamp: radial-gradient(900px 600px at 12% 0%, rgba(180, 118, 43, 0.07), transparent 70%);

  --font-head: 'Literata', Georgia, serif;
  --font-body: 'Golos Text', system-ui, sans-serif;
  --font-mono: 'PT Mono', ui-monospace, monospace;
  --font-hand: 'Caveat', cursive;
}

:root[data-theme='dark'] {
  --bg: #16130F;
  --surface: #1D1915;
  --surface-raised: #251F1A;
  --border: #382F26;
  --border-strong: #4B4034;

  --text: #EFE7D9;
  --text-secondary: #BBAE9C;
  --text-muted: #8B7F6F;

  --accent: #E0A45C;
  --accent-hover: #F0BA79;
  --accent-bg: #3B2C19;

  --success: #7FB36A;
  --warning: #DCAE4E;
  --error: #E0785F;

  --src-audio: #DE8267;
  --src-hand: #A3B473;
  --src-slide: #6FAFC0;
  --src-book: #C08BB4;

  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-2: 0 2px 8px rgba(0, 0, 0, 0.40);
  --shadow-3: 0 12px 32px rgba(0, 0, 0, 0.50);
  --shadow-lamp: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 44px rgba(224, 164, 92, 0.14);

  --grain-opacity: 0.055;
  --lamp: radial-gradient(900px 600px at 12% 0%, rgba(224, 164, 92, 0.10), transparent 70%);
}
```

---

