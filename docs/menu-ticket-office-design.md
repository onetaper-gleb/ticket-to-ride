# Меню «Билетная касса»: производственная спецификация

Версия 4.2, 11 октября 2026. Выбран вариант 2, главный экран сравнения — 1672×941. Малое уточнение печати продолжает принятый арт `6a48a80a6c599e74a2ee8e1980e951d6cd1cb0e2`: тёплая матовая зелёная краска, более крупные регулярные serif подписи, отдельная колонка печатных иконок, кремовая бумага settings и натуральные материалы окружения. База ветки `design/menu-ticket-office-art` — `bea9743c7622a7806a3d9b6824a9d912b0a41b65`. Точный SHA новой версии указан в handoff.

Документ задаёт native DOM и его совмещение с физической рамой. Геометрия, камера, свет и физические грани принадлежат владельцам 3D сцены; production UI подключает интегратор. Обязательная политика AGENTS.md: только обычный Git/GitHub, собственный код и публичные open-source инструменты с проверенными лицензиями; никакой Аркадии или внутренней инфраструктуры Яндекса, включая косвенное использование. Анимации остаются закрыты.

## Палитра и поверхности

| Token | sRGB | Применение |
| --- | --- | --- |
| board | `#223A33` | Плотный цветовой слой над зелёной фактурой |
| row | `#29443B` | Scroll track; общий ряд получает поверхность board |
| paper | `#F4E8CF` | Текст на зелёном, циферблат |
| ink | `#172B25` | Текст primary, форм и retry |
| accent | `#EDBA64` | Доступное главное действие, плоские состояния |
| hover | `#385A4C` | Обычное наведение |
| pressed | `#CFA052` | Нажатое главное действие |
| disabled | `#BCCDBD` | Недоступный текст без общей opacity |
| focus | `#FFF2AD` | Внешний 3 px контур с 3 px отступом |
| brass | `#AD7E41` | Сдержанный физический кант |

Native board и обычный ряд: `linear-gradient(#223a33a6,#223a33a6),url(board-paint.webp)`, background-size 256px 256px. Primary: `linear-gradient(#e8b868b3,#e8b868b3),url(paper-tile.webp)`, blend normal,multiply, background-color `#ffcf7b`. Settings: `linear-gradient(#e3cfaa96,#e3cfaa96),url(paper-tile.webp)` и текст `#342C20`. Тонкая печатная линия `#84664355`, 1 px, inset5 px, pointer-events:none; физический край бумаги, рамка и крючки принадлежат 3D. Плотные цветовые слои приглушают редкие пиксели фактуры и изолируют текст от света WebGL. Hover/press и disabled используют плоские цвета; disabled — board. Все текстуры — 512² SRGB RGB, цвет без baked света, объектов, краёв, надписей и normal/bump.

Минимальный расчёт контраста по всем декодированным пикселям этих CSS смесей: cream/paint и scroll note 6.59, disabled/paint 4.80, ink/settings 6.61, ink/primary 6.39. Самый тёмный front stop крупного EUROPE/paint 3.76; декоративные блик/глубина не заменяют лицевой текст. Это расчёт поверхности, без сглаживания текста, управления цветом браузера и WebGL освещения. Текущие данные — `outputs/print-refinement/contrast.json`, расчёт — `work/finalize-print.py` в source pack; исходные v4 данные сохранены отдельно.

## Исходные boardRect и settingsRect

Координаты — CSS px от начала документа при scrollY=0, непреобразованные внешние border boxes DOM для `composition.layout(width,height,boardRect,settingsRect)`. После проекции рамка является четырёхугольником. Преобразованный getBoundingClientRect нельзя подавать обратно в layout.

Физическая полоса доски занимает 12 px с каждой стороны в локальных координатах; native фон начинается с inset12. Desktop отступ контента от внешнего левого/правого края — 48/32 px на 1280 и 1672, 52/36 px на 1920. Вертикальный inset — 24/24/28 px. Settings имеет рамку6 px и inset12. DOM в физическом desktop режиме не рисует второй кант, заклёпки, толщину или подвесы.

| Viewport | Preset | boardRect x,y,w,h | settingsRect x,y,w,h | Header / row / gap / header gap | Label / continued tutorial / icon / icon column / mark |
| --- | --- | --- | --- | --- | --- |
| 1280×720 | desktop | 46,38,420,482 | 96,534,340,76 | 96 / 76 / 6 / 16 | 32 / 24 / 36 / 80 / 300 |
| **1672×941** | desktop | **60,50,510,596** | **125,655,390,98** | **136 / 94 / 8 / 12** | **40 / 28 / 44 / 104 / 370** |
| 1920×1080 | desktop | 69,57,580,680 | 144,753,448,112 | 164 / 103 / 10 / 18 | 44 / 32 / 48 / 116 / 414 |
| 2560×1080 | ultrawide | 389,57,580,680 | 464,753,448,112 | как1920 | как1920 |
| 3440×1440 | ultrawide | 829,236.71,580,680 | 904,932.71,448,112 | как1920 | как1920 |

Desktop label: «Times New Roman», Georgia, serif, weight400, line-height1.2. Это системные шрифты, в пакет не копируются. «Продолжить обучение» получает отдельные 24/28/32 px, чтобы оба сохранения помещались в обычные строки. Settings label26/32/36 px. Hints остаются IBM Plex Sans24 px/1.2 и отдельным динамическим текстом. На дальнем крае доски1672 вертикальное сжатие около0.866 сохраняет hint около20.8 px. Читаемость перепроверяют при изменении камеры или шрифта.

Header содержит собственный SVG600×120 и доступный h1 «Ticket to Ride: Europe», без subtitle/нижних орнаментов. Mark прижат к низу header с padding-bottom28 px; относительно v3 он поднят на16 px. Ряд: padding0, gap0, border1px `#14271e`, radius4px. Печатный рельеф: inset top1px `#82978480`, left1px `#82978450`, bottom2px `#101e1770`, внешний низ1px `#101e1750`. Колонка иконки растянута по высоте, divider1px того же тёмного цвета с тонким внутренним бликом. Primary: border `#93642d`, divider `#99652d`, блик `#FFE1A49E`, низ `#A36A2F80`; disabled border/divider `#536554`, блик с alpha40. Focus имеет приоритет над декоративными shadows. Иконка центрируется, copy имеет padding6px16px, flex-column gap2px и min-width0. Иконки заполненные с небольшими вырезами/контуром, currentColor, aria-hidden; названия остаются DOM.

### Интерполяция desktop

Desktop: width≥1100 и height≥680. e=min(width,1920); если e×941/1672>height+1, e=height×1672/941. q=clamp(e,1280,1920), cx=max(0,(width−q)/2), cy=max(0,(height−q×941/1672)/2). Значения таблицы линейно интерполируются на1280→1672→1920. Допуск1 px сохраняет опорные размеры без сдвига из-за округления aspect.

Внутренний вертикальный padding внутри12px border:12/12/16. Horizontal padding: слева padding+24, справа padding+8. Внешняя высота доски =24+2×padding+header+headerGap+4×row+3×gap. Settings x=board.x+50/65/75, y=board.y+фиксированная высота+14/9/16. Переносы/ошибки этих величин не меняют. Width>1920 оставляет центральную рабочую область1920; дополнительное место принадлежит окружению.

### Прокрутка и узкие окна

Header остаётся над отдельным native actions-scroll. Внешний actions-frame сохраняет высоту4×row+3×gap+16:338/416/458 px. На1672 четыре базовые строки94px дают416px без overflow. Если естественное содержимое больше внешней высоты, отдельный footer24px занимает низ frame, nav получает314/392/434px. Внешние boardRect/settingsRect сохраняются. Без overflow nav получает полную высоту, footer скрыт. Длинные hints, сообщения обоих слотов и retry растут в потоке внутри viewport без ограничения числа строк. Внешние board/settings и физические подвесы остаются фиксированными.

Actions-frame: margin(headerGap−8px) −8px −8px; nav внутри margin0, padding8px, не добавляет headerGap повторно. Overflow-y:auto, overflow-x:hidden, overscroll-behavior-y:contain. Scrollbar8 px, track=row, thumb=paper с border2px board. Это оставляет место внешнему focus. У строк/retry scroll-margin-block16px, у viewport scroll-padding-block8px. Native Tab и focusin показывают активную кнопку через scrollIntoView(nearest); после resize/изменения сообщения проверка повторяется. Каждая retry через aria-describedby связана со своим сообщением. Footer — одна неинтерактивная native подсказка, 18px/20px Plex, цвет paper, aria-describedby у nav: «Ещё действия ↓» вверху, «↕ Прокрутите меню» в середине, «↑ Действия выше» внизу. Она занимает собственные24px, не перекрывает строку или focus и не добавляет Tab stop. Естественную высоту считать до резервирования footer, чтобы не вызывать скачок scrollTop. Окончательный единый cue подключает compositor в общий native harness, production UI — функциональный владелец.

Narrow:760≤width<1100, height≥760, aspect<1.25; board x32, y=clamp(height×.272,220,360), w=min(400,width−64). Остальные width≥760 — compact с x24/y40; width<760 — column с x16/y24 и w=min(360,width−32). Padding12, header80, gap6, headerGap12, icon32/column60. Label/hint Plex23/24/27 px, обычные rows72/76/84, tutorial minimum100/106/116. Высота в потоке, строки растут при переносе. Settings w=board.w−32, x=board.x+16, gap24/20/20, minimum height64/64/72; retry60/64/72. Ширина640 — ранее проверенный минимум; полная адаптивная приёмка в v4 не повторялась.

Overflow-wrap:anywhere сохраняет доступ к длинным кодам. Документ получает min-height=max(viewportHeight,нижняя проецированная точка UI+32). В desktop физические рамы всегда видимы, canvas position:absolute. В узких окнах при переполнении документа сохраняется прежний доступный режим: физические board/settings/hangers скрыты, CSS-рамы прокручиваются с DOM, canvas fixed. Browser zoom меняет CSS viewport; реальный zoom200% этой проверкой не подтверждён.

## Физическая рамка и поверхность моделей

Текущий малый consumer использует точный общий candidate `38b23ff6618c85b830d97998ef249a6e1410fa03`, полученный read-only git archive. Исторический v4 consumer использовал316f83085e4f1989779c57954f1014213b7fec0b. Контроль «до» и candidate «после» используют одинаковые scene modules, camera/light и JS bundle; меняются только собственные SVG/native print/footer. Camera(0.04,0.52,6.4), FOV34°, `models.parts.stationRoot.rotation.y=27°`; environment root identity. Cashier под anchor: position0, quaternion identity, scale1. Новая геометрия и свет не подменяются локальными 2D трансформами.

`projectCorners(width,height)` возвращает quad TL,TR,BR,BL с лицевой физической геометрии. Сначала снять старые CSS transforms, измерить исходные border boxes, вызвать layout, получить quad, применить menuQuadCssMatrix отдельно ко всей доске и settings с transform-origin0 0. Native labels/hints/icons/retry преобразуются вместе. Canvas aria-hidden и pointer-events:none; dialogs находятся вне преобразованных родителей. Content change, fonts-ready и resize повторяют измерение. Consumer пропускает временный скрытый viewport1×1 и ставит ready после успешного кадра.

На1672: board TL(60,50),TR(570,106.490),BR(570,622.423),BL(60,646); settings TL(125,655),TR(515,635.716),BR(515,723.473),BL(125,753). Board AABB(60,50,510,596), settings AABB(125,635.716,390,117.284). Допуск DOM/physical ≤2 CSS px; измеренный максимум v4 на1672 —0.000018 px, при resize1280→1920→1672 —0.000019 px. Совпадение углов само по себе не подтверждает клики.

Точный новый surface API окружения — `c4746fbe35c445cf1d1c9ac9f941e7f31c349c4e`, parent7bfee581. `buildMenuModels({surfaces,materialOverrides})` принимает optional карты: cream→plaster, green/boardPaint→board-paint, wood/woodDark→wood, leather→leather, stone→stone, paper→paper. Отдельных top-level leather/paper API нет. Пути и рекомендации — `sources/surface-slots.json`. WoodDark использует те же bytes с material color multiplier, не отдельный файл.

Surface карта имеет приоритет перед legacy wood. Входная Texture принадлежит caller; builder клонирует transform/repeat, задаёт SRGB/RepeatWrapping, mapped color по умолчанию white. Без карты действует palette. Legacy wood сохраняет muted varnish tint. Override color умножает карту. `models.surfaces` содержит реальные shared materials; geometry/material/map clones освобождает только idempotent models.dispose, входные textures — caller. Prints clock/stickers имеют отдельные clones. Не добавлять второй lifecycle owner.

Box/RoundedBox UV0..1 на грани; Extrude UV задаются локальными XY/edge координатами. Vertical wood UV=(1−v,u). Repeat выбирается по реальным UV/масштабу, а не по пикселям. Исторический frozen316 использовал legacy wood repeat2×4; новые physical surfaces в нём ещё не были wired. В текущем frozen38b MenuCompositionArt передаёт согласованные surfaces в buildMenuModels, включая boardPaint/paper и материалы окружения. Этот раунд сохраняет его геометрию, свет и rendering passes; новые текстуры не генерирует. Полную финальную приёмку общего материала выполняют владельцы сцены. Не выдавать pack за завершённую приёмку 3D сцены.

| Рисунок | Ориентация |
| --- | --- |
| clock-face512² | Квадратная UV,12 сверху+Y, лицевая+Z,16px прозрачные поля; стрелки отдельные |
| ticket-print512×256 | Сохранять2:1. Для portrait повернуть Mesh бумаги90° либо UV90°, выбрать один способ |
| luggage-stickers512² | Crop224² квадратный, ширина30–40% стороны, отступ до шва≥5%; верх+Y |
| wood-tile512² | Волокна поX, repeat; для вертикальной детали UV поворачивает builder |

Stickers crops с верхним левым origin: circle(16,16,224,224), diamond(272,16,224,224), shield(144,272,224,224). Нижний левый UV: circle u.03125–.46875/v.53125–.96875; diamond u.53125–.96875/v.53125–.96875; shield u.28125–.71875/v.03125–.46875. Не дублировать manual flip и texture flip. В v4 цвета эмблем спокойнее, circle содержит печатный локомотив; crops не менялись.

## Safe zones общей сцены

Ориентиры выбранного PNG1672×941: лицо(700,292,185,170), кассовое окно/кассирша(590,78,540,744), поезд(1200,400,472,330), лампа над доской(262,0,162,92), руки/прилавок y580–630, основание/пол y790–825. Это экранные цели, не world anchors.

Доска/лицо разделены≥48px. Руки, билет, опоры и багаж не пересекают UI quad с запасом8px под focus. Под шириной settings багаж начинается ниже её фактического нижнего края+16; проверять полигоны. Общий дизайнер владеет светом/камерой, окружение — физическими краями/подвесами и массами, кассир — лицом/контактами. После новых bundles повторить сравнение с выбранным референсом. Старый дефект лампы из045 здесь не считается текущим.

## Действия, форма и правила

Четыре базовые строки: «Продолжить», «Начать партию», «Обучение» либо «Продолжить обучение», «Правила»; отдельно «Настройки партии». No-save: обычное продолжение disabled + «Нет сохранённой партии», primary новая партия. Current: primary продолжение + «Обычная партия». Tutorial: обычное disabled, учебное доступно. Both: оба сохранения независимы. Finished current: «Продолжить» + «Открыть итоги». Loading каждого слота: disabled + «Проверяем сохранение…». Preparing: «Готовим стол…», команды старта disabled, при долгой загрузке отдельный возврат. Error каждого слота: «Не удалось проверить сохранение» и отдельная native retry; неизвестный слот не подписывать пустым.

### Необязательный вход в совместную игру

Shared контракт `4320c96a95302ef17421e24567e3901099a25fa4` добавляет optional `onOpenNetwork?: () => void`. Функциональный commit `2b06644f6b47ab9dc712b928b2a774b55ea9525c` закрепляет label «Играть с друзьями», без hint, enabled=true. Только при наличии callback между «Начать партию» и обучением появляется пятая native строка. Нажатие вызывает callback входа в сетевой экран. Без callback прежние четыре действия и их состояния сохраняются.

Иконка `icons/friends.svg`: две фигуры, авторские заполненные формы, viewBox32/currentColor/aria-hidden/focusable=false; размеры, колонка, divider, цвет и focus как у остальных рядов v4. Label остаётся native текстом, hint не добавлять. Строка наследует минимальную высоту обычного ряда и растёт при переносе; не уменьшать все прежние подписи ради неё.

Desktop/ultrawide сохраняет внешние boardRect/settingsRect и внешнюю высоту actions-frame по четырём базовым строкам:338/416/458px. При overflow footer24px сокращает только nav до314/392/434px. Дополнительная строка и gap находятся внутри native scroll. При callback=true даже обычное меню может прокручиваться; header, физические рамы/подвесы и settings остаются на прежних местах. Tab/Shift+Tab показывает весь focus; settings — отдельная достижимая кнопка за viewport действий. В narrow/compact/column дополнительная строка увеличивает высоту доски в потоке по прежнему контракту. Малый art preview демонстрирует присутствие callback флагом network=1; это не production сетевой экран.

Историческая проверка принятого friends-entry6a48 на1672, state=both: с callback пять строк, friends110px из-за переноса label, содержимое534px при viewport416; без callback четыре строки и416px без прокрутки. Board/settings и физические рамы сохраняются, document1672×941/scrollY0, горизонтальный overflow0. Tab показывает friends/обучение/правила/settings; форма Enter/Escape возвращает focus settings. Старые материалы не пересоздавались, широкая QA не повторялась. Данные и кадры — outputs/friends-entry/.

Error размещается под своей строкой. Desktop retry minimum64 px, label24 px, на текущем ракурсе effective height>52 px. Сообщение не заменяет label. Disabled без opacity; focus — двойной ink2px + focus3px с offset3px. Hover/focus могут сосуществовать. Переходы цвета в текущем consumer мгновенные; новый анимационный этап не начинается.

Новая партия/settings открывают один native dialog «Параметры новой партии», width=min(640,viewport−32), max-height=viewport−32, overflow-y:auto. Paper/ink, белые поля, overlay#172B25/.66, heading28 (compact24), labels20, touch≥52, padding24 (compact16), footer в потоке. Поля: всего мест2–5 с1–4 ботами; сложность Лёгкие/Обычные; имя maxlength24/default«Вы»; optional code maxlength64. Default3 места, сложность сессии; пустое имя→«Вы», seed trim. «Назад» закрывает; «Сесть за стол» запускает. При current предупреждение о замене обычного сохранения с сохранением обучения; unknown предупреждает возможную замену. Focus trap, Escape и возврат focus обеспечивает функциональщик.

«Правила» открывают существующий reader, width=min(680,viewport−32), max-height=viewport−32, внутренний scroll. Назад/следующий лист/возврат в меню достижимы, черновик формы сохраняется. Gallery использует прежний текст и иллюстрации для проверки размещения; IndexedDB не читает и игру не запускает. Retry только сокращает демонстрационное сообщение.

## Арт, происхождение и проверка

П1: шесть SVG icons (включая optional friends.svg); EUROPE mark; clock-face; ticket-print; luggage-stickers; шесть WebP512² (board-paint,wood,paper,leather,plaster,stone). Lossless RGB masters512² и verbatim prompts сохранены в public/menu/art. Полные результаты встроенного image_gen — в output pack `revision-v4/generated-masters/`. Генерация — новые material swatches, без reference edit; модель/seed инструмент не сообщил. Sharp только изменил размер/формат. `sources/encode-surfaces.cjs --check` воспроизводит все шесть WebP побайтово из512 PNG. Исторический generate-textures.py воспроизводит прежние procedural tiles, не v4 карты.

A10 distant-sky.svg обновлён как optional предложение: светлый голубой градиент, две собственные diffuse cream cloud формы и абстрактная дальняя атмосфера. Нет станции, предметов, деревьев или цельной PNG. В текущую сцену38b не подключён; compositor выбирает SVG либо собственный background gradient. A11 steam-mask-p2.png неактивен. A12 оба прежних fallback-draft остаются историческими drafts; финальный fallback снимают с принятой общей 3D сцены. SVG — собственные paths, системные serif fonts не распространяются; Plex OFL1.1 сохранён с лицензией. Public Three.js0.180.0 MIT, Vite7.3.7 MIT, Sharp0.35.5 Apache-2.0 подтверждены package metadata/поставляемыми LICENSE; полные копии в output source pack. Provenance и inventory содержат источники, размеры, SHA256 и бюджет.

Inventory32 файла, XML12 SVG включая source-only shape. Runtime SVG+растр363391 B, растр348682 B с двумя draft fallback. Каждый fallback<400KB. RGBA8+full mips по всем уникальным П1 изображениям, включая optional sky:14 MiB; с обоими fallback и П2:22.286458 MiB. Frozen316 четыре загруженные карты:4.666667 MiB. Это арифметика размеров, без повторных GPU upload clones, DOM raster textures, shadows/targets/PMREM; actual renderer.info не измерялся. Повторение материалов2×2 визуально ровное; точное совпадение противоположных edge pixels не заявлено, edge statistics сохранены.

V4 проверен на собственном WebGL/native consumer с frozen316: no-save, both, error-current, error, both-long, error-long на1672. Board/settings фиксированы, physicalFramesVisible=true, scroll-frame=false, scrollY0, horizontal row overflow0. Actions content416/416/580/743/630/1317 при viewport416. Tab показывает обе retry, новую партию, правила, settings; Enter/Escape открывает форму и возвращает focus, retry collapse сохраняет focus. Resize1280→1920→1672 с длинными ошибками сохраняет видимые рамы и focus. Console errors0. Арт XML/hash/dimension/encoding и diff scope проверяются перед commit. Полные8 адаптивных размеров, production storage/game, FPS/lifecycle и независимая приёмка этого candidate не заявлены.

## Малое уточнение печати и source для объёмного EUROPE

`europe-mark.svg` сохраняет шесть прежних d paths и fill-rule, viewBox600×120. Лицевой слой — gradient `#FFE1A4`→`#EDC17E`→`#D9AA64`; тонкий блик `#FFF0C2` со сдвигом(−0.3,−1.1), глубина `#624522` со сдвигом(1.5,3) в единицах SVG. Это три use одной исходной группы, без нового font. Header position/размеры и доступный h1 сохраняются.

Root согласовал optional объёмный hook с environment/compositor через существующий публичный Three SVGLoader MIT. `sources/europe-shape-source.svg` содержит только шесть исходных paths один раз, чёрный fill. Browser getBBox: x62,y20,width475,height73; viewBox0 0 600 120, SVG+Y вниз. SHA256 `39b05d8b8863db9f61a6a9c31646f0fa5f9a5429e567f7c4e2d93cbae6340aed`. Его использовать для geometry; декоративный europe-mark.svg целиком не превращать в три комплекта букв. Environment владеет geometry/depth/material; compositor — загрузкой, placement/light и hide/restore видимой native копии. После успешного hook видимый SVG скрывается, semantic h1 сохраняется; при ошибке SVG возвращается. В кадре ровно один видимый EUROPE. Frozen38b hook не содержит, поэтому текущий кадр показывает только SVG fallback.

Все print/scroll tokens — `sources/print-tokens.json`. Никаких CSS дублей физических рам, крючков, болтов, неровного края бумаги или новой геометрии в art ветке. Строка друзей остаётся между новой партией и обучением, enabled, без hint. Fonts, icon slots, hints24px и continued tutorial28px на1672 сохранены. Анимационный этап закрыт.

Текущая проверка на frozen38b,1672×941: no-save без callback —4 rows, навигация416/416, cue скрыт; both с callback —5 rows, friends110px, nav392/content534, footer24px; error+long+callback —nav392/content1377. Tab проходит обе retry/new/friends/rules/settings, disabled rows пропускает; focus виден целиком, cue меняется вниз/обе стороны/вверх. Retry сокращает message до content1233, сохраняет focus и фиксированные frames. Настройки Return/Escape возвращают focus; board(60,50,510,596), settings(125,655,390,98), physical board/settings/hangers=true, один SVG title, document1672×941/scrollY0, горизонтальный row overflow0, console errors0. Сравнение «до» снято на той же38b. SVG/source bounds,32 hashes,12 XML, неизменность28 прежних ассетов и кодирование шести WebP проверены. Кадры и данные — outputs/print-refinement/. Production storage/network/game, полная адаптивная QA, FPS/lifecycle и будущий physical hook здесь не проверялись.
