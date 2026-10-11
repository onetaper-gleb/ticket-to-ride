# Интеграция общей сцены a591

Ветка `integration/europe-menu-common` подключает принятую общую сцену `a5911d61a028486d0c0b1bbdbb6197bf17ad5189` к проверенной интеграции `16ae5dfce2859bf3bfd036438fb8fd3d37e3e1e7`. Полная история 166 commits перенесена merge-коммитом `80ab6995a2af8003de18f13eeedd7eb3caff0473`; это проверенный runtime. Последующий commit меняет только README и собственные отчётные файлы.

Исходный bundle: 9 827 399 байт, SHA256 `f3220f2242dcd30fd3f73079bdd67a053ed10881812e025460a4b9c917f54d35`. Все 60 menu/public paths совпадают с принятым a591; 199 остальных paths, кроме четырёх owner docs, совпадают с integration16. Собственные четыре renderer/session файла побайтно равны `43c38e84bd195261eaf8170f9b69345639dcc221`. Native hand binary и source JSON сохранили frozen78. Чужой dirty checkout не копировался.

Принятый common включает environment2cb, cashierd4 и art24. Новые части e011/API/геометрии/кассирши/art напрямую не переносились. Host опускает ticketGripPose, поэтому используется `agreed`; `calm-support` остаётся явным сравнением. Source-only Settings age-edge присутствует в принятом public source, но не подключён loader/CSS/host и не запрошен в браузерном проходе.

## Сохранённые контракты

VSM включается только у menu renderer до первого draw. Menu post graph остаётся RenderPass → MenuAO → depth X/Y → OutputPass → FXAA; глубина заимствована у AO, near/far .1/80, DPR ограничен 2. Игровой Diorama и PCF, App, input/intentEpoch, network/server/shared, session callbacks и saves, rules/core/data/bots классического Europe2019 сохранили проверенную основу.

Native Settings/Rules/Back/Retry используют существующие callbacks. Current/tutorial разделены; per-slot generation сохраняет поздно загруженный другой слот и отменяет устаревшее чтение после persist. Late factory, pagehide/pageshow, contextlost/Retry и disposal guards остаются прежними. Геометрия и материалы художников подключены через принятый общий commit без собственных правок.

## Выполнено на runtime80ab6995

Format:check и build прошли; build включает TypeScript check. Собственный Chromium157.0.8098.0 с настоящим ANGLE Metal на Apple M4 Pro проверил welcome → native settings, настройки 2 места/имя/seed/easy, Rules Next/Back/return/Escape/focus; menu → solo → menu → continue, отдельное обучение и reload обоих сохранений. Проверены два настоящих Retry повреждённых journals, уход во время загрузки, намеренный asset503 и успешный Retry, вход в свою сетевую комнату и Back с сохранением current/tutorial.

При реальных GL draws зарегистрированы linked/executed VSM shaders и depth program: оси [1,0]/[0,1], одна bound tDepth texture для обеих осей, near≈.1/far80. Physical resolution совпал с 1280×720, 1672×941, 1920×1080 и DPR2 2560×1440. Наблюдающие native GL wrappers передают исходные вызовы/аргументы; sampler observation восстанавливает active texture. Это проверка исполнения и uniforms, не измерение производительности.

Отдельный teardown до reload подтвердил потерю старого реального menu context и удаление canvas. Дополнительно прошли WEBGL_lose_context → native Retry, live resize вместе с DPR1↔2 и три гонки настоящего IndexedDB success с задержкой 7 секунд: current во время tutorial, tutorial во время solo, старый current после нового persist. Сохранённые значения не подменялись.

Независимый targeted source/CPU review не выявил подтверждённых открытых P1/P2 в проверенной границе. Он подтвердил точные paths/API/host, layout совместимость, 130 geometry/45 materials/14 clones/10 art/2 skeleton и четыре synthetic VSM targets с dispose once. В его smoke textures mocked, title synthetic; GPU/browser данные получены отдельно интегратором.

## Ограничения

Полная прежняя suite 316 tests на43 и принятые c295 конечные сетевые/voice/Pointer Lock/kept-ticket privacy проверки сохраняют историческую границу. Они не повторялись в этом menu-only проходе. Новый сетевой сценарий проверяет один lobby/Back; приватность kept tickets здесь заново не доказывается. В a543 двухклиентском сценарии ticketCounts были0/0, поэтому его прежняя формулировка о билетах квалифицирована отдельной заметкой.

PageTransitionEvent проверяет обработчик persisted pageshow; реальный BFCache entry не доказан. Fixed DPR2 и resize+DPR прошли, настоящий перенос между мониторами без resize не аттестован. Аппаратный микрофон, Internet/NAT, adaptive, FPS/VRAM и полный человеческий плейтест не подтверждены. Обычные tracked contexts не дали application/page errors; favicon.ico404 прежний, asset503 намеренный. Vite предупреждает о JS chunk больше500kB.

Root SOURCE/CPU и PACKAGE приняли a591 отдельно. Их owner GPU/геометрия/физика не объявляются собственным измерением интегратора. PACKAGE qualifier: 75PNG CRC/dimension PASS, 54/70 точных crops; 16 последовательных browser clips имеют2–4069 отличающихся RGBA bytes. Standalone relocated preview-source npm build root не выполнял. Здесь собран настоящий интеграционный проект из exact Git, а не переносной owner harness.

Artistic и production pose OPEN, adaptive DEFERRED, animator STOPPED. Main/Sites/owner-only и человеческие5175/ws8788/DB/room не менялись. Прежний собственный QA5185/ws8898 сохранён.

## Новый QA

[Стенд](http://127.0.0.1:5186/) использует ws8899 и отдельную БД `work/menu-common-validation/rooms.sqlite` текущей integration task. Запуск из собственного checkout:

```sh
EUROPE_PORT=8899 EUROPE_DB_PATH=/absolute/own-qa/rooms.sqlite EUROPE_ALLOWED_ORIGINS=http://127.0.0.1:5186 pnpm server:start
VITE_NETWORK_URL=ws://127.0.0.1:8899 pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 5186 --strictPort
```

Server и preview запускаются в отдельных терминалах. Используются прежние frozen dependencies с проверенным публичным происхождением; новых зависимостей нет. Только ordinary Git/GitHub, свой проект и публичный OSS. Аркадия/внутренняя инфраструктура Яндекса, её code/deps/repos/docs/credentials/tools/skills/services и косвенные агенты исключены полностью.

[Manifest](europe-menu-common-a591-manifest.json) связывает exact source/build, browser/CPU proofs, scripts и inherited evidence. Итоговый handoff и receipt передаются отдельно в `outputs/common-a591-integration/`.
