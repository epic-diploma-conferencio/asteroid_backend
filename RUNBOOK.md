# Backend New Runbook

Этот файл теперь считается основным практическим руководством по `backend_new`.
Сюда стоит дописывать:

- как запускать локально
- как запускать через Docker
- как тестировать `upload`
- какие сервисы и порты должны работать
- какие типовые ошибки уже встречались

`README` можно оставить для идей, заметок и дипломного контекста, а все актуальные инструкции лучше держать здесь.

## Сервисы

- `manager`
  Принимает файл через `/api/upload`, считает hash, сохраняет исходник в MinIO, создаёт job и маршрутизирует задачу на нужный воркер.

- `worker-js`
  Обрабатывает `.js/.jsx/.cjs/.mjs`.

- `worker-ts`
  Обрабатывает `.ts/.tsx`.

- `worker-py`
  Обрабатывает `.py`.

- `minio`
  Хранит исходники и результаты анализа.

## Порты

- `3000` -> manager
- `4001` -> worker-js
- `4002` -> worker-ts
- `4003` -> worker-py
- `9000` -> MinIO API
- `9001` -> MinIO Console

## Buckets

- `preprocessed`
- `processed-files`

Важно:

- имя bucket с `_` использовать нельзя
- `processed_files` невалиден для S3/MinIO
- актуальное имя: `processed-files`

## Локальный запуск

### 1. Установить зависимости

```powershell
cd C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new
npm install
pip install -r requirements-python.txt
```

### 2. Проверить синтаксис

```powershell
npm run check
```

### 3. Поднять MinIO

```powershell
docker compose up -d minio
```

Проверка:

```powershell
curl.exe -I http://127.0.0.1:9000/minio/health/live
```

Ожидаемо:

```text
HTTP/1.1 200 OK
```

### 4. Запустить manager

```powershell
node src/manager/app.js
```

Ожидаемый лог:

```text
Manager service listening on 3000
```

### 5. Запустить JS worker

```powershell
node src/workers/js/app.js
```

Ожидаемый лог:

```text
JS/TS worker listening on 4001
```

### 6. Запустить TypeScript worker

```powershell
node src/workers/typescript/app.js
```

Ожидаемый лог:

```text
TypeScript worker listening on 4002
```

### 7. Запустить Python worker

```powershell
python src/workers/python/app.py
```

Ожидаемый лог:

```text
Running on http://127.0.0.1:4003
```

### 8. Проверить health endpoints

```powershell
curl.exe http://127.0.0.1:3000/api/health
curl.exe http://127.0.0.1:4001/health
curl.exe http://127.0.0.1:4002/health
curl.exe http://127.0.0.1:4003/health
```

## Docker запуск

Теперь проект можно запускать полностью через `docker compose`.

### 1. Сборка и запуск

```powershell
cd C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new
docker compose up --build -d
```

### 2. Что должно подняться

```powershell
docker compose ps
```

Ожидаемо должны быть сервисы:

- `minio`
- `manager`
- `worker-js`
- `worker-ts`
- `worker-py`

### 3. Проверка health

```powershell
curl.exe http://127.0.0.1:3000/api/health
curl.exe http://127.0.0.1:4001/health
curl.exe http://127.0.0.1:4002/health
curl.exe http://127.0.0.1:4003/health
curl.exe -I http://127.0.0.1:9000/minio/health/live
```

### 4. Просмотр логов

```powershell
docker compose logs -f manager
docker compose logs -f worker-js
docker compose logs -f worker-ts
docker compose logs -f worker-py
docker compose logs -f minio
```

### 5. Остановка

```powershell
docker compose down
```

С удалением volume:

```powershell
docker compose down -v
```

## Полный тест upload

### Подготовить JS-файл

```powershell
@'
function outer(a) {
  const helper = (b) => b + 1
  return helper(a)
}

module.exports = { outer }
'@ | Set-Content -Encoding UTF8 .\sample.js
```

### Отправить JS-файл

```powershell
curl.exe -X POST -F "file=@C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new\sample.js" http://127.0.0.1:3000/api/upload
```

Ожидаемо:

- `language` = `javascript`
- `worker` = `worker-js`
- `status` = `COMPLETED`

### Подготовить TypeScript-файл

```powershell
@'
interface User {
  id: string
  name: string
}

type UserMap = Record<string, User>

enum Role {
  Admin = 'admin',
  User = 'user'
}

class UserService<T> {
  constructor(private readonly items: T[]) {}

  getAll(): T[] {
    return this.items
  }
}

export function loadUsers(source: UserMap): User[] {
  const service = new UserService(Object.values(source))
  return service.getAll()
}
'@ | Set-Content -Encoding UTF8 .\sample.ts
```

### Отправить TypeScript-файл

```powershell
curl.exe -X POST -F "file=@C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new\sample.ts" http://127.0.0.1:3000/api/upload
```

Ожидаемо:

- `language` = `typescript`
- `worker` = `worker-typescript`
- `status` = `COMPLETED`
- в `analysisSummary` будут `classes`, `interfaces`, `typeAliases`, `enums`

### Подготовить Python-файл

```powershell
@'
import json

class UserService:
    def __init__(self, users):
        self.users = users

    def all(self):
        return self.users

def load_users(raw):
    service = UserService(json.loads(raw))
    return service.all()
'@ | Set-Content -Encoding UTF8 .\sample.py
```

### Отправить Python-файл

```powershell
curl.exe -X POST -F "file=@C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new\sample.py" http://127.0.0.1:3000/api/upload
```

Ожидаемо:

- `language` = `python`
- `worker` = `worker-python`
- `status` = `COMPLETED`
- в `analysisSummary` будут `functions`, `asyncFunctions`, `classes`, `imports`, `variables`

## Единый JSON-контракт анализа

Теперь все воркеры возвращают один и тот же язык-независимый контракт внутри `payload.analysis`.

Ключевые поля:

- `schemaVersion`
- `language`
- `parser`
- `module`
- `summary`
- `entities`
- `relations`
- `diagnostics`

Смысл:

- `module` описывает сам файл как модуль
- `entities` хранит сущности файла: module, function, class, interface, type, enum, variable
- `relations` хранит связи: contains, imports, calls, module-import
- `diagnostics` хранит parse warnings/errors

Это сделано специально, чтобы фронт не зависел от языка файла.

## Просмотр общего графа

JSON граф:

```powershell
curl.exe http://127.0.0.1:3000/api/graph
```

HTML-визуализация:

```text
http://127.0.0.1:3000/graph
```

Что должно работать в HTML-визуализации:
- колесо мыши приближает и отдаляет граф
- перетаскивание пустого фона двигает всю сцену
- перетаскивание узла меняет его позицию
- клик по узлу показывает его данные справа
- клик по ребру показывает тип связи и данные этой связи
- стрелки между модулями показывают межфайловые зависимости

### Тест связи функции между TypeScript и JavaScript

Подготовить JS-файл:

```powershell
@'
export function bridgeHelper(name) {
  return name.trim().replace(/\s+/g, '-')
}

export function bridgeSuffix(value) {
  return `${value}-ts`
}
'@ | Set-Content -Path .\bridge-helper.js
```

Подготовить TS-файл:

```powershell
@'
import { bridgeHelper, bridgeSuffix } from './bridge-helper.js'

export function bridgeLabel(user: string) {
  const normalized = bridgeHelper(user)
  return bridgeSuffix(normalized)
}
'@ | Set-Content -Path .\bridge-feature.ts
```

Загрузить оба файла:

```powershell
curl.exe -X POST -F "file=@C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new\bridge-helper.js" http://127.0.0.1:3000/api/upload
curl.exe -X POST -F "file=@C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new\bridge-feature.ts" http://127.0.0.1:3000/api/upload
```

Что ожидать в `GET /api/graph`:
- `module-import` между `bridge-feature.ts` и `bridge-helper.js`
- `symbol-import` от `bridge-feature.ts` к функции `bridgeHelper`
- `symbol-import` от `bridge-feature.ts` к функции `bridgeSuffix`
- `cross-module-call` от функции `bridgeLabel` к `bridgeHelper`
- `cross-module-call` от функции `bridgeLabel` к `bridgeSuffix`

Что показывает граф:

- узлы модулей
- узлы функций и классов
- связи внутри файла
- связи между файлами по import / require / python import

Для демонстрации лучше загрузить несколько файлов, которые реально импортируют друг друга.

## Проверка jobs

Все jobs:

```powershell
curl.exe http://127.0.0.1:3000/api/jobs
```

Конкретная job:

```powershell
curl.exe http://127.0.0.1:3000/api/jobs/JOB_ID
```

Важно:

- если смотреть `/api/jobs` одновременно с `upload`, можно поймать промежуточный статус
- финальный статус смотреть лучше через `/api/jobs/{id}`

## Проверка MinIO

Открыть:

```text
http://127.0.0.1:9001
```

Логин:

```text
admin
```

Пароль:

```text
strongpassword
```

После успешной обработки:

- в `preprocessed` лежит файл вида `hash.js` или `hash.ts`
- в `processed-files` лежит файл вида `hash.json`

## Типовые ошибки

### `connect ECONNREFUSED 127.0.0.1:9000`

MinIO не поднят.

Решение:

```powershell
docker compose up -d minio
```

### `InvalidBucketNameError`

Использовано плохое имя bucket.

Решение:

- использовать `processed-files`
- не использовать `processed_files`

### `MulterError: Field name missing`

Неправильный `multipart/form-data` запрос.

Правильно:

```powershell
curl.exe -X POST -F "file=@C:\Users\ermol\OneDrive\Desktop\Диплом\backend_new\sample.js" http://127.0.0.1:3000/api/upload
```

Ключ поля должен быть именно `file`.

### `.ts` уходит в JS worker`

Обычно причина в том, что manager запущен на старом коде и не был перезапущен.

Решение:

- перезапустить `manager`
- убедиться, что `.ts/.tsx` в `file-types.js` mapped в `typescript`

## Что считать успешным состоянием

Система считается рабочей, если:

- MinIO отвечает на health-check
- manager отвечает на `/api/health`
- worker-js отвечает на `/health`
- worker-ts отвечает на `/health`
- worker-py отвечает на `/health`
- `POST /api/upload` для `.js` возвращает `COMPLETED`
- `POST /api/upload` для `.ts` возвращает `COMPLETED`
- `POST /api/upload` для `.py` возвращает `COMPLETED`
- в MinIO появляются исходники и `hash.json`
