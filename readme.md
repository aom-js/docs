# aom-js/docs

Сайт документации пакетов `@aom-js/*` на [Starlight](https://starlight.astro.build): https://aom.js.org/

Тексты — `src/content/docs/`, по странице на файл; ссылки между ними — относительные пути к `.md`, как их открывает GitHub. Пути к коду в текстах — от корня репозитория ядра [aom-js/main](https://github.com/aom-js/main). Английские страницы — `src/content/docs/en/`; страница без перевода показывается по-русски.

Учебник (`src/content/docs/tutorial/`) — исполняемый: код глав лежит в `examples/<глава>/` рядом с тестом, который поднимает пример на `@aom-js/*` из npm; блок кода страницы с `title="<глава>/<файл>"` обязан совпадать с файлом (`test/tutorial-code.test.ts`).

```bash
bun install
bun run dev     # http://localhost:4321/
bun run test    # сторож ссылок (клон ядра — ../main или AOM_MAIN), примеры учебника
bun run build   # dist/
```

Push в `main` проверяет тексты против кода ядра (ветка ядра по умолчанию, другая — переменная репозитория `MAIN_REF`) и выкладывает сайт (`.github/workflows/pages.yml`). В настройках репозитория: Pages → Source → GitHub Actions.
