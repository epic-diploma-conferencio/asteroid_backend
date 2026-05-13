# Правила проверок в `backend_new`: текущее состояние и развитие

## Что есть сейчас
В проекте одновременно существуют 2 уровня проверок:

1. Бизнес-валидация auth payload (регистрация/логин/токены).
2. Правила анализа кода (`startAnalysis`) — 8 правил из `src/shared/rules-catalog.js`, которые считаются на основе метрик графа.

Ниже описано, как каждое правило работает сейчас, как приходит на фронт и как лучше развивать.

## Где в коде это реализовано
- Каталог правил: `src/shared/rules-catalog.js`
- Вычисление правил: `src/manager/research-service.js` (`evaluateRule`, `startAnalysis`)
- API:
  - `GET /api/rules/avaliable`
  - `POST /api/startAnalysis`
  - `GET /api/saved/:id` / `GET /api/research/:id`
- Хранение результата: `researches.selected_rules`, `researches.graph_by_rules`, `researches.cards`
- Валидация auth: `src/manager/auth-service.js` + SQL схема `docs/auth-registration-schema.sql` и `src/shared/postgres.js`

## Поток данных для правил анализа
1. Файл загружается (`POST /api/upload`), строится граф `nodes/edges/modules`.
2. Сессия сохраняется в `research_sessions.graph_payload`.
3. Фронт отправляет `POST /api/startAnalysis` с `uploadId`, `rules`, `ruleStyle`.
4. Бэкенд считает score/status/severity по каждому выбранному правилу.
5. Бэкенд сохраняет и отдает фронту:
   - `graphByRules.groups.groupA/groupB` (детальные результаты правил)
   - `cards` (карточки для UI)
   - `selectedRules`, `ruleStyle`, `preview`.

## Формат результата правила для фронта
Каждое правило в `graphByRules.groups.groupA|groupB` содержит:
- `ruleName` — машинное имя правила.
- `ruleRussian` — название для UI.
- `group` — `group-a` или `group-b`.
- `style` — `soft|balanced|strict`.
- `score` — 0..100.
- `status` — `passed|warning|failed`.
- `severity` — `low|medium|high`.
- `metrics` — снимок граф-метрик (`moduleCount`, `importEdgeCount`, `callEdgeCount`, `density` и т.д.).

Карточки (`cards`) дополнительно дают UI-представление:
- `title`, `stat.value`, `stat.tone`, `preview`.

## Как работает каждый rule сейчас

### 1) `structure_analysis`
Как работает:
- Базируется на `moduleCount` и `totalNodes`.
- Штраф за малое количество модулей (`<3`) и маленький граф (`totalNodes < 10`).

Как отображается:
- Как score/status/severity + карточка с общим текстом статуса.

Как развивать:
- Добавить явные структурные ожидания по языку/фреймворку (например, `src`, `tests`, `config`).
- Проверять не только количество модулей, но и слои (ui/domain/infrastructure) через path-pattern.
- Отдавать фронту список конкретных нарушений (missing layer, wrong placement), а не только score.

### 2) `architecture_analysis`
Как работает:
- Использует отношение `callEdgeCount` к `moduleCount`.
- Чем больше вызовов на модуль, тем ниже score.

Как отображается:
- Обобщенный риск архитектурной связности.

Как развивать:
- Добавить матрицу разрешенных зависимостей между слоями (policy engine).
- Выделять циклы модулей и запрещенные направления вызовов.
- Возвращать массив `violations[]` с `source`, `target`, `reason`, `suggestion`.

### 3) `dependency_analysis`
Как работает:
- Использует `importEdgeCount / totalNodes`.
- Большая плотность импортов снижает score.

Как отображается:
- Как индикатор "нагруженности зависимостями".

Как развивать:
- Разделить внутренние/внешние зависимости и считать их отдельно.
- Ввести веса по критичности пакетов (prod/dev, known-risk).
- Добавить проверку "запрещенных" библиотек и версий.

### 4) `build_analysis`
Как работает:
- Штраф, если мало модулей и/или нет импортов (`importEdgeCount === 0`).
- Сейчас это эвристика, не реальная проверка сборки.

Как отображается:
- Как риск готовности к запуску/сборке.

Как развивать:
- Реально запускать `npm run build`/`tsc --noEmit`/`python -m py_compile` в sandbox worker.
- Прикладывать в результат stdout/stderr и список проблемных файлов.
- Добавить статус `not_applicable` для случаев без build-конфига.

### 5) `lint_analysis`
Как работает:
- Использует `density` графа как косвенный сигнал "шумности".
- Не запускает ESLint/Pylint фактически.

Как отображается:
- Как грубая оценка "чистоты" кода.

Как развивать:
- Подключить реальные линтеры по языку.
- Нормализовать severity (`info/warn/error`) и source-rule (`no-unused-vars` и т.д.).
- Возвращать список findings с `file`, `line`, `ruleId`, `message`.

### 6) `unused_analysis`
Как работает:
- `dangling = totalNodes - callEdgeCount - importEdgeCount`.
- Чем больше "висящих" сущностей, тем ниже score.

Как отображается:
- Как сигнал потенциально неиспользуемого кода.

Как развивать:
- Для JS/TS: `ts-prune`, eslint `no-unused-vars`; для Python: `vulture`/`ruff`.
- Отличать неиспользуемые `imports`, `locals`, `params`, `exports`.
- Добавить confidence score, чтобы фронт мог фильтровать false-positive.

### 7) `vulnerability_analysis`
Как работает:
- Сейчас только эвристика по количеству импортов vs модулей.
- Не сканирует CVE и lock-файлы.

Как отображается:
- Как "риск" без конкретных уязвимостей.

Как развивать:
- Интегрировать `npm audit`/`pip-audit`/OSV API.
- Возвращать CVE/ID, пакет, версия, fixedVersion, severity.
- Разделять code vulnerabilities и dependency vulnerabilities.

### 8) `complexity_analysis`
Как работает:
- Использует `callEdgeCount` и `density`.
- Чем выше связность/плотность, тем ниже score.

Как отображается:
- Как общая оценка сложности поддержки.

Как развивать:
- Считать цикломатическую сложность на функцию/класс.
- Добавить пороги по файлу и heatmap "сложных зон".
- Возвращать топ-N сложных сущностей с рекомендациями рефакторинга.

## Влияние `ruleStyle`
`ruleStyle` меняет строгость штрафов:
- `soft` -> множитель `1.35` (по факту штраф выше, это делает стиль строже, а не мягче).
- `balanced` -> `1`.
- `strict` -> `0.65` (по факту штраф ниже, это делает стиль мягче, а не строже).

Важно: сейчас названия `soft/strict` семантически перепутаны относительно формулы. Это стоит исправить в первую очередь.

## Дополнительные проверки auth (уже есть)
Это не rules-catalog, но это тоже активные правила в системе:

- `register`:
  - `login` нормализуется (`trim().toLowerCase()`), длина 3..32.
  - `password` длина 8..72.
  - `firstName`/`lastName` берутся из payload или fallback в `login`.
  - дубликат `login` -> `409`.
- `login`:
  - обязательны `login` и `password`.
  - неверные данные -> `401`.
- `refresh`:
  - refresh-token обязателен, проверяется JWT и наличие хеша в БД.

Как это видит фронт:
- ошибки приходят как `{ "message": "..." }` со статусами `400/401/409`.

Как развивать:
- Добавить regex для login (например, латиница/цифры/._-), иначе сейчас возможны пробелы/кириллица.
- Добавить password policy (классы символов) и единый error-code, не только message.
- Возвращать структурированные ошибки по полям: `{ code, field, message }`.

## Рекомендуемый целевой контракт (чтобы фронту было проще)
Для каждого правила вернуть:
- `summary`: score/status/severity.
- `findings[]`: конкретные нарушения.
- `metrics`: используемые числовые метрики.
- `suggestions[]`: приоритетные действия.

Пример формы findings:
```json
{
  "ruleName": "dependency_analysis",
  "status": "warning",
  "score": 62,
  "findings": [
    {
      "id": "dep-12",
      "severity": "medium",
      "file": "src/app.ts",
      "line": 14,
      "message": "Циклическая зависимость между module A и module B",
      "suggestion": "Вынести общий контракт в отдельный модуль"
    }
  ]
}
```

## Приоритетный план развития
1. Исправить семантику `ruleStyle` (`soft` должен уменьшать штраф, `strict` увеличивать).
2. Добавить `findings[]` в ответ `startAnalysis` и хранение в БД.
3. Заменить эвристики `lint/unused/build/vulnerability` на реальные инструменты в worker.
4. Ввести конфиг правил (пороги/веса) в отдельный JSON/YAML без изменения кода.
5. Добавить versioning правил (`ruleVersion`) для воспроизводимости исследований.
