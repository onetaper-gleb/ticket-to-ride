# Техническое подключение 3D-меню

Основа: принятый сетевой commit `c295bb4c3e7b0671c073ac6f0a49b2649a37c319`. Принятая история меню `a87c96107baebbc8de180c0add107b08356b4d61` импортирована целиком merge-коммитом `0bef8a6a82770b8de55eb1630648064543652339`. Bundle содержит 150 commits, не требует prerequisites; SHA256 `f1d8515cea32c506a50ef080696643082ccafaf7ae67402813f76a08ea698db1`.

Runtime подключения: `43c38e84bd195261eaf8170f9b69345639dcc221`. Последующие изменения этого checkpoint относятся только к README и integration metadata. Все принятые `src/scene/menu/**` и `public/menu/**` совпадают с a87 байт в байт. Builders, art inventory/provenance, pose geometry, UV и материалы не редактировались. Опция хвата не передаётся: фабрика выбирает agreed; calm остаётся отдельным сравнением владельца. Новый train consumer652 не импортирован.

`MenuDiorama` в `src/scene/Diorama.tsx` создаёт отдельный renderer меню. VSM установлен до первого draw; граф — RenderPass → full-depth/half-resolution SSAO → depth X → depth Y → OutputPass → FXAA. Depth texture заимствована у AO. Composer передаёт physical размеры passes при resize/DPR; FXAA получает inverse physical resolution. DPR ограничен 2. Near/far камеры остаются .1/80. Игровая функция Diorama и PCF, физический ввод, optional intentEpoch и queued-input поведение сохранены байт в байт.

Каждый pass освобождается один раз; затем освобождаются два пропущенных в Three r180 SSAOPass ресурса, composer, composition и renderer. Контекст меню закрывается через forceContextLoss, поскольку повторно не используется и renderer.dispose не удаляет все встроенные GL caches. Abort и closed guard освобождают запоздавшую composition. Pagehide очищает сцену; persisted pageshow создаёт новую. Ошибка ассета или настоящая потеря контекста оставляет native меню и кнопку повторной загрузки.

`src/session/SessionMenu.tsx` использует принятую native печать из sealed preview, scoped CSS, настоящие кнопки и modal dialog. Настройки передают прежний GameOptions: 2–5 мест, имя, seed и сложность. Правила берутся из прежнего rulesPages; welcome — прежний TutorialWelcome. `GameSession` отдаёт presenter, когда observation отсутствует; игровой App получает прежние callbacks. Собственное необходимое изменение загрузки — отдельные current/tutorial loading/error/Retry и generation на слот. Успешный persist отменяет устаревшие reads своего слота; чтение другого слота не теряется при смене игрового epoch. Принятый memory Save не перезаписывается более старым ответом.

App, network/server/room UI, shared, main, core/data/bots, package и lockfiles не изменены относительно c295. Внешние зависимости не добавлены. Разрешены только ownproject, ordinary Git/GitHub и публичные лицензированные OSS; ничего Arcadia/internal Yandex, в том числе через исполнителей.

Стенд использует отдельные `http://127.0.0.1:5185/`, `ws://127.0.0.1:8898` и новую БД QA. Для повторного запуска в собственном checkout:

```sh
pnpm install --frozen-lockfile
pnpm server:install
EUROPE_PORT=8898 EUROPE_DB_PATH=/absolute/own-qa/rooms.sqlite EUROPE_ALLOWED_ORIGINS=http://127.0.0.1:5185 pnpm server:start
```

В другом терминале:

```sh
VITE_NETWORK_URL=ws://127.0.0.1:8898 pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 5185 --strictPort
```

Порты должны быть свободны; чужие серверы и комнаты не останавливать. 5175/ws8788/старую rooms.sqlite эта работа не использовала.

На runtime43c прошли build/check/server:check/format:check, все 316 tests в29 файлах и реальные действия собственного Chromium157.0.8098.0: resize1280×720/1672×941/1920×1080, DPR2, settings/rules/native keyboard focus, menu→solo→menu→continue, отдельное обучение и reload двух сохранений, два настоящих Retry чтения повреждённых journal, уход во время загрузки, intentional503 ассета и успешный Retry. Два независимых browser storage contexts вошли в новую QA-комнату, начали партию с разными приватными руками/билетами и восстановили комнату после reload. Closed menu contexts действительно lost, текущий live. Event-based persisted pageshow проверяет обработчик; реальное помещение страницы в BFCache этим тестом не подтверждено.

Успешный runtime не закрывает художественную приёмку, адаптив или анимацию. Проверены desktop размеры. Физический Pointer Lock, аппаратный микрофон, Internet/NAT в этом проходе не повторялись; прежние ограничения сохранены. В обычном браузерном проходе нет application/page errors; сохранился прежний запрос favicon.ico404 из неизменённого index.html. Ошибка503 относится к намеренному тесту fallback. Main/Sites и публичный сетевой выпуск не изменены.

Дополнительный actual browser проход runtime43c подтвердил живой resize вместе с DPR1↔2, настоящую потерю WebGL через WEBGL_lose_context и native Retry, три гонки реального IndexedDB чтения с7s задержкой доставки success callback: current во время обучения, tutorial во время обычной партии и старый current после новой записи. Значения хранилища не подменялись. DPR-only override без resize в используемом Chromium/CDP не отправил change даже минимальному native matchMedia control без React/Three; такой тест не подтверждает реальную смену монитора или масштаб без resize. Обработчик MQL проверен отдельно как source/callback contract.

Полный source/build manifest и browser evidence передаются отдельно с integration handoff. Их runtime hashes сверяются с данным commit; screenshot подтверждает внешний вид, а действия и протокол — работу подключения.
