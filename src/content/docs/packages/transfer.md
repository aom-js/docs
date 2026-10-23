---
title: "@aom-js/transfer"
sidebar:
  label: "@aom-js/transfer"
  order: 5
---

Пакет описывает изоляторы: класс-контракт со статическими методами-заглушками, вызов которых публикует сообщение в шину, и класс-исполнитель, который на эти сообщения подписан. Здесь же — RPC поверх абстрактного транспорта, таймаут ответа и обработчик ошибок транспорта, reply-топики, дедупликация синглтонов, сериализуемые дескрипторы сервисов и протокол их дистрибуции. Документ — единственный источник истины по механике изоляторов.
Читать до: [`@aom-js/core`](core.md) (фазы декораторов, узел, наследование), [`@aom-js/schemer`](schemer.md) (`SchemasCollector`). Читать после: [`@aom-js/codegen`](codegen.md) (потребитель дескриптора).

## Назначение и место в стеке

Пакет даёт два декоратора-роли. `@Isolator(transfer)` привязывает класс к транспорту (`Transfer`) и «закрывает» его: методы, помеченные `@ResponseTopic()`/`@CustomTopic()`, получают топик вида `` `${Class}.${method}` `` и подменённое тело — вместо исходного кода вызывается публикация сообщения в шину (`packages/transfer/src/defines/decorators.ts` (`AutoTopic`), топик — `decorators.ts` (`DefineTopics`)). `@Executor(instanceId?)` на наследнике изолятора подписывает собственные реализации статических методов на те же топики (`decorators.ts` (`Executor`)). Транспорт при этом абстрактен: `Transfer` знает только пару колбэков `publisher`/`subscriber` и идентичность узла `instanceName`/`instanceKey` (`packages/transfer/src/defines/main.ts` (`Transfer`)).

Зависимости: `@aom-js/core` — мета-класс `AomIsolator extends AomCore` и фазы исполнения декораторов; `@aom-js/schemer` — `SchemasCollector`, `Schemer`, `SCALAR_TYPE_SCHEMAS`, `AomSchemas` для схем аргументов; `rxjs` — ожидание ответа и очистка подписок; `reflect-metadata`; `node:crypto` (`randomUUID`, `createHash`) — пакет node-only. Полный граф пакетов ядра — в [Архитектура ядра](../architecture.md) §«Состав…».

Внутри ядра у пакета один потребитель — `@aom-js/codegen`: он берёт ту часть API, что отвечает за дистрибуцию, — `TransferServiceDescriptor` и `collectDistributions` (`packages/codegen/src/defines/collect.ts` (`collect`), `packages/codegen/src/defines/types.ts`).

## Публичный API

Экспортируется всё из `src/defines/index.ts` (`decorators`, `types`, `main`); `rx-transfer.ts` в барель не включён.

### Классы и транспорт

| Экспорт                                   | Сигнатура                                                                                                                                                                                                                                                                                                               | Назначение                                                                                                                                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Transfer`                                | `new Transfer(config: TransferConfig)`; поля `instanceName`, `instanceKey`, `publisher`, `subscriber`, `callbackMap`, `executorSubscriptions`, `inflight`, метод `stop()`, `registryMap`, `registryRequestTopic`, `registryResponseTopic`, `responseTimeout`, `defaultErrorHandler`                                                                                          | Конфигурация шины, таймаут ответа, обработчик ошибок и узел протокола реестра                                                                                                                                                                          |
| `Transfer.prototype.publish`              | `publish(args: TransferPublishHandlerArgs): Promise<unknown>`                                                                                                                                                                                                                                                           | Обёртка над `publisher` как `Promise`: синхронный `throw` и отклонённый `Promise` асинхронного `publisher` приходят одним отклонением                                                                                                                  |
| `Transfer.prototype.reportError`          | `reportError(error: Error): void`                                                                                                                                                                                                                                                                                       | Передаёт ошибку в `defaultErrorHandler`; сбой самого обработчика (синхронный или асинхронный) ловится и уходит в `console.error`, а не в необработанное отклонение                                                                                     |
| `TransferTimeoutError`                    | `class TransferTimeoutError extends Error` — `readonly topic`, `readonly timeout`                                                                                                                                                                                                                                       | Ответ исполнителя не пришёл за `responseTimeout`: у `@ResponseTopic` — отклонение `Promise`, у `@CustomTopic` — уходит в `defaultErrorHandler`                                                                                                         |
| `Transfer.toInstance`                     | `static toInstance<T>(constructor: T, instanceId: string): T`                                                                                                                                                                                                                                                           | Одноразово адресует следующий вызов изолятора конкретному исполнителю                                                                                                                                                                                  |
| `Transfer.instanceTopic`                  | `static instanceTopic(topic: string, instanceId?: string): string`                                                                                                                                                                                                                                                      | `topic_instanceId` либо `topic`                                                                                                                                                                                                                        |
| `Transfer.refPointerPrefix`               | `static readonly refPointerPrefix = "#/components/schemas/"`                                                                                                                                                                                                                                                            | Префикс `$ref` для схем в дескрипторе                                                                                                                                                                                                                  |
| `Transfer.prototype.restore`              | `restore<T>(descriptor: TransferServiceDescriptor, instanceId?: string): T`                                                                                                                                                                                                                                             | Вызывающий прокси из дескриптора без исходного класса; кэш по `name:hash:instanceId`                                                                                                                                                                   |
| `Transfer.prototype.collectDistributions` | `collectDistributions(cb: StructureCollectorFunction): void`                                                                                                                                                                                                                                                            | Опрос шины на дескрипторы; включает кэширование чужих дескрипторов                                                                                                                                                                                     |
| `AomIsolator`                             | `class AomIsolator extends AomCore` — `transfer`, `rx`, `singletone`, `waitForResponse`, `responseTimeout?`, `argsSchemas?`, `returnsSchema?`, `queue`, `registry`, `replySubscribers`, `topicProcessMap`, `isolatedMethods`, `topicsMap`, `instancesMap`, `instanceId?`, `topic`, `replyTopic`, `instanceTopic(topic)` | Мета-класс изолятора: узел метаданных класса и метода. `responseTimeout?` — переопределение метода из `@TopicTimeout`, `undefined` = взять `Transfer.responseTimeout` |
| `RxTransfer`                              | `new RxTransfer(transfer)`; `request(value, $)`, `initReplySubscription($)`, `replyHandler(topic)`, `execHandler(handler)`                                                                                                                                                                                              | RPC-ядро. **Не экспортируется**: `rx-transfer.ts` не входит в `defines/index.ts`, снаружи доступен только как значение `AomIsolator.rx`                                                                                                                |

### Декораторы

| Экспорт         | Сигнатура                                                                                      | Назначение                                                                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Isolator`      | `Isolator(transfer: Transfer, options?: IsolatorOptions): ClassDecorator`                      | Привязывает класс к шине и разбирает отложенные (LAST) очереди класса; `options.distributed: true` дополнительно собирает `TransferServiceDescriptor` и кладёт его в `transfer.registryMap` |
| `ResponseTopic` | `ResponseTopic(singletone?: boolean): MethodDecorator`                                         | Топик с ожиданием ответа; вызов возвращает `Promise` результата                                                                                                                                                                                                              |
| `CustomTopic`   | `CustomTopic(singletone?: boolean): MethodDecorator`                                           | Топик без ожидания ответа; вызов возвращает `Promise`, немедленно резолвящийся rxjs `Subscription` (обёртка `descriptor.value` объявлена `async`, `decorators.ts` (`AutoTopic`))                                                                                             |
| `Executor`      | `Executor(instanceId?: string): ClassDecorator`                                                | Наследник-исполнитель: подписки на топики родителя                                                                                                                                                                                                                           |
| `IsQueue`       | `IsQueue(): MethodDecorator`                                                                   | `queue: true` в аргументах `subscriber` (один исполнитель, не все)                                                                                                                                                                                                           |
| `TopicTimeout`  | `TopicTimeout(responseTimeout: number): MethodDecorator`                                       | Переопределяет для метода `responseTimeout` транспорта; `0` — без ограничения для этого метода; та же проверка диапазона, что у `Transfer({ responseTimeout })`; значение наследуется вместе с методом                                                                       |
| `TopicSchema`   | `TopicSchema(schema: { args?: TopicSchemaArg[]; returns?: TopicSchemaType }): MethodDecorator` | Схемы аргументов/ответа для дескриптора; валидация в момент декорирования                                                                                                                                                                                                    |

### Типы

| Экспорт                                                     | Сигнатура                                                                                                                                                                      | Назначение                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransferConfig`                                            | `{ instanceName; instanceKey; publisher: TransferPublishHandler; subscriber: TransferSubscribeHandler; responseTimeout?: number; defaultErrorHandler?: TransferErrorHandler }` | Аргумент конструктора `Transfer`                                                                                                                                                                                                                                                          |
| `TransferPublishHandler` / `TransferPublishHandlerArgs`     | `(args: { topic: string; message: TransferMessageSchema }) => void`                                                                                                            | Колбэк публикации; может быть асинхронным — сбой (синхронный или `Promise`-отклонение) получит вызов изолятора                                                                                                                                                                            |
| `TransferSubscribeHandler` / `TransferSubscribeHandlerArgs` | `(args: { topic: string; next: TransferNextFunction; queue?: boolean }) => TransferSubscription \| void`                                                                                               | Колбэк подписки                                                                                                                                                                                                                                                                           |
| `TransferSubscription` | `{ unsubscribe(): void }` | Ручка подписки, которую может вернуть `subscriber`; по ней `Transfer.stop` отписывает исполнителей. `Subscription` NATS подходит как есть |
| `TransferErrorHandler`                                      | `(error: Error) => void`                                                                                                                                                       | Обработчик ошибок, которые некому вернуть вызывающей стороне (см. §«Таймаут ответа и обработка ошибок»)                                                                                                                                                                                   |
| `IsolatorOptions`                                           | `{ distributed?: boolean }`                                                                                                                                                    | Опции `@Isolator`                                                                                                                                                                                                            |
| `TransferMessageSchema` / `TransferMessageHeaders`          | `{ headers: { uniqKey?; replyTopic?; error? }; value: any }`                                                                                                                   | Формат сообщения на проводе                                                                                                                                                                                                                                                               |
| `TransferNextFunction`                                      | `(message: TransferMessageSchema) => void`                                                                                                                                     | Обработчик входящего сообщения                                                                                                                                                                                                                                                            |
| `TransferCallbackHandler` / `TransferCallbackResponse`      | `(response: { topic; value?; error?; isCompleted? }) => void`                                                                                                                  | Внутренние колбэки RPC                                                                                                                                                                                                                                                                    |
| `TransferTopics`                                            | `{ topic: string; replyTopic: string }`                                                                                                                                        | Пара топиков изолированного метода                                                                                                                                                                                                                                                        |
| `InstancesData`                                             | `{ instanceName: string; instanceKey: string }`                                                                                                                                | Идентичность узла                                                                                                                                                                                                                                                                         |
| `TransferRegisty`                                           | `{ receiver: InstancesData; sender: InstancesData; schemas: any }`                                                                                                             | Сообщение реестра. Имя типа содержит опечатку и она публична                                                                                                                                                                                                                              |
| `StructureReceiveSchema` / `StructureCollectorFunction`     | `{ instance: InstancesData; value: any }`; `(data: StructureReceiveSchema) => void`                                                                                            | Данные и колбэк `collectDistributions`                                                                                                                                                                                                                                                    |
| `TransferServiceDescriptor`                                 | `{ name; origin: InstancesData; hash; methods: TransferMethodDescriptor[]; components; schemas?: FoldedSchemas }`                                                              | Сериализуемый контракт сервиса; `hash` — от `methods+components+schemas`; `schemas` — свёртка (`@aom-js/schemer` `foldSchemas`), из которой codegen восстанавливает классы; в типе необязательно: дескриптор из кэша реестра, собранный узлом старой версии пакета, может его не нести |
| `TransferMethodDescriptor`                                  | `{ name; topic; waitForResponse; singleton; queue; args?: Record<string, any>[]; returns? }`                                                                                   | Описание метода в дескрипторе                                                                                                                                                                                                                                                             |
| `TopicSchemaType` / `TopicSchemaArg`                        | `ClassConstructor \| string \| [TopicSchemaType]`; `Record<string, TopicSchemaType>`                                                                                           | Типы аргументов `@TopicSchema`                                                                                                                                                                                                                                                            |

Определения типов — `packages/transfer/src/defines/types.ts`.

## Внутренние модули

| Файл                                           | Ответственность                                                                                                                                                      | Ключевые символы                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/transfer/src/index.ts`               | Точка входа: `import "reflect-metadata"` (сайд-эффект) и реэкспорт `./defines`                                                                                       | —                                                                                                                                                                                                                                                                             |
| `packages/transfer/src/defines/index.ts`       | Барель: `export *` из `decorators`, `types`, `main`                | —                                                                                                                                                                                                                                                                             |
| `packages/transfer/src/defines/main.ts`        | Мета-класс изолятора и транспорт: конфигурация, таймаут ответа, обработчик ошибок, системные топики, реестр дескрипторов, восстановление клиента, адресация инстанса | `AomIsolator`; `TransferTimeoutError`; `Transfer`; `publish`; `reportError`; `toInstance`; `instanceTopic`; `restore`; `collectDistributions`; `requestRegistry`; `acceptRegistry`                                                                                            |
| `packages/transfer/src/defines/decorators.ts`  | Все декораторы пакета и привязка исполнителя                                                                                                                         | `Isolator`; `IsQueue`; `TopicTimeout`; `TopicSchema`; `assertTopicSchemaType`; `distribute` (внутренняя функция для `Isolator(transfer, {distributed: true})`, не экспортируется); `CustomTopic`; `ResponseTopic`; `AutoTopic`; `DefineTopics`; `Executor`; `attachIsolation` |
| `packages/transfer/src/defines/rx-transfer.ts` | RPC поверх `publisher`/`subscriber`: публикация, таймаут ответа, ожидание ответа, маршрутизация по `uniqKey`, конверт ошибок                                         | `RxTransfer`; `request`; `initReplySubscription`; `replyHandler`; `execHandler`; `callbackObserver`                                                                                                                                                                           |
| `packages/transfer/src/defines/types.ts`       | Только типы: конфигурация, формат сообщения, дескрипторы, типы `@TopicSchema`                                                                                        | `TransferConfig`; `TransferErrorHandler`; `IsolatorOptions`; `TransferMessageSchema`; `TransferServiceDescriptor`; `TopicSchemaArg`                                                                                                                                           |
| `packages/transfer/test/memory-bus.ts`         | Не тест, а образцовая тестовая шина: асинхронная доставка, JSON-прогон, лог публикаций, именованные порты и `mute`                                                   | `MemoryBus`; `port`; `mute`; `tick`                                                                                                                                                                                                                                           |
| `packages/transfer/dist/`                      | Артефакт сборки: `cjs/`, `mjs/`, `types/`; потребитель исполняет именно его                                                                                          | —                                                                                                                                                                                                                                                                             |

## Ключевые механизмы

### Конфигурация Transfer и системные подписки

Конструктор `Transfer` сохраняет колбэки и идентичность узла, проверяет и сохраняет `responseTimeout`/`defaultErrorHandler`, создаёт `callbackMap` и немедленно оформляет две подписки на системные топики `!Transfer_Registry_Request!` и `!Transfer_Registry_Notification!`. Никакой другой инициализации нет: шина должна быть готова принимать подписки к моменту создания объекта.

`packages/transfer/src/defines/main.ts` (`Transfer`)

```ts
  constructor(config: TransferConfig) {
    //
    this.publisher = config.publisher;
    this.subscriber = config.subscriber;

    this.instanceKey = config.instanceKey;
    this.instanceName = config.instanceName;

    this.responseTimeout = config.responseTimeout ?? 30_000;
    if (
      !Number.isInteger(this.responseTimeout) ||
      this.responseTimeout < 0 ||
      this.responseTimeout > 2_147_483_647
    ) {
      throw new RangeError(/* ... */);
    }
    this.defaultErrorHandler =
      config.defaultErrorHandler ?? ((error) => console.error("transfer error", error));

    this.callbackMap = new Map();

    // подписаться на топик, в ответ на который будет отправлен состав имеющихся схем
    this.subscriber({
      topic: this.registryRequestTopic,
      next: (message) => this.requestRegistry(message.value),
    });
    ...
  }
```

`responseTimeout` — целое `0…2 147 483 647` мс, по умолчанию `30 000`; `0` отключает таймаут (ждать без ограничения). Вне диапазона (включая `NaN`/`Infinity`/дробные) конструктор бросает `RangeError` — иначе `setTimeout` с некорректным значением сработал бы почти сразу (комментарий в коде: «через 1 мс — каждый вызов сразу упал бы по таймауту»), и это было бы куда труднее диагностировать. `defaultErrorHandler` по умолчанию — `(error) => console.error("transfer error", error)`; подробности, что именно в него попадает, — в §«Таймаут ответа и обработка ошибок».

Пара `instanceName`/`instanceKey` — не только адрес в протоколе реестра, но и суффикс reply-топика: `` `reply_${topic}_${transfer.instanceKey}_${transfer.instanceName}` `` (`decorators.ts` (`DefineTopics`)). Два узла с одинаковой парой будут слушать один и тот же канал ответов.

Несколько шин в одном проекте — несколько экземпляров `Transfer`: транспорт задаётся на уровне класса — `@Isolator(transfer)` пишет `$.transfer` и `$.rx` в мета-инстанс класса (`decorators.ts` (`Isolator`)), а исполнитель подписывается через транспорт своего родителя-изолятора (`decorators.ts` (`attachIsolation`)).

### Таймаут ответа и обработка ошибок

У RPC есть таймаут ответа, а у ошибки, которую некому вернуть (например, ошибки исполнителя у `@CustomTopic`), — адресат `defaultErrorHandler`.

**Таймаут.** `RxTransfer.request` заводит `setTimeout(responseTimeout)` рядом с публикацией запроса; если ответ (или ошибка) не пришёл вовремя, поток завершается `TransferTimeoutError(topic, timeout)`. У `@ResponseTopic` это отклонение возвращаемого `Promise`; у `@CustomTopic` (там `waitForResponse` не выставлен, ответ никто не ждёт явно) — ошибка уходит в `Transfer.reportError`, то есть в `defaultErrorHandler`. Таймер снимается при любом исходе — ответе, ошибке или отписке (`rx-transfer.ts` (`RxTransfer.request`)). Значение берётся так: `$.responseTimeout ?? this.transfer.responseTimeout` — сначала переопределение метода (`@TopicTimeout`, см. ниже), и только если его нет — таймаут транспорта (`rx-transfer.ts` (`RxTransfer.request`)). Таймер `unref()`-нут там, где рантайм это поддерживает (Node): он не держит процесс живым, так что короткоживущий скрипт с зависшим запросом завершится сам, не дожидаясь срабатывания таймаута (`rx-transfer.ts` (`RxTransfer.request`). При действующем `responseTimeout: 0` (на методе или транспорте) таймер вообще не создаётся — `setTimeout` не вызывается (`rx-transfer.ts` (`RxTransfer.request`)).

**`Transfer.publish`/`Transfer.reportError`.** `publish` — тонкая обёртка над `publisher`, приводящая синхронный `throw` и отклонение асинхронного `publisher` к одному и тому же отклонённому `Promise` (`main.ts` (`Transfer.publish`)). Все внутренние вызовы `publisher` в пакете (RPC-запрос, ответ исполнителя, протокол реестра) идут через неё. `reportError` вызывает `defaultErrorHandler` и подавляет его собственный сбой логированием в `console.error`, чтобы неисправный обработчик ошибок не уронил процесс (`main.ts` (`Transfer.reportError`)).

**Куда уходят ошибки, которые некому вернуть:**

- `@CustomTopic`: ошибка исполнителя, таймаут ответа, сбой публикации запроса — всё в `defaultErrorHandler` через `rx$.subscribe({ error: ... })` (`rx-transfer.ts` (`RxTransfer.request`)).
- Ответ исполнителя (`execHandler`): если сама отправка ответа (успешного или ошибки) не удалась, `defaultErrorHandler` получает ошибку сбоя отправки; если при этом исполнитель ещё и упал, исходная ошибка исполнителя кладётся в `cause` (`rx-transfer.ts` (`RxTransfer.execHandler`)).
- Протокол реестра: сбой публикации запроса (`collectDistributions`) или ответа (`requestRegistry`) — в `defaultErrorHandler` вызвавшего узла (`main.ts` (`Transfer.collectDistributions`, `Transfer.requestRegistry`)).
- Сбой `publisher` при `@ResponseTopic`/`waitForResponse` не нужен `defaultErrorHandler` отдельно — он приходит как отклонение того же `Promise`, который ждёт вызывающий код (`rx-transfer.ts` (`RxTransfer.request`)).

Синхронный `throw` неасинхронного исполнителя тоже становится ответом-ошибкой, а не необработанным исключением в `execHandler`: вызов реализации обёрнут в `Promise.resolve().then(() => Reflect.apply(handler, ...))` (`rx-transfer.ts` (`RxTransfer.execHandler`)).

**Почему `responseTimeout: 0` обычно безопасен.** Отправитель всегда кладёт `replyTopic` в заголовки запроса, а исполнитель всегда отвечает — если реализация ничего не вернула, `execHandler` шлёт вместо пустоты `{}` (`undefined` заменяется, прочие falsy-значения — нет, `rx-transfer.ts` (`RxTransfer.execHandler`), §«execHandler…» ниже). Ответ (или ошибка) завершает `Observable`, а в его teardown снимаются таймер, запись в `transfer.callbackMap` и — при `waitForResponse` — запись в `$.topicProcessMap`, то есть блокировка повторного `singletone`-вызова (`rx-transfer.ts` (`RxTransfer.request`)). Поэтому `@CustomTopic` с активным исполнителем не залипает даже при `responseTimeout: 0`, а у синглтона следующий вызов после ответа проходит штатно. Запись остаётся навсегда только там, где ответа не будет вообще — исполнителя никто не подписал, узел умер, ответ потерялся на шине, — и при этом действует `responseTimeout: 0`: без таймера снять `callbackMap`/`topicProcessMap` нечем, кроме явной отписки вызывающей стороны. Это цена выбора «ждать без ограничения».

### `@TopicTimeout`: переопределение таймаута для метода

Методный декоратор фазы FIRST (как и `@TopicSchema`), объявлен рядом с `IsQueue` в `decorators.ts` (`TopicTimeout`). Переопределяет для конкретного метода `responseTimeout`, заданный в `new Transfer({ responseTimeout })` (по умолчанию `30 000` мс): значение метода имеет приоритет, если оно задано, транспортное берётся, только если `@TopicTimeout` на методе нет (`rx-transfer.ts` (`RxTransfer.request`)). Проверка та же, что у `Transfer({ responseTimeout })`: целое `0…2 147 483 647` мс, иначе декоратор сразу бросает `RangeError` (`decorators.ts` (`TopicTimeout`)). `0` — без ограничения для этого метода, даже если у транспорта задан конечный таймаут (и наоборот: конечное значение на методе действует, даже если у транспорта `0`). Значение хранится в мета-инстансе метода (`AomIsolator.responseTimeout`) и наследуется вместе с методом, как остальные поля `AomIsolator` (`$._.inherit` переносит `responseTimeout` на наследника).

```ts
class Orphan {
  // без @TopicTimeout — берёт responseTimeout транспорта
  @ResponseTopic()
  static async base(): Promise<void> { ... }

  // короче общего — свой таймаут метода срабатывает раньше
  @TopicTimeout(15)
  @ResponseTopic()
  static async short(): Promise<number> { ... }
}
```

### Декораторы и фазы

`Isolator` — классовый декоратор фазы **INSTANT**: вызов `AomIsolator.classDecorator(handler, ExecutionPhase.INSTANT)` выполняется сразу и, в отличие от FIRST, не кладётся в `fired` — значит не участвует в переносе при наследовании (`packages/core/src/defines/callstack.ts` (`AomCallstackQueue.add`)): `@Isolator` на родителе не «протекает» на наследника через `$._.inherit`. Он пишет `$.transfer`, создаёт `$.rx = new RxTransfer(transfer)`, вызывает `$._.apply()` (прогоняет отложенные LAST-очереди класса, его статик и свойств — `packages/core/src/defines/node.ts` (`AomNode.apply`), `packages/core/src/defines/callstack.ts` (`AomCallstack.apply`)) и, если передан `options.distributed`, вызывает внутреннюю `distribute($)` — строго **после** `apply()`, поскольку список изолированных методов (`$.isolatedMethods`) заполняют именно отложенные `DefineTopics` (`decorators.ts` (`DefineTopics`)).

`ResponseTopic`/`CustomTopic` — обёртки над приватным `AutoTopic(waitForResponse, singletone)`, методным декоратором фазы FIRST. Он ставит флаги, довешивает через `Reflect.decorate` отложенный `DefineTopics()` и подменяет `descriptor.value`; исходное тело метода не сохраняется и нигде не вызывается (см. §«RxTransfer.request — RPC»).

`packages/transfer/src/defines/decorators.ts` (`AutoTopic`)

```ts
function AutoTopic(waitForResponse: boolean, singletone = false): MethodDecorator {
  return AomIsolator.methodDecorator(($, descriptor) => {
    ...
    $.singletone = singletone;
    $.waitForResponse = waitForResponse;
    // сразу добавим декоратор, который выполнится чуть позже
    Reflect.decorate([DefineTopics()], constructor, propertyKey);
    // Переопределяем оригинальный метод: тело изолятора — интерфейс и не вызывается
    descriptor.value = async (...args: any[]) => {
      const { rx } = $._.root;
      return rx.request(args, $);
    };
  }, ExecutionPhase.FIRST);
}
```

`DefineTopics` — фаза LAST: пушит мета-инстанс метода в `$._.root.isolatedMethods`, вычисляет топик вида `` `${Class}.${method}` `` и `replyTopic`, кладёт их в `topicsMap`/`instancesMap` по ключу-функции (уже подменённой `descriptor.value`) и записывает в `$.topic`/`$.replyTopic` (`decorators.ts` (`DefineTopics`)). Ключ карт — значение функции, поэтому изолируются только статические методы: у нестатических на конструкторе такого свойства нет.

Дистрибуция (`options.distributed`) — опция того же `@Isolator`, а не отдельный декоратор: разбирается синхронно внутри его INSTANT-обработчика, строго после `apply()`, поэтому от порядка записи декораторов не зависит.

### Executor и привязка исполнителя

`@Executor(instanceId?)` — тоже классовый декоратор фазы **INSTANT**: подписки создаются один раз в момент декорирования и не переносятся при наследовании, как и `@Isolator`. Он берёт мета-инстанс родителя через `Object.getPrototypeOf(constructor)` и проходит по его `isolatedMethods`. Для каждого изолированного имени проверяется, что у потомка есть **собственный** дескриптор свойства; если нет — предупреждение в консоль, метод остаётся без подписчика.

`packages/transfer/src/defines/decorators.ts` (`Executor`)

```ts
export function Executor(instanceId?: string): ClassDecorator {
  return AomIsolator.classDecorator(($) => {
    const constructor = $._.target;
    const parent$ = AomIsolator.instance(Object.getPrototypeOf(constructor));

    parent$.isolatedMethods.forEach((_$) => {
      const { property } = _$._;
      if (property) {
        if (Reflect.getOwnPropertyDescriptor(constructor, property)) {
          attachIsolation(constructor, property, instanceId);
        } else {
          console.warn(`isolated property "${<string>property}" has no executor`);
        }
      }
    });
  }, ExecutionPhase.INSTANT);
}
```

`attachIsolation` достаёт из карт родителя топик и мета-инстанс метода, формирует адресный топик `Transfer.instanceTopic(topic, instanceId)` и подписывается: `next: rx.execHandler(...)`, `queue: parentProperty$.queue`. Обработчик вызывает реализацию потомка с `this = constructor` (`decorators.ts` (`attachIsolation`)). Если топик в карте не найден — бросается `attached handler is not isolated topic ...` (`decorators.ts` (`attachIsolation`)).

У одного изолятора может быть несколько исполнителей, каждый со своим набором методов: например, `EmailExecutor` и `SmsExecutor` оба наследуют `NotificationsIsolator` и реализуют каждый свою часть его методов. Прямой вызов `MathExecutor.sum()` выполняется локально — подменено только тело метода изолятора, не потомка.

### RxTransfer.request — RPC

Сначала строится адресный топик `$._.root.instanceTopic(topic)` (с суффиксом инстанса, если он был задан через `toInstance`) — **строго до** проверки на повторный процесс: `instanceId` одноразовый и должен достаться именно этому вызову, даже если он окажется дублем синглтона. Затем генерируется `uniqKey = randomUUID()`, считается `hash = sha256(JSON.stringify(args))` и собирается ключ процесса уже из адресного топика.

`packages/transfer/src/defines/rx-transfer.ts` (`RxTransfer.request`)

```ts
    const instanceTopic = $._.root.instanceTopic(topic);

    const uniqKey = crypto.randomUUID();

    // получим hash от аргументов
    const hash = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

    // создадим ключ процесса в зависимости от того, это синглтон или нет
    // основанием являются адрес и аргументы, для которых вызывается функция
    const topicProcessKey = `${instanceTopic}_${hash}_${$.singletone ? "singletone" : uniqKey}`;
    ...
    // проверим, есть ли существующий процесс для текущего топика (актуально для синглотонов)
    const existsProcess = $.topicProcessMap.get(topicProcessKey);
    // если есть, то вернем его, не запуская процедуру повторно
    if (existsProcess) {
      return existsProcess;
    }
```

Ключ дедупликации включает адрес (`instanceTopic`), а не только топик метода и хэш аргументов: вызовы к разным исполнителям через `toInstance` с одинаковыми аргументами не схлопываются в один процесс. Адрес читается (и тем самым одноразовый `instanceId` обнуляется) на **каждом** вызове, включая дедуплицированный, поэтому он не «утекает» на следующий вызов класса. Вызовы к одному адресу с одинаковыми аргументами склеиваются в одну публикацию.

Поток строится лениво: `defer(initReplySubscription)` → `mergeMap` в `Observable`, который кладёт колбэк в `transfer.callbackMap` по `uniqKey`, публикует сообщение через `transfer.publish(...)` (сбой — синхронный или отклонённый `Promise` — уходит в `observer.error`) и заводит таймер `responseTimeout` (`observer.error(new TransferTimeoutError(...))`, если не выключен); в teardown таймер снимается и колбэк удаляется (`rx-transfer.ts` (`RxTransfer.request`)). Reply-подписка на `replyTopic` создаётся один раз на мета-инстанс метода и помечается в `$.replySubscribers` (`rx-transfer.ts` (`RxTransfer.initReplySubscription`)).

Дальше две ветки. При `waitForResponse` результат — `firstValueFrom(rx$)` с очисткой `topicProcessMap` в `then`/`catch` (`rx-transfer.ts` (`RxTransfer.request`)) — отклонение (ошибка исполнителя, сбой публикации, `TransferTimeoutError`) долетает до вызывающего `await`. Иначе — `rx$.subscribe({ error: (error) => this.transfer.reportError(error) })`, то есть rxjs `Subscription` (наружу она уходит завёрнутой в `Promise` async-обёртки, `decorators.ts` (`AutoTopic`)); исходное тело метода изолятора после ответа не вызывается.

`replyHandler` ищет колбэк по `headers.uniqKey` и передаёт ему `{error, topic}` либо `{topic, value, isCompleted: true}` (`rx-transfer.ts` (`RxTransfer.replyHandler`)); колбэк `callbackObserver` превращает это в `observer.error` либо `next` + `complete` (`rx-transfer.ts` (`callbackObserver`)).

### execHandler: конверт ошибок и falsy-результаты

Исполнитель выполняет реализацию через `Promise.resolve().then(() => Reflect.apply(handler, undefined, value))` — так синхронный `throw` неасинхронного исполнителя тоже попадает в `.catch(...)`, а не роняет обработчик необработанным исключением — и публикует результат в `replyTopic`. `undefined` подменяется на `{}` — прочие falsy-значения (`0`, `false`, `""`, `null`) уходят как есть.

`packages/transfer/src/defines/rx-transfer.ts` (`RxTransfer.execHandler`)

```ts
Promise.resolve()
  .then(() => Reflect.apply(handler, undefined, value))
  .then((result) => {
    // если указан топик для ответа, отправляем результат
    // falsy-результаты (0, false, "") легальны — подменяется только undefined
    return (
      replyTopic &&
      this.transfer.publish({
        topic: replyTopic,
        message: {
          value: result === undefined ? {} : result,
          headers: { uniqKey, replyTopic },
        },
      })
    );
  });
```

Исключение не переживает JSON, поэтому в ветке `catch` публикуется конверт `{name, message, status, data}` (для не-объектов — `{message: String(error)}`) с `headers.error = true` (`rx-transfer.ts` (`RxTransfer.execHandler`)). На вызывающей стороне `serializeError` восстанавливает `new Error(message)`, переносит `name` и присваивает `status`/`data` (`rx-transfer.ts` (`callbackObserver`)) — благодаря этому статус ответа-ошибки доезжает до вызывающего кода.

Ответ публикуется только при наличии `replyTopic` в заголовках, но заголовок ставится всегда, включая `CustomTopic`: ответ нужен, чтобы поток вызывающего завершился и подписка убралась. Если публикация самого ответа (успешного или ошибки) не удаётся, сбой уходит в `transfer.reportError`, а не теряется молча; если при этом исполнитель ещё и упал, исходная ошибка исполнителя приезжает в `cause` ошибки сбоя отправки (`rx-transfer.ts` (`RxTransfer.execHandler`)).

### Остановка узла: `Transfer.stop()`

`execHandler` кладёт цепочку «обработчик → публикация ответа» в `transfer.inflight` и убирает по завершении; цепочка не отклоняется — она заканчивается `catch` (`rx-transfer.ts` (`RxTransfer.execHandler`)). `Executor` запоминает ручку, которую вернул `subscriber` для топика исполнителя, в `transfer.executorSubscriptions` — если `subscriber` вернул объект с `unsubscribe` (`decorators.ts` (`attachIsolation`)).

`stop()` отписывает все топики исполнителей узла, затем ждёт, пока `inflight` не опустеет (`main.ts` (`Transfer.stop`)). Подписки на ответы (`reply_…`) и системные топики реестра остаются: начатый обработчик может вызвать другой изолятор и получить ответ. `stop()` не отклоняется, повторный вызов возвращает тот же `Promise`. Соединение с шиной закрывают после него (`nats.drain()`).

Границы:
- `subscriber`, который ничего не возвращает, не даёт отписать исполнителей: `stop()` только ждёт начатые обработчики, а новые сообщения продолжают приходить.
- Сообщение, опубликованное в топик исполнителя этого узла во время остановки (в том числе из его же обработчика), получат только другие подписчики топика — другая копия под `@IsQueue()`; без них шина его теряет.
- Предела ожидания у `stop()` нет: его задаёт приложение (общий таймаут остановки процесса).

### @TopicSchema

Методный декоратор фазы FIRST, описывающий сигнатуру для дескриптора. `args` — массив пар `{ имя: тип }`, ровно одна пара на элемент, имена уникальны; тип — имя скаляра из `SCALAR_TYPE_SCHEMAS` (`string`, `number`, `integer`, `boolean`, `date`, см. `packages/schemer/src/defines/collector.ts` (`SCALAR_TYPE_SCHEMAS`)), класс-компонент-схема (проверяется `AomSchemas.checkExists(type)?.isComponentSchema`) или `[T]` из одного элемента. Все проверки выполняются в момент декорирования и бросают `Error` с префиксом `@TopicSchema Class.method:` (`decorators.ts` (`TopicSchema`, `assertTopicSchemaType`)). Скаляр `"date"` в дескрипторе рендерится как `{"oneOf":[{"format":"date","type":"string"},{"format":"date-time","type":"string"}]}` — та же форма, что даёт `PropertySchema.Date`.

Три различимых состояния метода: описан (`$.argsSchemas` — массив), явно «аргументов нет» (`@TopicSchema({})` → `[]`) и «не описан» (декоратора нет → `undefined`). Это различие переносится в дескриптор: у неописанного метода поля `args` не будет вовсе.

Декоратор методный, а не пер-параметрный, сознательно — ради совместимости со stage-3 декораторами (`decorators.ts` (`TopicSchema`)).

### `@Isolator(transfer, { distributed: true })`: дескриптор сервиса

Сборкой дескриптора занимается внутренняя функция `distribute($)`, которую `@Isolator` вызывает сама — синхронно, сразу после `$._.apply()` — если передана опция `distributed: true` (`decorators.ts` (`Isolator`)). По `$.isolatedMethods` строится список `TransferMethodDescriptor` (`name`, `topic`, `waitForResponse`, `singleton`, `queue`), схемы рендерит `SchemasCollector(new Schemer(Transfer.refPointerPrefix))`: компонент-схемы становятся `$ref`, каскад связей складывается в `components`. Это тот же `SchemasCollector`, которым роутер собирает схемы OpenAPI (`packages/router/src/classes/openapi.ts`), — одни и те же `@ComponentSchema`-классы описывают и HTTP-API, и контракт на шине. Метод без `@TopicSchema` даёт `console.warn` и остаётся без поля `args`.

Поле дескриптора `schemas` — собственный формат свёртки схем для codegen (`foldSchemas` из `@aom-js/schemer`, см. [`@aom-js/schemer`](schemer.md) §«Свёртка схем для кодогенерации…»), построенный из тех же классов, что дали `components` (`collector.classes`). Ошибка `foldSchemas` (например, конфликт имени enum) оборачивается с указанием имени сервиса: `distributed service "X": foldSchemas: ...`. Без компонент `schemas` — пустой формат 1 (`{format: 1, components: {}, enums: {}}`), то есть поле есть всегда, даже у пустого сервиса. `hash` считается от `{methods, components, schemas}` — два дескриптора с одинаковым JSON Schema, но разным `enumName` (не попадающим в JSON Schema), получают разные `hash`.

`packages/transfer/src/defines/decorators.ts` (`distribute`)

```ts
let schemas: FoldedSchemas;
try {
  schemas = foldSchemas(collector.classes.values());
} catch (error) {
  throw new Error(`distributed service "${$._.target.name}": ${(error as Error).message}`, {
    cause: error,
  });
}

const { instanceName, instanceKey } = transfer;
const descriptor: TransferServiceDescriptor = {
  name: $._.target.name,
  origin: { instanceName, instanceKey },
  hash: crypto
    .createHash("sha256")
    .update(JSON.stringify({ methods, components, schemas }))
    .digest("hex"),
  methods,
  components,
  schemas,
};

transfer.registryMap.set(descriptor.name, descriptor);
```

Поля `args`/`returns` записываются только при наличии — дескриптор обязан переживать JSON без потерь. Дескриптор без `schemas` (из кэша реестра узла старой версии пакета или из старого снапшота `aom-codegen collect`) codegen не поддерживает и бросает `codegen: дескриптор до формата 1 — пересоберите collect` при наличии `components` без `schemas` (`packages/codegen/src/defines/emit-schemas.ts` (`emitSchemas`)).

### Протокол реестра и кэш LWW

`collectDistributions(cb)` фиксирует колбэк-сборщик и публикует свою идентичность в `!Transfer_Registry_Request!` через `transfer.publish(...)` — сбой публикации уходит в `defaultErrorHandler` этого же узла, а не теряется (`main.ts` (`Transfer.collectDistributions`)). На каждом чужом узле `requestRegistry` сравнивает отправителя с собой и, если это не он, публикует в `!Transfer_Registry_Notification!` значение `{receiver, sender, schemas: [...registryMap.values()]}` — массив, а не итератор; сбой этой публикации так же уходит в `defaultErrorHandler` отвечающего узла (`main.ts` (`Transfer.requestRegistry`)).

`acceptRegistry` срабатывает, только если у узла установлен `structureCollector` и `receiver` совпадает с ним. Принятые дескрипторы кэшируются: собственные записи не затираются, чужие заменяются при расхождении `hash`.

`packages/transfer/src/defines/main.ts` (`Transfer.acceptRegistry`)

```ts
if (Array.isArray(schemas)) {
  schemas.forEach((descriptor: TransferServiceDescriptor) => {
    const existing = this.registryMap.get(descriptor.name);
    // собственные дескрипторы не затираются пришедшими копиями
    const isOwn =
      existing?.origin.instanceName === instanceName &&
      existing?.origin.instanceKey === instanceKey;
    if (!isOwn && existing?.hash !== descriptor.hash) {
      this.registryMap.set(descriptor.name, descriptor);
    }
  });
}
```

Так узел, однажды опросивший реестр, становится переизлучателем: контракт остаётся доступен, пока жив хотя бы один видевший его узел. Узел, который сам никогда не звал `collectDistributions`, ничего не кэширует. Ключ `registryMap` — имя класса, замена чужой записи — по расхождению `hash`, без версий (см. §«Ограничения»).

### Transfer.restore

`restore(descriptor, instanceId?)` строит вызывающий прокси без исходного класса. Кэш — `restoredMap` по ключу `name:hash:instanceId`, поэтому повторный вызов не плодит reply-подписки (`main.ts` (`Transfer.restoredMap`)). Для каждого метода дескриптора создаётся минимальный двойник мета-инстанса: `topic` из дескриптора, `replyTopic` — от идентичности **потребителя**, пустые `replySubscribers`/`topicProcessMap` и `_.root.instanceTopic` с фиксированным `instanceId`; `client[method.name] = (...args) => rx.request(args, $)` (`main.ts` (`Transfer.restore`)). Флаги `singleton`/`waitForResponse` берутся из дескриптора, поэтому дедупликация синглтона работает как у рукописного изолятора; таймаут ответа — всегда `responseTimeout` транспорта потребителя: `@TopicTimeout` в дескриптор не попадает (`types.ts` (`TransferMethodDescriptor`)). Типизация рантаймовая: без параметра `T` возвращается `Record<string, (...args) => any>`.

### Адресация инстанса

`Transfer.instanceTopic(topic, id)` — это `[topic, id].filter(Boolean).join("_")` (`main.ts` (`Transfer.instanceTopic`)). `@Executor("w1")` подписывается на `Worker.whoami_w1` (`decorators.ts` (`attachIsolation`)). На вызывающей стороне `Transfer.toInstance(Worker, "w1")` записывает `instanceId` в классовый мета-инстанс и возвращает конструктор; при следующем `request` метод `AomIsolator.instanceTopic` подставляет и тут же обнуляет его.

`packages/transfer/src/defines/main.ts` (`AomIsolator.instanceTopic`)

```ts
  instanceTopic(topic: string) {
    const result = Transfer.instanceTopic(topic, this.instanceId);
    this.instanceId = undefined;
    return result;
  }
```

Адресация одноразовая и живёт на классе, а не на вызове — поэтому `request` читает адрес до проверки на дубль синглтона (см. §«RxTransfer.request — RPC»).

### MemoryBus как образец тестовой шины

`packages/transfer/test/memory-bus.ts` — не часть публичного API, а образец тестовой шины: на нём работают тесты пакета, его можно скопировать в тесты своего приложения. Ключевые свойства: доставка отложена в макротаск (`setTimeout`), сообщение прогоняется через `JSON.parse(JSON.stringify(message))` — несериализуемые значения теряются намеренно, как у реального брокера; лог `published` и счётчик `topicCount(topic)` позволяют проверять число публикаций; именованные порты `port(id)` и `mute(id)` моделируют падение узла; `tick(ms)` — пауза для доставки.

`packages/transfer/test/memory-bus.ts` (`MemoryBus.publisher`)

```ts
publisher = ({ topic, message }: BusMessage) => {
  this.published.push({ topic, message });
  // доставляем через JSON, как реальный брокер: несериализуемые значения теряются намеренно
  const wire = JSON.parse(JSON.stringify(message));
  setTimeout(() => {
    this.subs
      .filter((s) => s.topic === topic && !(s.port && this.muted.has(s.port)))
      .forEach((s) => s.next(wire));
  });
};
```

### Адаптер шины (пример: NATS)

Адаптер поверх NATS: `publisher` публикует `JSON.stringify(message)` через `nats.publish`, `subscriber` оформляет `nats.subscribe` с колбэком, читающим `message.json()`. Аргумент `queue`, который передаёт `attachIsolation`, адаптер превращает в queue-группу NATS (`queue: queue ? topic : undefined`); колбэк подписки проверяет `err` и оборачивает разбор сообщения и вызов `next(...)` в `try/catch`. `instanceName`/`instanceKey` должны быть заданы явно (например, из окружения) — иначе reply-топики получат вид `reply_<topic>_<key>_undefined`.

> ⚠️ Риск адаптера (не в пакете `transfer`, а в адаптере шины): `subscriber`-колбэк NATS (`@nats-io/nats-core@3.4.0`, транзитивная зависимость `@nats-io/transport-node`) вызывается без `try/catch` вокруг пользовательского `callback(err, message)` — `node_modules/@nats-io/nats-core/lib/protocol.js: processMsg` делает `sub.callback(null, msg)` напрямую из цепочки разбора входящего байтового потока (`ProtocolHandler.dial`: `for await (const b of this.transport) { this.parser.parse(b) }`). Синхронный `throw` внутри `next(...)` (а значит — и внутри `RxTransfer.replyHandler`/`execHandler`, которые `next` вызывает) вылетает из этого `for await` и ловится только внешним `console.log("reader closed", err)` — чтение соединения останавливается для **всех** топиков этого NATS-соединения, не только для упавшего. Риск снимают две проверки в самом адаптере (см. «Как обходить»). Практический триггер — сообщение без `headers` (см. ниже): `replyHandler`/`execHandler` бросят на деструктуризации `headers` прямо внутри чужого `next`.
> Как обходить: в `subscriber` адаптера оборачивать вызов `next(...)` в `try/catch` и логировать/игнорировать ошибку, не давая ей уйти в колбэк библиотеки; проверять `err` из колбэка `nats.subscribe` до вызова `next`.

## Инварианты и подводные камни

- Изолируются только **статические** методы: карты топиков ключуются значением функции на конструкторе (`decorators.ts` (`DefineTopics`)).
- Тело метода изолятора — заглушка (`return undefined as never` / `<any>void 0`); реализация живёт в наследнике с `@Executor`. Тело нигде не вызывается.
- Контекст вызова (пользователь, организация, права) исполнитель получает только из аргументов: в сообщение уходят аргументы метода и служебные заголовки, а реализация вызывается без `this`-состояния вызывающей стороны (`decorators.ts` (`AutoTopic`), `rx-transfer.ts` (`RxTransfer.execHandler`)). Всё, что нужно исполнителю для проверок, передаётся явным сериализуемым аргументом.
- Топик выводится из имени класса (`` `${Class}.${method}` ``): переименование класса меняет канал и рвёт связь с уже развёрнутыми исполнителями.
- `@Isolator` и `@Executor` — декораторы фазы INSTANT: выполняются один раз в момент декорирования и не переносятся при наследовании (`packages/core/src/defines/callstack.ts` (`AomCallstackQueue.add`)). Порядок записи декораторов для дистрибуции не важен: она — опция того же `@Isolator`, а не отдельный декоратор.
- Всё, что уходит в `publisher`, обязано быть JSON-сериализуемым: сообщение проходит через сериализацию и на проводе, и в тестовой шине.
- Пара `instanceName`+`instanceKey` должна быть уникальна на шине — иначе reply-топики двух узлов совпадут.
- `subscriber` вызывается синхронно в конструкторе `Transfer` и при декорировании `@Executor`: шина должна быть готова к подписке к моменту импорта модулей с изоляторами.
- `Executor` при отсутствии реализации метода печатает `console.warn` и продолжает — метод просто остаётся без подписчика (`decorators.ts` (`Executor`)).
- Схемы `@TopicSchema` на стороне исполнителя не проверяются: `argsSchemas`/`returnsSchema` читает только сборка дескриптора (`decorators.ts` (`distribute`)), а `execHandler` передаёт в реализацию то, что пришло по шине (`rx-transfer.ts` (`RxTransfer.execHandler`)).
- Ключ `registryMap` — имя класса: два одноимённых распределённых класса на одном транспорте перетирают друг друга (см. §«Ограничения»).
- Пакет не трогает глобальный `rxjs.config.onUnhandledError`: ошибки, которые некому вернуть, идут в `defaultErrorHandler` (по умолчанию — `console.error`).
- `responseTimeout` (по умолчанию 30 000 мс) действует на каждый вызов `@ResponseTopic`/`@CustomTopic` независимо от `singletone`; `0` отключает его полностью — использовать с осторожностью: без таймаута `Promise` вызова может висеть вечно.
- Сообщение без `headers` роняет обработку и у вызывающего, и у исполнителя (см. §«Ограничения»).
- Потребитель исполняет собранный `dist`, поэтому после правки `src` нужен `bun run build` (см. §«Сборка и потребление»).

## Ограничения

- `@CustomTopic` возвращает `Promise<Subscription>`: `await` отдаёт `Subscription` сразу и исполнителя не ждёт (`decorators.ts` (`AutoTopic`), `rx-transfer.ts` (`RxTransfer.request`)). Если нужен факт завершения — `@ResponseTopic`.
- Реестр дескрипторов ключуется именем класса, кэш чужих записей заменяется по расхождению `hash` без версий, а узел без `collectDistributions` реестр не переизлучает (`main.ts` (`Transfer.acceptRegistry`)). Одноимённые сервисы разных команд перетирают друг друга, при расходящихся версиях побеждает последний ответивший узел, пассивные узлы не помогают доступности контрактов. Как обойти: держать имена распределённых классов уникальными в пределах шины.
- Сообщение без `headers` роняет обработку и у вызывающего (`replyHandler`), и у исполнителя (`execHandler`): `const { uniqKey, error } = headers` / `const { replyTopic, uniqKey } = headers` бросают `TypeError` (`rx-transfer.ts` (`RxTransfer.replyHandler`, `RxTransfer.execHandler`)). Для реальных шин (не `MemoryBus`, который сам ставит заголовки) это возможный случай: сторонний паблишер в тот же топик, ошибка сериализации в адаптере; синхронный `throw` внутри `next(...)` может уйти в саму библиотеку транспорта (см. §«Адаптер шины (пример: NATS)»). Как обойти: адаптеру `subscriber` передавать в `next` только сообщения с `headers` (хотя бы `{}`) либо оборачивать вызов `next` в `try/catch`.

## Сборка и потребление

Сборка стандартная для пакетов ядра: `bun run build:transfer` в корне ядра (эквивалент `bun --filter @aom-js/transfer build`) прогоняет `tsc` трижды — `tsconfig.build.json` → `dist/cjs`, `tsconfig.build.mjs.json` → `dist/mjs`, `tsconfig.build.types.json` → `dist/types` — и затем `node ../../scripts/post-build.js`, который дописывает расширения относительным импортам и кладёт `dist/cjs/package.json` с `{type: "commonjs"}` (`packages/transfer/package.json`). Манифест генерируется скриптами (`package.src.json`; версия общая для всех пакетов — корневой `package.json`, [Публикация в npm](../publishing.md)), править его напрямую не следует. Потребитель через `exports` попадает в `dist/mjs`; **правки `src` не видны потребителю без `bun run build`**. Тесты монорепо, напротив, резолвят алиас `@aom-js/transfer` на `packages/transfer/src`. Полная схема сборки и dist-потребления — [Архитектура ядра](../architecture.md) §«Сборка, тесты…» и §«Как приложение потребляет ядро».

## Тесты пакета

```bash
bunx vitest run packages/transfer
```

Тесты работают на `MemoryBus` (см. §«MemoryBus как образец тестовой шины»).
