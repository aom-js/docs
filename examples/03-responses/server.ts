import "reflect-metadata";
import { Server } from "@aom-js/api";

import { i18nizer } from "./i18n";
import { router } from "./router";

const { API_HOST = "http://localhost:3000", API_PORT = "3000" } = process.env;

// третий аргумент — локализатор: без него клиент получает коды сообщений, а не тексты
export default new Server({ url: API_HOST, port: +API_PORT, name: "LIBRARY" }, router, i18nizer);
