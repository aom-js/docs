import "reflect-metadata";
import { Server } from "@aom-js/api";

import { router } from "./router";

const { API_HOST = "http://localhost:3000", API_PORT = "3000" } = process.env;

export default new Server({ url: API_HOST, port: +API_PORT, name: "GREETINGS" }, router);
