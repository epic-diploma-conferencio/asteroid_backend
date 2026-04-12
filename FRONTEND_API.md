# Frontend API

Основная спецификация для фронтенда лежит в [docs/swagger.yaml](c:/Users/ermol/OneDrive/Desktop/Диплом/backend_new/docs/swagger.yaml).

Коротко:

- базовый URL manager API: `http://127.0.0.1:3000/api`
- загрузка файла: `POST /upload`
- проверка job: `GET /jobs/{jobId}`
- единый граф для отрисовки: `GET /graph`

Рекомендуемый сценарий интеграции:

1. Фронт отправляет файл через `POST /upload` с полем `file`.
2. Получает `jobId`.
3. Периодически запрашивает `GET /jobs/{jobId}`.
4. Когда статус становится `COMPLETED`, фронт вызывает `GET /graph`.
5. Строит UI только по `nodes`, `edges`, `modules`.

Для просмотра Swagger можно:

1. Открыть [Swagger Editor](https://editor.swagger.io/)
2. Вставить содержимое [docs/swagger.yaml](c:/Users/ermol/OneDrive/Desktop/Диплом/backend_new/docs/swagger.yaml)

Самые важные типы связей для графа:

- `module-import`: файл зависит от файла
- `symbol-import`: файл импортирует конкретную функцию или сущность
- `cross-module-call`: функция вызывает конкретную функцию из другого файла
