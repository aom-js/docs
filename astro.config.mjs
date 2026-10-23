// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = "/docs";
const content = fileURLToPath(new URL("src/content/docs/", import.meta.url));

/**
 * Тексты ссылаются друг на друга как файлы (`../packages/router.md#якорь`) — так их читают на GitHub
 * и проверяет сторож `test/docs-links.test.ts`; на сайте такая ссылка ведёт на адрес страницы.
 */
function mdLinks() {
  /** @param {any} node @param {string} from */
  const walk = (node, from) => {
    const href = node.tagName === "a" && node.properties?.href;
    if (typeof href === "string" && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) {
      const [path, hash] = href.split("#");
      if (path.endsWith(".md")) {
        const slug = relative(content, resolve(dirname(from), path))
          .replace(/\.md$/, "")
          .replace(/(^|\/)index$/, "");
        node.properties.href = `${base}/${slug ? `${slug}/` : ""}${hash ? `#${hash}` : ""}`;
      }
    }
    node.children?.forEach((/** @type {any} */ c) => walk(c, from));
  };
  return (/** @type {any} */ tree, /** @type {any} */ file) => walk(tree, file.path);
}

export default defineConfig({
  site: "https://aom-js.github.io",
  base,
  markdown: { rehypePlugins: [mdLinks] },
  integrations: [
    starlight({
      title: "aom-js",
      logo: { src: "./src/assets/aom-logo.svg" },
      defaultLocale: "root",
      locales: {
        root: { label: "Русский", lang: "ru" },
        en: { label: "English", lang: "en" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/aom-js/main" }],
      editLink: { baseUrl: "https://github.com/aom-js/docs/edit/main/" },
      sidebar: [
        { label: "Обзор", translations: { en: "Overview" }, link: "/" },
        {
          label: "Ядро",
          translations: { en: "Core" },
          items: ["architecture", "testing", "publishing"],
        },
        {
          label: "Пакеты",
          translations: { en: "Packages" },
          items: [{ autogenerate: { directory: "packages" } }],
        },
        {
          label: "Рецепты",
          translations: { en: "Cookbook" },
          items: [{ autogenerate: { directory: "cookbook" } }],
        },
      ],
    }),
  ],
});
