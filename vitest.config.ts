import { defineConfig } from "vitest/config";

// клон ядра в CI лежит внутри репозитория (`.main`) — его тесты не наши
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
