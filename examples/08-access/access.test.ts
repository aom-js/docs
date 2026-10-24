import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Before, Body, Bridge, Controller, Middleware, OpenApi, Post, Router } from "@aom-js/router";

import { serve } from "../serve";
import { AccessController, AccessMarker, Permissions } from "./access";
import { CurrentUser } from "./current-user";
import { Note, NoteID, Notes, NoteValue } from "./notes";
import { router } from "./router";
import { reset, roles, stats } from "./store";

const as = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

describe("08: авторизация и права", () => {
  let api: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());
  beforeEach(reset);

  const call = (method: string, path: string, token: string, body?: string) =>
    fetch(`${api.url}${path}`, { method, headers: as(token), body });

  it("GET /api/me по токену отдаёт текущего пользователя", async () => {
    const res = await call("GET", "/api/me", "token-bob");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "bob", role: "editor" });
  });

  it("без токена, с чужой схемой, с неизвестным токеном и у заблокированного — 401", async () => {
    expect((await fetch(`${api.url}/api/me`)).status).toBe(401);
    const basic = await fetch(`${api.url}/api/me`, { headers: { authorization: "Basic token-bob" } });
    expect(basic.status).toBe(401);
    const unknown = await call("GET", "/api/me", "no-such-token");
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).message).toBe("NOTES:WRONG_TOKEN");
    expect((await call("GET", "/api/me", "token-dave")).status).toBe(401);
  });

  it("маршрут без требования прав открыт любой роли", async () => {
    expect((await call("GET", "/api/notes", "token-carol")).status).toBe(200);
  });

  it("добавлять может полный доступ и роль с грантом, остальным — 403", async () => {
    const body = JSON.stringify({ text: "новая" });
    expect((await call("POST", "/api/notes", "token-alice", body)).status).toBe(200);
    const bob = await call("POST", "/api/notes", "token-bob", body);
    expect(bob.status).toBe(200);
    expect(await bob.json()).toEqual({ id: 3, text: "новая" });
    expect((await call("POST", "/api/notes", "token-carol", body)).status).toBe(403);
  });

  it("править может только роль с полным доступом", async () => {
    const body = JSON.stringify({ text: "правка" });
    const alice = await call("PATCH", "/api/notes/1", "token-alice", body);
    expect(alice.status).toBe(200);
    expect(await alice.json()).toEqual({ id: 1, text: "правка" });
    expect((await call("PATCH", "/api/notes/1", "token-bob", body)).status).toBe(403);
    expect((await call("PATCH", "/api/notes/1", "token-carol", body)).status).toBe(403);
  });

  it("при 403 тело не разбирается: битый JSON даёт 403, а не 400", async () => {
    expect((await call("POST", "/api/notes", "token-carol", "{не json")).status).toBe(403);
    // тот же запрос с правами доходит до тела и получает 400
    expect((await call("POST", "/api/notes", "token-alice", "{не json")).status).toBe(400);
  });

  it("при 403 запись не загружается: нет ни 404, ни обращения к хранилищу", async () => {
    const body = JSON.stringify({ text: "x" });
    expect((await call("PATCH", "/api/notes/999", "token-bob", body)).status).toBe(403);
    expect(stats.loads).toBe(0);
    // с правами запись ищется — и не находится
    const missing = await call("PATCH", "/api/notes/999", "token-alice", body);
    expect(missing.status).toBe(404);
    expect((await missing.json()).message).toBe("NOTES:NOTE_NOT_FOUND");
    expect(stats.loads).toBe(1);
  });

  it("корень модуля показывает требование доступа у маршрута", async () => {
    const { routes } = await (await fetch(`${api.url}/`)).json();
    const find = (method: string, path: string) =>
      routes.find((r: { method: string; path: string }) => r.method === method && r.path === path);
    expect(find("post", "/api/notes").access).toMatchObject({
      accessTypes: ["admin"],
      accessPoints: [{ ident: "Notes.Add", path: "/api/notes" }],
    });
    expect(find("get", "/api/notes").access).toBeUndefined();
    const patch = routes.find((r: { method: string }) => r.method === "patch");
    expect(patch.access.accessPoints.map((p: { ident: string }) => p.ident)).toEqual(["Notes.Card"]);
  });
});

// антипримеры со страницы: TypesRequired выше @Before — шаги маршрута встают раньше проверки прав
@Controller()
class Wrong {
  @Middleware()
  static async ReadBody(@Body() body: unknown) {}

  @Post("/")
  @AccessController.TypesRequired(Permissions.ADMIN)
  @Before(Wrong.ReadBody)
  static async Add() {}

  @Middleware()
  @AccessController.TypesRequired(Permissions.ADMIN)
  @Before(NoteValue.Init)
  @Bridge(`/${NoteID}`, Note)
  static async Card() {}
}

@Controller()
@Before(AccessController.Init, CurrentUser.Required, AccessController.Grant)
@Bridge("/wrong", Wrong)
class WrongIndex {}

// без AccessController.Init в цепочке
@Controller()
@Before(CurrentUser.Required, AccessController.Grant)
@Bridge("/notes", Notes)
class NoInit {}

const wrongDocs = () => new OpenApi({ title: "Wrong", version: "1.0.0" });

describe("08: подводные камни", () => {
  beforeEach(reset);

  it("TypesRequired выше @Before: тело читается раньше проверки, без прав приходит 400", async () => {
    const api = await serve(new Router(WrongIndex, wrongDocs()));
    const res = await fetch(`${api.url}/wrong`, { method: "POST", headers: as("token-carol"), body: "{не json" });
    await api.stop();
    expect(res.status).toBe(400);
  });

  it("TypesRequired выше @Before у моста карточки: запись грузится раньше проверки, без прав приходит 404", async () => {
    const api = await serve(new Router(WrongIndex, wrongDocs()));
    const res = await fetch(`${api.url}/wrong/999`, { method: "PATCH", headers: as("token-bob"), body: "{}" });
    await api.stop();
    expect(res.status).toBe(404);
    expect(stats.loads).toBe(1);
  });

  it("без AccessController.Init проверка пропускает всех", async () => {
    const api = await serve(new Router(NoInit, wrongDocs()));
    const body = JSON.stringify({ text: "без прав" });
    const res = await fetch(`${api.url}/notes`, { method: "POST", headers: as("token-carol"), body });
    await api.stop();
    expect(res.status).toBe(200);
  });

  it("без moduleIdent гранты ролей не берутся, работает только полный доступ", () => {
    const marker = Object.assign(new AccessMarker(), { accessTypes: [Permissions.ADMIN] });
    const check = (moduleIdent: string | undefined, role: string) => {
      const access = Object.assign(new AccessController(), { enabled: true, moduleIdent });
      access.generateAccessMap([Permissions.ADMIN], [roles[role]]);
      return access.checkAccessPoint("Notes.Add", marker);
    };
    expect(check("notes", "editor")).toBe(true);
    expect(check(undefined, "editor")).toBe(false);
    expect(check(undefined, "admin")).toBe(true);
  });
});
