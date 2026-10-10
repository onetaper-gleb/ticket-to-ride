# Статичная общая сцена меню

Ветка design/menu-ticket-office-composition объединяет полные истории environment4a281d5, cashier08bc3c4 и art97ec1b1 от bea9743. Production App, session, manifest и выпуск не изменяются. Анимационный этап закрыт.

createMenuComposition загружает четыре рисунка и binary кистей до builders. На ошибке Promise отклоняется; harness показывает статус. Контакты worldToLocal переводятся один раз относительно cashierAnchor. Кассирша стоит под anchor с identity transform. Три бумаги перенесены в ticket-slot с offset(0,.005,0). Печать повёрнута90° в texture без изменения бумаги/хвата. Стрелки показывают10:10 статично.

layout(width,height,boardRect?,settingsRect?) принимает реальные внешние DOM rect. Камера screen-parallel, рама unproject на плоскостьZ=.12×distance. projectFrame возвращает фактическую проекцию для проверки≤2CSSpx. Presets сохраняют координаты specv2; расхождения сPNG переданы 2D владельцу. Renderer/harness задают ACES/exposure1.1, DPR1 и shadow1024².

dispose идемпотентен: cashier освобождает бумаги/rigs, environment — меши/material/texture clones, compositor — четыре входные texture и shadow keyLight. Harness освобождает renderer/listeners. Повторный обход ресурсов готовых bundles запрещён. Нет постоянного rAF, AnimationMixer или imports menu-animation; только загрузка/resize вызывают render.

Первый общий кадр обнаружил недостаточный размер головы относительно окна, высокий цоколь, невыразительный ближний багаж и массивную опору поезда. Запросы переданы владельцам. Общая визуальная приёмка продолжается.
