# Статичная общая сцена меню

Ветка `design/menu-ticket-office-composition` объединяет полные истории environment `4a281d5`, cashier `08bc3c4` и art `97ec1b1` от `bea9743`. Compositor подготовлен для дальнейшего внедрения интегратором. Production App, session, manifest и выпуск не меняются. Анимационный этап закрыт.

## Загрузка и контакты

`createMenuComposition({ assetBase, signal })` загружает четыре рисунка, затем binary кистей до builders. При ошибке Promise отклоняется; harness показывает статус. Отмена освобождает уже загруженные рисунки.

После обновления world matrices реальные контакты окружения переводятся через `cashierAnchor.worldToLocal` ровно один раз. Кассирша стоит под anchor с identity transform. Три бумаги перенесены в настоящий `ticket-slot` с local offset `(0, .005, 0)`, identity quaternion и scale1. Владение бумагами остаётся у cashier. Печать повёрнута на90° в texture без изменения бумаги или хвата. Стрелки показывают10:10 статично.

## Перспективная доска и native DOM

По уточнению пользователя фасад и доска развёрнуты в перспективе. Desktop preset использует yaw27°, камеру `(0.04, .52, 6.4)` и FOV34°. Единый root поворачивает окно, прилавок, anchor кассирши, контакты рук, доску и часы вместе. Railway сохраняет выбранные world положение и ориентацию через обратное преобразование root. Мышь ракурс не меняет.

`layout(width, height, boardRect?, settingsRect?)` принимает **не трансформированные** внешние border boxes DOM. `x/y` — целевые координаты верхнего левого угла, `height` — высота левого края, `x + width` — горизонтальный ориентир правого края. Это ещё не итоговый экранный AABB. Края unproject на локальную плоскость фасада `z=.04`; правый край становится ниже и короче по законам перспективы. Border12/6CSSpx переводится в local units по левому краю. На desktop ориентиры выбраны по исходному PNG: board `(60, 50, 510, 596)`, settings `(125, 655, 390, 98)` при1672×941. Narrow и compact сохраняют минимальные размеры; приёмка сходства сосредоточена на desktop.

`projectCorners(width, height)` возвращает настоящие внешние углы передней поверхности физических meshes `board-frame/green` и `settings-frame/wood` в порядке TL, TR, BR, BL. Учитываются их geometry bbox, matrixWorld и камера. `projectFrame` возвращает AABB этих четырёх углов для информационной диагностики.

`menuQuadCssMatrix(quad, width, height)` строит projective CSS `matrix3d` для **всей** доски: текст, фон и native кнопки получают ту же перспективу. Harness сначала снимает transform, измеряет border box, вызывает layout, берёт physical quad и применяет matrix с `transform-origin: 0 0`. После resize или изменения высоты DOM порядок повторяется. Не передавайте уже трансформированный `getBoundingClientRect` обратно в layout.

Canvas имеет `pointer-events: none` и `aria-hidden`. CSS border прозрачен: видна физическая 3D-рама, DOM фон ограничен padding box. Диалоги остаются native DOM вне перспективной доски. Четыре нулевых corner probes проверяют actual CSS transform независимо от экранного AABB.

## Ресурсы и проверка

Renderer/harness задаёт ACES, exposure1.1, DPR1 и shadow1024². `dispose` идемпотентен: cashier освобождает бумаги, геометрию, материалы и skeletons; environment — свои meshes, материалы и texture clones; compositor — четыре входные Texture и shadow keyLight. Harness освобождает renderer и listeners. Повторного общего dispose обхода bundles нет. Нет постоянного rAF, AnimationMixer или imports menu-animation; загрузка и изменения layout вызывают статичный redraw.

Browser checks проверяют native clicks, Escape и возврат фокуса, reader правил, преобразование контактов при дополнительном parent transform, реальные skinned vertices кистей относительно прилавка/билета, бумаги относительно стенок holder, повторные layout/dispose и AbortSignal. Четыре physical/DOM угла сравниваются отдельно от внешнего силуэта глубины рамки. Counts и CPU load/build timings относятся к выбранному кадру; FPS и GPU latency не измерены.

Первый общий кадр обнаружил недостаточный размер головы, смещённый билет, высокий нижний фасад, мелкий багаж и массивную платформу. Заявки переданы владельцам через оркестратора. Эти ассеты ожидают новых зафиксированных tips; точное визуальное сходство пока не принято.
