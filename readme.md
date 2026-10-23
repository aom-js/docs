# aom-js/docs

Сайт документации пакетов `@aom-js/*` на [Starlight](https://starlight.astro.build): https://aom-js.github.io/docs/

Тексты — `src/content/docs/`, по странице на файл; ссылки между ними — относительные пути к `.md`, как их открывает GitHub. Пути к коду в текстах — от корня репозитория ядра [aom-js/main](https://github.com/aom-js/main). Английские страницы — `src/content/docs/en/`; страница без перевода показывается по-русски.

```bash
bun install
bun run dev     # http://localhost:4321/docs/
bun run test    # сторож ссылок: клон ядра — ../main или AOM_MAIN
bun run build   # dist/
```

Push в `main` проверяет тексты против кода ядра (ветка — переменная репозитория `MAIN_REF`) и выкладывает сайт (`.github/workflows/pages.yml`). В настройках репозитория: Pages → Source → GitHub Actions.
