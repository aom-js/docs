---
title: "Авторизация и права"
sidebar:
  order: 8
---

Как закрыть маршруты: токен в заголовке, текущий пользователь в контексте запроса, роли с правами на отдельные маршруты. К концу главы сервис отвечает 401 тому, кто не вошёл, 403 тому, у чьей роли нет права, и проверяет права раньше, чем читает тело запроса и загружает запись. Пример — каталог `examples/08-access/`, тест `examples/08-access/access.test.ts`.

## Три слоя доступа

Запрос проходит три проверки, каждая — отдельный шаг цепочки:

1. **Кто спрашивает.** Токен из заголовка `Authorization: Bearer …` превращается в пользователя. Нет токена, токен неизвестен, пользователь заблокирован — 401.
2. **Что ему можно.** По роли пользователя строится карта доступа: полный доступ или список разрешённых маршрутов.
3. **Проверка на маршруте.** Маршрут, помеченный требованием прав, сверяется с картой. Нет права — 403.

Первые два шага висят классовым `@Before` на всём поддереве `/api`, третий — на тех маршрутах, где он нужен.

## Данные

```ts title="08-access/store.ts"
import type { AomAccessToModulesStructure } from "@aom-js/api";

export type User = { name: string; role: string; enabled: boolean };

export type Note = { id: number; text: string };

// в базе это таблицы токенов и пользователей; здесь — сразу «токен → пользователь»
export const tokens = new Map<string, User>([
  ["token-alice", { name: "alice", role: "admin", enabled: true }],
  ["token-bob", { name: "bob", role: "editor", enabled: true }],
  ["token-carol", { name: "carol", role: "reader", enabled: true }],
  ["token-dave", { name: "dave", role: "admin", enabled: false }],
]);

// роль даёт либо полный доступ, либо гранты на точки доступа модуля (`Класс.метод`)
export const roles: Record<string, AomAccessToModulesStructure> = {
  admin: { fullAccess: true, modulesAccess: [] },
  editor: {
    fullAccess: false,
    modulesAccess: [{ moduleIdent: "notes", elements: [{ ident: "Notes.Add" }] }],
  },
  reader: { fullAccess: false, modulesAccess: [] },
};

export const notes = new Map<number, Note>();

/** сколько раз шаг карточки обратился к хранилищу: тест так видит, была ли загрузка */
export const stats = { loads: 0 };

export function reset() {
  notes.clear();
  notes.set(1, { id: 1, text: "первая заметка" });
  stats.loads = 0;
}

reset();
```

Пользователи, токены и роли лежат в памяти. Роль описывается структурой `AomAccessToModulesStructure` из `@aom-js/api`: `fullAccess: true` пускает везде, иначе в `modulesAccess` перечислены разрешённые точки доступа по модулям. Точка доступа (`ident`) — строка `Класс.метод` шага или обработчика, на котором стоит требование прав: `Notes.Add` — обработчик `Add` контроллера `Notes`. Роль `editor` может добавлять заметки, но не править; `reader` — только читать; `admin` — всё. У `dave` роль `admin`, но он заблокирован — признак пользователя проверяется раньше роли.

`stats.loads` считает обращения шага загрузки к хранилищу — по нему тест видит, загружалась ли запись.

## Текущий пользователь

```ts title="08-access/current-user.ts"
import { AuthHeaderToken, AuthRequiredResponse } from "@aom-js/api";
import { After, Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { tokens, type User } from "./store";

@Controller()
export class CurrentUser {
  user!: User;

  /** шаг «кто спрашивает»: токен из заголовка, затем пользователь по нему */
  @Middleware()
  @Before(AuthHeaderToken.Required)
  @After(CurrentUser.Init)
  static async Required() {}

  @Middleware()
  @Responses(AuthRequiredResponse.JSONSchema())
  static async Init(@This(AuthHeaderToken) token: AuthHeaderToken, @This() self: CurrentUser) {
    const user = tokens.get(token.value); // здесь был бы запрос к таблице токенов
    // неизвестный токен и заблокированный пользователь — один и тот же 401
    if (!user?.enabled) throw new AuthRequiredResponse("NOTES:WRONG_TOKEN");
    self.user = user;
  }
}
```

`AuthHeaderToken.Required` из `@aom-js/api` только разбирает заголовок: ищет `Bearer <значение>`, кладёт части в `type` и `value`, а при отсутствии токена или другой схеме (`Basic …`) отвечает 401. Что значит токен — решает приложение: шаг `CurrentUser.Init` берёт готовый `AuthHeaderToken` через `@This(AuthHeaderToken)` и ищет пользователя. Найденный пользователь остаётся в экземпляре `CurrentUser` до конца запроса: любой следующий шаг и сам обработчик получают его через `@This(CurrentUser)`.

`Required` — пустой шаг-обёртка: `@Before` и `@After` на нём собирают пару «разобрать токен → найти пользователя» в одно имя, которое подключают к маршрутам. Подробнее о методах — в справочнике [`@aom-js/api`](../packages/api.md#auth-middleware); там же `AuthCookieToken` (токен из cookie) и `AuthBasic` (общий логин и пароль).

Неизвестный токен и заблокированный пользователь получают один и тот же ответ: так по ответу нельзя узнать, что токен существует.

## Права

```ts title="08-access/access.ts"
import { AomAccessCore, AomAccessMarkerElement, BaseAccessController } from "@aom-js/api";
import { Controller, Middleware, This } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { CurrentUser } from "./current-user";
import { roles } from "./store";

/** типы полномочий: крупные категории маршрутов, внутри них доступ решают роли */
export enum Permissions {
  ADMIN = "admin",
}

@ComponentSchema()
export class AccessMarker extends AomAccessMarkerElement {
  @PropertySchema.Enum({ value: Permissions, isArray: true, description: "Типы полномочий" })
  accessTypes: Permissions[] = [];
}

@Controller()
export class AccessController extends BaseAccessController {
  static readonly markerName = "access";

  static readonly allowedAccessTypes = Object.values(Permissions);

  static readonly AccessMarker = AccessMarker;

  static readonly AccessCore = AomAccessCore;

  // гранты ролей берутся только для этого модуля — имя то же, что `ident` корня
  moduleIdent = "notes";

  /** карта доступа текущего пользователя: его роль и действующие типы полномочий */
  @Middleware()
  static async Grant(@This() access: AccessController, @This(CurrentUser) { user }: CurrentUser) {
    access.generateAccessMap(AccessController.allowedAccessTypes, [roles[user.role]]);
  }
}
```

`BaseAccessController` из `@aom-js/api` — механизм проверки прав по маркерам маршрутов. Наследник задаёт четыре статических поля:

- `markerName` — ключ, под которым требование доступа хранится в маркерах маршрута;
- `allowedAccessTypes` — типы полномочий приложения. Тип — крупная категория маршрутов («администрирование», «модерация»); маршрут требует один или несколько типов, а роль даёт доступ внутри них. Здесь тип один;
- `AccessMarker` — схема маркера: наследник `AomAccessMarkerElement`, в котором поле типов описано перечислением приложения, — так оно попадает в схему ответа корня;
- `AccessCore` — класс метаданных доступа; хватает базового `AomAccessCore`.

Шаги в цепочке:

- `AccessController.Init` (из базового класса) включает проверку для запроса. Пока он не отработал, проверка пропускает всех — так одни и те же контроллеры можно подключить и в модуль без прав;
- `AccessController.Grant` строит карту доступа: `generateAccessMap(типы, роли)` отмечает действующие типы и сливает гранты ролей. Гранты берутся только для модуля `moduleIdent` — без него действует лишь `fullAccess`.

Механизм целиком, включая дополнительные слои доступа (`SetExtraAccess`/`ExtraAccess`), — в справочнике [`@aom-js/api`](../packages/api.md#baseaccesscontroller).

## Маршруты с требованием прав

```ts title="08-access/notes.ts"
import { BodyBuilder, NotFoundResponse, NumberIDParam } from "@aom-js/api";
import { Before, Bridge, Controller, Get, Middleware, Patch, Post } from "@aom-js/router";
import { Responses, This, Title } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { AccessController, Permissions } from "./access";
import { notes, stats, type Note } from "./store";

@Controller()
export class NoteID extends NumberIDParam("noteId") {}

@ComponentSchema()
class NoteDTO {
  @PropertySchema.String({ description: "Текст заметки" })
  text!: string;
}

@Controller()
class NoteBody extends BodyBuilder(NoteDTO) {}

/** Заметка из адреса: её видят все шаги карточки через `@This(NoteValue)`. */
@Controller()
export class NoteValue {
  value!: Note;

  @Middleware()
  @Before(NoteID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: NoteValue, @This(NoteID) { value }: NoteID) {
    stats.loads++;
    const note = notes.get(Number(value)); // здесь был бы запрос к базе
    if (!note) throw new NotFoundResponse("NOTES:NOTE_NOT_FOUND");
    self.value = note;
  }
}

@Controller()
export class Note {
  @Patch("/")
  @Title("Изменить заметку")
  @Before(NoteBody.Body)
  static async Patch(@This(NoteValue) { value }: NoteValue, @This(NoteBody) { body }: NoteBody) {
    return Object.assign(value, body);
  }
}

@Controller()
export class Notes {
  @Get("/")
  @Title("Список заметок")
  static async Index() {
    return [...notes.values()];
  }

  @Post("/")
  @Title("Добавить заметку")
  @Before(NoteBody.Body)
  @AccessController.TypesRequired(Permissions.ADMIN)
  static async Add(@This(NoteBody) { body }: NoteBody) {
    const note = { id: notes.size + 1, ...body };
    notes.set(note.id, note);
    return note;
  }

  /** мост карточки: TypesRequired ниже @Before — декораторы применяются снизу вверх, права проверяются раньше загрузки */
  @Middleware()
  @Title("Карточка заметки")
  @Before(NoteValue.Init)
  @AccessController.TypesRequired(Permissions.ADMIN)
  @Bridge(`/${NoteID}`, Note)
  static async Card() {}
}
```

`@AccessController.TypesRequired(Permissions.ADMIN)` делает две вещи: помечает шаг или обработчик требуемым типом полномочий и вешает на него `@Before(AccessController.Required)` — сам шаг проверки. Проверка пропускает, если у пользователя действует тип маршрута и роль даёт полный доступ или грант на точку доступа (`Notes.Add`, `Notes.Card`). Иначе — 403.

`Notes.Index` без декоратора открыт всем, кто прошёл авторизацию. `Notes.Add` закрыт на самом обработчике. Карточка закрыта целиком на мосте `Notes.Card`: всё, что под `/api/notes/{noteId}`, требует права на эту точку.

Заметку из адреса находит шаг-значение `NoteValue.Init`: `NoteID.PathID` проверяет сегмент пути, шаг ищет запись и при её отсутствии отвечает 404. Он подключён `@Before` к мосту карточки, поэтому стоит раньше разбора тела в `Note.Patch`: правка несуществующей заметки с неверным телом получает 404, а не 400.

**Порядок шагов.** Декораторы применяются снизу вверх: `TypesRequired` стоит ниже `@Before(...)`, поэтому его `@Before(Required)` попадает в цепочку первым. У правки заметки цепочка выходит такой: проверка прав → `NoteValue.Init` (загрузка записи) → `NoteBody.Body` (разбор и проверка тела) → обработчик. Отказ в правах отвечает сразу:

- тело не читается — сервер разбирает его лениво, при первом обращении через `@Body` (см. [`@aom-js/api`](../packages/api.md#ленивое-тело-запроса-и-лимит-размера)), а до `NoteBody.Body` дело не доходит. Битый JSON от пользователя без прав даёт 403, а не 400;
- запись не загружается — нет запроса к базе, и нет 404, по которому посторонний узнал бы, какие записи существуют.

## Дерево маршрутов

```ts title="08-access/router.ts"
import { Before, Bridge, Controller, Get, Router, This, Title } from "@aom-js/router";

import { AccessController } from "./access";
import { CurrentUser } from "./current-user";
import { Notes } from "./notes";
import { docs, ModuleRoot } from "./root";

/** всё под `/api` — только для вошедших: классовый `@Before` наследуют все мосты */
@Controller()
@Before(AccessController.Init, CurrentUser.Required, AccessController.Grant)
@Bridge("/notes", Notes)
class Api {
  @Get("/me")
  @Title("Текущий пользователь")
  static async Me(@This(CurrentUser) { user }: CurrentUser) {
    return user;
  }
}

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Api)
class Index {}

export const router = new Router(Index, docs);
```

Класс `Api` собирает всё, что требует входа: его классовый `@Before` наследуют все мосты, поэтому и `/api/me`, и `/api/notes/...` проходят `Init → CurrentUser.Required → Grant` раньше своих шагов. Порядок внутри важен: карта доступа строится по пользователю, значит после него. Корень модуля (`/`) подключён снаружи `Api` и открыт без токена.

`GET /api/me` отдаёт текущего пользователя — первое, что обычно запрашивает клиент после входа.

## Требование доступа в списке маршрутов

```ts title="08-access/root.ts"
import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi, type MarkerType } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { AccessController, AccessMarker } from "./access";

export const docs = new OpenApi({ title: "Notes API", version: "1.0.0" });

@ComponentSchema()
class NotesRoute extends RouteElement {
  @PropertySchema.Type({ value: () => AccessMarker, isOptional: true, description: "Требования доступа" })
  access?: AccessMarker;
}

@ComponentSchema()
class NotesRoutes extends RoutesStructure<NotesRoute> {}

@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = NotesRoutes;

  readonly RouteElement = NotesRoute;

  readonly ident = "notes";

  readonly docs = docs;

  // маркер доступа маршрута — в его строку списка: клиент видит, что маршрут требует прав
  markersToRoute(route: NotesRoute, markers: MarkerType) {
    route.access = markers[AccessController.markerName];
  }
}
```

Корень модуля из [первой главы](01-first-service.md) получает поле `access`: `markersToRoute` переносит в строку списка маркер доступа маршрута. В приложении это поле добавляют в общий класс маршрута корня из [главы о структуре](02-structure.md) — один раз для всех модулей. Клиент видит, какие маршруты требуют прав, и может заранее скрыть кнопки, которые пользователю недоступны:

```json
{
  "method": "post",
  "path": "/api/notes",
  "operationId": "Notes.Add",
  "access": {
    "accessPoints": [
      { "ident": "Notes.Add", "title": "Добавить заметку", "extra": [], "method": "post", "path": "/api/notes" }
    ],
    "accessTypes": ["admin"]
  }
}
```

Маршруты без требования (`GET /api/notes`) поля `access` не несут. Значения `ident` из этого списка и записываются в гранты ролей.

## Проверка

```bash
curl http://localhost:3000/api/me                                      # 401
curl -H 'Authorization: Bearer token-bob' http://localhost:3000/api/me  # {"name":"bob","role":"editor",...}
curl -X PATCH -H 'Authorization: Bearer token-bob' -H 'Content-Type: application/json' \
  -d '{"text":"x"}' http://localhost:3000/api/notes/1                   # 403
```

Тест `examples/08-access/access.test.ts` проверяет:

- «GET /api/me по токену отдаёт текущего пользователя»;
- «без токена, с чужой схемой, с неизвестным токеном и у заблокированного — 401»;
- «маршрут без требования прав открыт любой роли»;
- «добавлять может полный доступ и роль с грантом, остальным — 403»;
- «править может только роль с полным доступом»;
- «при 403 тело не разбирается: битый JSON даёт 403, а не 400»;
- «при 403 запись не загружается: нет ни 404, ни обращения к хранилищу»;
- «корень модуля показывает требование доступа у маршрута».

Подводные камни ниже закреплены там же: «TypesRequired выше @Before: тело читается раньше проверки, без прав приходит 400», «TypesRequired выше @Before у моста карточки: запись грузится раньше проверки, без прав приходит 404», «без AccessController.Init проверка пропускает всех», «без moduleIdent гранты ролей не берутся, работает только полный доступ».

## Подводные камни

- **`TypesRequired` выше `@Before`** ставит проверку прав после шагов маршрута. Так не надо:

  ```ts
  @Post("/")
  @AccessController.TypesRequired(Permissions.ADMIN) // применится последним — встанет после NoteBody.Body
  @Before(NoteBody.Body)
  static async Add() {}
  ```

  Пользователь без прав с битым телом получает 400 вместо 403. На мосте карточки то же самое даёт 404 вместо 403: сервер успевает прочитать тело и сходить в базу ради запроса, которому всё равно откажет.
- **Без `AccessController.Init`** в цепочке проверка пропускает всех: `Required` молча разрешает, пока доступ не включён для запроса. Ставьте `Init` классовым `@Before` рядом с авторизацией.
- **Без `moduleIdent`** гранты ролей не берутся, работает только `fullAccess`: у `editor` пропал бы доступ к `Notes.Add`.
- Шаги проверки прав не должны сами читать тело: ленивый разбор помогает, только пока до решения о доступе к `@Body` никто не обращается.
- `Grant` ставьте после `CurrentUser.Required`: карта доступа строится по найденному пользователю.
- `ident` точки доступа — имя класса и метода. Гранты ролей хранятся этими строками, поэтому переименование класса или метода с требованием прав — повод обновить сохранённые роли.

Дальше — [веб-сокеты и события](09-events.md): WebSocket-точка и поток событий SSE.
