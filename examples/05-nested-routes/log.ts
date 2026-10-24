import { Logger } from "@aom-js/api";

/** Снимок записи: объект `Logger` один на запрос и меняется после записи, а в его поле `route` — весь маршрут. */
export const entry = ({ route, status, duration }: Logger) => ({
  method: route.method,
  path: route.path,
  status,
  duration,
});

export const journal: (ReturnType<typeof entry> & { message: string })[] = [];

const write = (message: string, log: Logger) => journal.push({ message, ...entry(log) });

// приёмник журнала: в примере — массив, его читает тест
Logger.ENGINE = { info: write, warn: write, error: write, debug: write, log: write };
