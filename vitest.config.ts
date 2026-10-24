import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // примеры учебника — на legacy-декораторах с design:type: его эмитит только SWC, не oxc
  oxc: false,
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
    }),
  ],
  // клон ядра в CI лежит внутри репозитория (`.main`) — его тесты не наши
  test: { include: ["test/**/*.test.ts", "examples/**/*.test.ts"] },
});
