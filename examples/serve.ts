import "reflect-metadata";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Server } from "@aom-js/api";
import type { Router } from "@aom-js/router";

/** Поднимает роутер примера на свободном порту: тест ходит в него обычным `fetch`. */
export async function serve(router: Router) {
  const server = new Server({ port: 0, url: "http://localhost" }, router);
  if (!server.server.listening) await once(server.server, "listening");
  const { port } = server.server.address() as AddressInfo;
  return { url: `http://localhost:${port}`, stop: () => server.stop() };
}
