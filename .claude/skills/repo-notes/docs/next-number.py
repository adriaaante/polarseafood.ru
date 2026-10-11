#!/usr/bin/env python3
"""Следующий номер ДОКУМЕНТА проекта — ТОЛЬКО из finance-log ЭТОГО проекта. Запускать перед каждым
договором, счётом, актом и допсоглашением.

python3 next-number.py                  # из _materials/docs/: реестр ../finance-log.md, префикс из client.json
python3 next-number.py --prefix КН- --finance ../finance-log.md

Правило (решение Adrian 28.09.2026): у каждого клиента свой префикс из двух букв и свой счётчик с 001,
без привязки к другим проектам. Счётчик ОДИН на все виды документов проекта и идёт по хронологии
(решение Adrian 29.09.2026): договор КН-001, первый счёт КН-002, акт КН-003, следующий счёт КН-004… Номера из реестров других клиентов НЕ смотреть и НЕ продолжать.
Скрипт останавливается (код 1), если в таблицах документов есть номер без префикса проекта, с чужим
префиксом или повтор, если префикс не из двух букв, или если файл с этим номером уже лежит в docs/.
Исторические серии без префикса (Сферикс 1544–1549) — флаг --legacy-ok.
"""
import argparse, json, os, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('--finance', default='../finance-log.md')
ap.add_argument('--prefix')
ap.add_argument('--legacy-ok', action='store_true', help='разрешить старые номера без префикса (Сферикс)')
a = ap.parse_args()

prefix = a.prefix
client = {}
if os.path.exists('client.json'):
    client = json.load(open('client.json', encoding='utf-8'))
    prefix = prefix or client.get('prefix')
errors = []
if not prefix or not re.fullmatch(r'[А-ЯЁA-Z]{2}-', prefix):
    sys.exit(f'✖ Префикс «{prefix}» не задан или не из двух заглавных букв с дефисом (например «КН-»). '
             'Задать в client.json → "prefix" или --prefix.')
# Реестр префиксов клиентов: рядом со скриптом в скилле или в ~/.claude/skills/repo-notes/docs/.
reg_path = next((p for p in [os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prefixes.json'),
                             os.path.expanduser('~/.claude/skills/repo-notes/docs/prefixes.json')] if os.path.exists(p)), None)
if reg_path:
    reg = {k: v for k, v in json.load(open(reg_path, encoding='utf-8')).items() if not k.startswith('_')}
    owner = reg.get(prefix)
    name = client.get('short', '')
    if owner is None:
        sys.exit(f'✖ Префикса «{prefix}» нет в реестре {reg_path}. Сначала выбрать две буквы из названия клиента, '
                 f'проверить, что они не заняты ({", ".join(reg)}), добавить строку в prefixes.json скилла.')
    if name and owner['client'] != name:
        sys.exit(f'✖ Префикс «{prefix}» в реестре принадлежит {owner["client"]}, а client.json — {name}. '
                 'Две буквы должны быть уникальны у каждого клиента.')
else:
    print('⚠ Реестр префиксов prefixes.json не найден — уникальность двух букв между клиентами не проверена.')
if not os.path.exists(a.finance):
    sys.exit(f'✖ Нет реестра {a.finance}. Завести finance-log из шаблона скилла — номер без реестра не выдаётся.')

text = open(a.finance, encoding='utf-8').read()
# Номера берутся из ВСЕХ таблиц реестра документов: договоры, счета, акты, допсоглашения —
# у проекта ОДИН сквозной счётчик по всем видам документов в хронологическом порядке
# (решение Adrian 29.09.2026: договор КН-001 → счёт КН-002 → акт КН-003 → …).
# ⚠ [^\n]*, а не .*: с флагом re.S «.*» съедал весь раздел вместе с таблицей, и акты в счёт не шли (30.09.2026)
DOC_SECTIONS = r'(Договоры|Счета|Акты[^\n]*|Допсоглашения[^\n]*|Соглашения[^\n]*|Документы[^\n]*)'
secs = re.findall(r'^##\s+' + DOC_SECTIONS + r'\s*$(.*?)(?=^##\s|\Z)', text, re.S | re.M)
if not secs:
    sys.exit('✖ В finance-log нет разделов «## Договоры» / «## Счета» / «## Акты и соглашения» с таблицами.')
nums, width, cells, legacy = [], 3, [], []
for title, body in secs:
    lines = [r for r in body.splitlines() if r.startswith('|')]
    # шапка таблицы — строка перед разделителем «|---|» (в шапке бывает не «№», а «Документ»)
    rows = [r for i, r in enumerate(lines) if not re.match(r'^\|\s*(№|-)', r)
            and not (i + 1 < len(lines) and re.match(r'^\|\s*:?-', lines[i + 1]))]
    for r in rows:
        cell = r.split('|')[1].strip().strip('*')
        if cell in ('', '—', '-'):
            continue
        mm = re.fullmatch(r'№?\s*([А-ЯЁA-Z]{2}-)?(\d+)', cell)
        if not mm:  # «Акт № СФ-1558» / старые «Акт № 3», «Допсоглашение № 1 (Авито)» — номер после «№» в названии документа
            mm = re.fullmatch(r'[А-ЯЁа-яё][^№|]*№\s*([А-ЯЁA-Z]{2}-)?(\d+)\b[^|]*', cell)
        if not mm:
            errors.append(f'«{title}»: непонятный номер в таблице: «{cell}»'); continue
        p, n = mm.group(1), mm.group(2)
        if p is None:
            if not a.legacy_ok:
                errors.append(f'«{title}»: номер без префикса: «{cell}» (для старой серии Сферикса — --legacy-ok)')
            legacy.append(int(n)); continue  # старая серия без префикса: учитывается только для максимума
        if p != prefix:
            errors.append(f'«{title}»: чужой префикс: «{cell}» при префиксе проекта «{prefix}»'); continue
        width = max(width, len(n))
        nums.append(int(n)); cells.append(f'{cell} ({title})')
dups = sorted({n for n in nums if nums.count(n) > 1})
if dups:
    errors.append(f'один номер у нескольких документов: {[c for c, n in zip(cells, nums) if n in dups]} — '
                  'у каждого документа проекта свой номер')

nxt = max(nums + legacy) + 1 if (nums or legacy) else 1
number = f'{prefix}{nxt:0{width}d}'
taken = [f for f in os.listdir('.') if number in f]
if taken:
    errors.append(f'файлы с номером {number} уже есть в папке: {taken}')

last = cells[nums.index(max(nums))] if nums else None
print(f'Реестр: {a.finance} · префикс проекта {prefix} · документов с номером: {len(nums)}'
      + (f' · последний: {last}' if last else ''))
if errors:
    print('✖ ОСТАНОВКА, номер не выдан:'); [print('  —', e) for e in errors]; sys.exit(1)
print(f'✔ Следующий номер документа (договор, счёт, акт или допсоглашение — любой): {number}')
if not nums:
    print(f'  Первый документ проекта — обычно договор: {number}; первый счёт тогда получит следующий номер.')
