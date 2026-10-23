---
title: "Изоляторы: вызов метода через шину (@aom-js/transfer)"
sidebar:
  order: 3
---

Рецепт о том, как метод класса вызывается как обычный статический метод, а фактически выполняется в другом процессе — через шину сообщений (Kafka, NATS, тестовая `MemoryBus`).

---

## Что происходит на самом деле

`@Isolator(transfer)` подменяет тело метода, помеченного `@ResponseTopic()`/`@CustomTopic()`: вместо исходного кода вызов публикует сообщение в топик `` `${Класс}.${метод}` `` и (для `@ResponseTopic`) ждёт ответа. Исходное тело метода **не выполняется никогда** — это чистый интерфейс, поэтому его принято оставлять пустым (`return undefined as never`). Реальный код живёт в наследнике с `@Executor()`: та же сигнатура метода, но настоящая реализация — она подписана на тот же топик и вызывается, когда сообщение приходит.

Через шину едут только сериализуемые данные: аргументы и результат проходят JSON (тестовая шина прогоняет сообщение через `JSON.parse(JSON.stringify(...))`, эмулируя реальный брокер, `packages/transfer/test/memory-bus.ts` (`MemoryBus.publisher`)). Значит, класс, функция, `Map`/`Set`, циклическая ссылка в аргументе или результате до другой стороны не доедут.

Чем это отличается от обычного вызова метода:

- между вызовом и ответом — реальная сеть: результат может не прийти вовсе (см. «Ожидание ответа»);
- брошенный `Error` не долетает как есть — до вызывающего кода доезжает восстановленный конверт (см. «Ошибки через шину»);
- одинаковые параллельные вызовы синглтон-метода могут схлопнуться в один (см. «Дедупликация»);
- вызывающий код доверяет транспорту: что бы ни пришло в сообщении, оно уйдёт в вызов метода без проверки, кто его прислал (см. «Антирецепты»).

---

## Минимальный рабочий пример

```ts
import { Transfer, Isolator, ResponseTopic, Executor } from "@aom-js/transfer";

const transfer = new Transfer({
  instanceName: "test-node",
  instanceKey: "k1",
  publisher: bus.publisher, // { topic, message } => void — отправка в шину
  subscriber: bus.subscriber, // { topic, next, queue? } => void — подписка на топик
});

// изолированный класс: интерфейс, тело не вызывается
@Isolator(transfer)
class MathService {
  @ResponseTopic()
  static async sum(a: number, b: number): Promise<number> {
    return undefined as never;
  }
}

// исполнитель: та же сигнатура, настоящий код
@Executor()
class MathExecutor extends MathService {
  static async sum(a: number, b: number) {
    return a + b;
  }
}

await MathService.sum(2, 3); // 5 — ушло в топик "MathService.sum", вернулось из "reply_MathService.sum_k1_test-node"
```

`publisher`/`subscriber` — единственное, что зависит от конкретной шины; сигнатуры — таблица «Типы» в [`@aom-js/transfer`](../packages/transfer.md#типы). Изолируются только **статические** методы: карты топиков ключуются значением функции на конструкторе (`packages/transfer/src/defines/decorators.ts` (`DefineTopics`)).

---

## Адресация: конкретный экземпляр исполнителя

По умолчанию сообщение уходит в безадресный топик `Worker.whoami`, и его получает любой подписанный исполнитель. Чтобы адресовать конкретный экземпляр:

```ts
@Isolator(transfer)
class Worker {
  @ResponseTopic()
  static async whoami(): Promise<string> {
    return undefined as never;
  }
}

@Executor("w1") // подписывается на "Worker.whoami_w1", а не на "Worker.whoami"
class WorkerOne extends Worker {
  static async whoami() {
    return "w1";
  }
}

const result = await Transfer.toInstance(Worker, "w1").whoami(); // "w1"
```

`Transfer.toInstance(Class, id)` — не аргумент вызова, а одноразовая пометка на самом классе (`AomIsolator.instance(constructor).instanceId = id`, `packages/transfer/src/defines/main.ts` (`Transfer.toInstance`)): она читается и тут же обнуляется при следующем вызове любого метода этого класса (`instanceTopic()`, `packages/transfer/src/defines/main.ts` (`AomIsolator.instanceTopic`)). Отсюда практическое правило — **вызывать метод сразу за `toInstance`, одной цепочкой**, не сохраняя промежуточный результат в переменную для вызова позже: между `toInstance(...)` и вызовом метода не должно быть `await` или другого кода, который мог бы дать управление параллельному вызову того же класса.

Адресация нужна для шардирования и явной маршрутизации к конкретному воркеру; без неё — обычная широковещательная подписка (см. «Очередь исполнителей» — для «один из многих», а не «конкретный»).

---

## Ожидание ответа: таймаут и его цена

`Transfer({ responseTimeout })` — целое `0…2 147 483 647` мс, по умолчанию `30 000`; вне диапазона (включая `NaN`/`Infinity`/дробные) конструктор бросает `RangeError`. Метод может переопределить его декоратором `@TopicTimeout(ms)` — та же проверка диапазона, приоритет над значением транспорта в обе стороны:

```ts
@Isolator(transfer)
class Orphan {
  // без @TopicTimeout — берёт responseTimeout транспорта (в тесте — 50 мс)
  @ResponseTopic()
  static async base(): Promise<void> {
    return undefined as never;
  }

  // короче общего — сработает раньше
  @TopicTimeout(15)
  @ResponseTopic()
  static async short(): Promise<number> {
    return undefined as never;
  }
}
```

Если ответ не пришёл за отведённое время, `Promise` отклоняется `TransferTimeoutError`.

**Цена `responseTimeout: 0`** (на транспорте или через `@TopicTimeout(0)` на методе): таймер вообще не создаётся. В большинстве случаев это безопасно — исполнитель всегда отвечает (даже пустым `{}`, если ничего не вернул), и именно ответ снимает и `callbackMap`, и (для синглтона) блокировку повторного вызова. По-настоящему бесконечным ожидание становится только тогда, когда ответа не будет вообще: исполнителя никто не подписал, узел умер, ответ потерялся на шине — тогда запись в `callbackMap` остаётся навсегда, снять её нечем, кроме явной отписки вызывающей стороны.

---

## Вызов без ожидания ответа: `@CustomTopic`

`@CustomTopic()` публикует сообщение и **не ждёт ответа**: `Promise` резолвится сразу же rxjs `Subscription`, а не результатом исполнителя.

```ts
@Isolator(transfer)
class Faulty {
  @CustomTopic()
  static async crash(): Promise<unknown> {
    return undefined;
  }
}

@Executor()
class FaultyExecutor extends Faulty {
  static async crash(): Promise<void> {
    throw new Error("executor crashed");
  }
}

await Faulty.crash(); // резолвится немедленно, ошибку исполнителя вернуть некому
```

Ошибку исполнителя (и таймаут ответа, если он не отключён) в этом сценарии некому вернуть — она уходит в `defaultErrorHandler` транспорта (по умолчанию `console.error("transfer error", error)`), а не в `catch` вызывающего кода.

---

## Дедупликация одинаковых вызовов (`singletone`)

`@ResponseTopic(true)`/`@CustomTopic(true)` включают режим синглтона: параллельные вызовы с одним и тем же ключом схлопываются в одну публикацию, а не порождают запрос на каждый.

Ключ дедупликации — `` `${адрес}_${sha256(JSON аргументов)}_singletone` `` (`packages/transfer/src/defines/rx-transfer.ts` (`RxTransfer.request`)), где «адрес» — топик метода **с учётом** `toInstance`. Отсюда:

```ts
// одинаковые аргументы, один и тот же адрес ("a") — одна публикация на оба вызова
await Promise.all([
  Transfer.toInstance(Shard, "a").echo(5),
  Transfer.toInstance(Shard, "a").echo(5),
]);

// одинаковые аргументы, РАЗНЫЕ адреса — НЕ склеивается, две отдельные публикации
await Promise.all([
  Transfer.toInstance(Shard, "a").echo(1),
  Transfer.toInstance(Shard, "b").echo(1),
]);
```

Схлопывание работает, только пока первый вызов ещё не завершился: как только ответ пришёл (или случился таймаут), запись в карте процессов снимается, и следующий такой же вызов запускает новый цикл запрос-ответ.

---

## Ошибки через шину

Обычный объект `Error` не переживает JSON, поэтому исполнитель отправляет вместо него конверт `{ name, message, status, data }` (для не-объектов — `{ message: String(error) }`) с заголовком `error: true` (`packages/transfer/src/defines/rx-transfer.ts` (`RxTransfer.execHandler`)). На вызывающей стороне конверт восстанавливается в `new Error(message)`, `name` переносится, `status`/`data` присваиваются как обычные поля (`packages/transfer/src/defines/rx-transfer.ts` (`callbackObserver`)).

```ts
@Executor()
class MathExecutor extends MathService {
  static async deny(): Promise<void> {
    throw Object.assign(new Error("denied"), { status: 403, data: { reason: "acl" } });
  }
}

await MathService.deny();
// rejects.toMatchObject({ message: "denied", status: 403, data: { reason: "acl" } })
```

Восстановленная ошибка — не тот же класс и не тот же `Error` (стек — с вызывающей стороны, не с исполнителя), но `message`, `name`, `status`, `data` доезжают и их можно проверять обычным `catch`.

---

## Очередь исполнителей: `@IsQueue`

Без `@IsQueue` сообщение — широковещательное: если топик слушают несколько экземпляров исполнителя (несколько реплик одного сервиса), каждый получает и обрабатывает его самостоятельно. `@IsQueue()` на методе изолятора помечает `queue: true` — это доходит до аргументов `subscriber({ topic, next, queue })`, и уже конкретный транспорт решает, что с этим делать (у реальных брокеров — группа очереди/consumer group: сообщение получает ровно один подписчик группы, а не все).

```ts
@Isolator(transfer)
class QueuedService {
  @CustomTopic()
  @IsQueue()
  static async work(): Promise<void> {
    return undefined as never;
  }
}

@Executor()
class QueuedExecutor extends QueuedService {
  static async work(): Promise<void> {
    /* ... */
  }
}
```

Нужен, когда исполнитель масштабируется горизонтально (несколько инстансов одного и того же `@Executor()`) и сообщение должно быть обработано ровно одной репликой, а не всеми сразу.

**Важно:** сам пакет `@aom-js/transfer` только передаёт флаг `queue` в `subscriber` — реальную группировку обеспечивает адаптер конкретной шины. Если адаптер параметр `queue` игнорирует (так устроена тестовая `MemoryBus`: она доставляет сообщение всем подписчикам топика независимо от `queue`), `@IsQueue` не даёт эффекта, и это не будет видно по коду изолятора — только по факту, что все реплики обработали одно и то же сообщение.

---

## Аккуратная остановка узла: `transfer.stop()`

Без него процесс, получивший SIGTERM, обрывает обработчики посреди работы: запись в базу не доходит, ответ `@ResponseTopic` теряется. `stop()` отписывает исполнителей узла (новые сообщения не приходят) и ждёт начатые обработчики вместе с отправкой их ответов. Подписки на ответы остаются, так что обработчик может дождаться другого изолятора.

Условие — `subscriber` возвращает ручку подписки (`{ unsubscribe() }`); `Subscription` NATS подходит как есть:

```ts
// псевдокод: адаптер NATS и остановка процесса
const transfer = new Transfer({
  instanceName,
  instanceKey,
  publisher: ({ topic, message }) => nats.publish(topic, JSON.stringify(message)),
  subscriber: ({ topic, next, queue }) =>
    nats.subscribe(topic, { callback: (err, msg) => next(msg.json()), queue: queue ? topic : undefined }),
});

process.on("SIGTERM", async () => {
  await transfer.stop(); // новые сообщения не берём, начатые доводим до конца
  await nats.drain(); // только после stop(): обработчикам ещё нужна шина для ответов
  process.exit(0);
});
```

Если `subscriber` ничего не возвращает, `stop()` только ждёт начатые обработчики, а новые сообщения продолжают приходить. Предела ожидания у `stop()` нет — общий таймаут остановки ставит приложение. Сообщение, отправленное в топик исполнителя этого узла во время остановки, получит только другая копия под `@IsQueue()`; без неё шина его теряет.

---

## Распределённые изоляторы и кодогенерация

`@Isolator(transfer, { distributed: true })` дополнительно собирает сериализуемый **дескриптор сервиса** (`TransferServiceDescriptor`: имя, методы с топиками/флагами, JSON Schema аргументов и ответа, свёртка схем для кодогенерации) и кладёт его в `transfer.registryMap`. Аргументы и возврат метода попадают в дескриптор только при наличии `@TopicSchema({ args, returns })` — без него в дескрипторе просто не будет поля `args` (метод «не описан», а не «аргументов нет»).

```ts
@Isolator(transfer, { distributed: true })
class DistService {
  @ResponseTopic()
  @TopicSchema({ returns: "string" })
  static async ping(): Promise<string> {
    return undefined as never;
  }
}

nodeA.registryMap.get("DistService"); // { name: "DistService", origin: {...}, methods: [...], ... }
```

Любой узел может запросить чужие дескрипторы: `transfer.collectDistributions(cb)` публикует запрос в системный топик, каждый узел отвечает своим `registryMap`, а получивший ответ узел кэширует чужие записи и сам становится их переизлучателем — контракт остаётся доступен, даже если источник, который его раздавал, погашен.

```ts
nodeB.collectDistributions(() => {}); // B опросил и закэшировал дескриптор A
bus.mute("A"); // источник погашен
nodeC.collectDistributions((data) => {
  // C получит дескриптор "CachedService" от B — с origin, указывающим на A
});
```

Из дескриптора можно построить вызывающий прокси без исходного класса — `transfer.restore(descriptor)` (рантайм), либо превратить его в закоммиченный TypeScript-исходник с исходными декораторами (`@Isolator`, `@ResponseTopic`/`@CustomTopic`, `@IsQueue`, `@TopicSchema`) через CLI пакета `@aom-js/codegen` (`aom-codegen collect|generate|check`). Полный контракт восстановления, граница безопасности («дескриптор с шины — недоверенные данные») и ограничения — [`@aom-js/codegen`](../packages/codegen.md).

---

## Антирецепты и границы доверия

### Шина считается доверенной

`execHandler` передаёт аргументы из сообщения прямо в вызов метода: `Reflect.apply(handler, undefined, value)` (`packages/transfer/src/defines/rx-transfer.ts` (`RxTransfer.execHandler`)) — без проверки, кто опубликовал сообщение, и без валидации содержимого по схеме (валидации аргументов по JSON Schema на границе исполнителя нет, см. [`@aom-js/transfer`](../packages/transfer.md) §«Инварианты и подводные камни»). Если в топик метода может писать кто угодно, кто угодно может вызвать исполнителя с произвольными аргументами. Настройкой самого пакета это не обходится — граница доверия должна ставиться на уровне транспорта (ACL шины, отдельные топики для внешних клиентов и т. п.).

### Неподписанный исполнитель + нулевой таймаут

Если у `@ResponseTopic` метода нет ни одного `@Executor` и при этом действует `responseTimeout: 0` (на транспорте или через `@TopicTimeout(0)` на методе) — вызывающий `Promise` не отклонится никогда, а запись в `callbackMap` останется в памяти навсегда (снять её может только явная отписка вызывающей стороны, которой для `@ResponseTopic` попросту нет — `await` есть, а `unsubscribe()` некому вызвать). Для `@CustomTopic` та же ситуация не блокирует вызывающий код (`Promise` и так резолвится сразу), но точно так же копит записи в `callbackMap`, если исполнителя нет и таймаут отключён.

### Ошибка в одном сообщении не должна ронять подписку целиком

Абстракция `subscriber`/`publisher` пакета ничего не знает о конкретной шине — обработку ошибок обязан взять на себя адаптер. Пример — адаптер NATS:

```ts
subscriber: ({ topic, next, queue }) => {
  nats.subscribe(topic, {
    // nats-core вызывает этот колбэк без try/catch: необработанное исключение
    // доходит до цикла чтения соединения и останавливает приём всех сообщений
    callback: (err, message) => {
      if (err) {
        console.error(`NATS subscribe error on "${topic}"`, err);
        return;
      }
      try {
        return next(message.json());
      } catch (e) {
        console.error(`NATS message handling error on "${topic}"`, e);
      }
    },
    queue: queue ? topic : undefined,
  });
},
```

Два правила, которые этот адаптер соблюдает и которые стоит повторить в любом своём:

- **проверять `err` колбэка подписки** до вызова `next` — библиотека шины может передать ошибку самого транспорта, а не сообщение;
- **оборачивать вызов `next(...)` в `try/catch`** — синхронный `throw` внутри `next` (а значит и внутри `RxTransfer.replyHandler`/`execHandler`, которые `next` в итоге вызывает) у некоторых клиентских библиотек шины (например, `@nats-io/nats-core`) долетает до внутреннего цикла чтения соединения и останавливает приём **всех** сообщений этого соединения, а не только упавшей подписки.

Частный случай, ради которого эта защита особенно нужна: сообщение без `headers` роняет и `replyHandler`, и `execHandler` на деструктуризации (`const { uniqKey, error } = headers` бросит `TypeError`, если `headers` не задан) — сам пакет `@aom-js/transfer` от этого не защищается, ожидая, что заголовки формирует его же код на другом конце. Стороннее сообщение в тот же топик или сбой сериализации на стороне чужого адаптера — не гипотетический случай, а ровно то, от чего спасает `try/catch` выше.

---

## Ссылки

- Справочник по пакету: [`@aom-js/transfer`](../packages/transfer.md)
- Контракт кодогенерации и граница безопасности дескриптора: [`@aom-js/codegen`](../packages/codegen.md)
- Тесты, исполняющие этот рецепт: `packages/transfer/test/rpc.test.ts`, `distribution.test.ts`, `topic-timeout.test.ts`, `errors.test.ts`, `cache.test.ts`, `is-queue.test.ts`
