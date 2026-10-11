#!/usr/bin/env python3
"""Логотип FutureFlow в готовом PDF — тот же, что в assets/futureflow-logo.png (repo-notes, раздел 3.0).

python3 check-pdf-logo.py <файл.pdf>

Ищет на всех страницах картинки-логотипы (шире высоты в 3+ раза) и проверяет каждую: исходный размер 1418×304 px
(не пережата), основной цвет #3c8ad8 (не перекрашена и не «поплыла» от JPEG), на листе 24,6×5,3 мм. Хотя бы один
логотип должен быть. Код 1 — PDF не отдавать.
⚠ УРОК 30.09.2026: LibreOffice по умолчанию пережимает картинки в JPEG 291×62 — синий логотип в PDF счёта и договора
выходил пятнистым и другого оттенка, чем в Word и в отчётах. Отсюда docx-pdf.sh (экспорт без сжатия) и эта проверка.
"""
import sys
from collections import Counter
import pymupdf

W, H, BLUE, MM = 1418, 304, (0x3c, 0x8a, 0xd8), (24.6, 5.3)
doc = pymupdf.open(sys.argv[1])
found, bad = 0, []
for pn, page in enumerate(doc, 1):
    for info in page.get_image_info(xrefs=True):
        bb = pymupdf.Rect(info['bbox'])
        if not info['xref'] or bb.width < bb.height * 3:
            continue
        found += 1
        pm = pymupdf.Pixmap(doc, info['xref'])
        if pm.alpha or pm.n > 3:
            pm = pymupdf.Pixmap(pymupdf.csRGB, pm)
        px = [tuple(pm.samples[i:i + 3]) for i in range(0, len(pm.samples), pm.n)]
        color = Counter(c for c in px if c[2] - c[0] > 80).most_common(1)
        mm = (bb.width / 72 * 25.4, bb.height / 72 * 25.4)
        where = f'стр. {pn}'
        if (pm.width, pm.height) != (W, H):
            bad.append(f'{where}: логотип пережат до {pm.width}×{pm.height} px (нужно {W}×{H}) — экспорт без сжатия')
        if not color or color[0][0] != BLUE:
            bad.append(f'{where}: цвет логотипа {"#%02x%02x%02x" % color[0][0] if color else "не синий"} вместо #3c8ad8')
        if abs(mm[0] - MM[0]) > 0.3 or abs(mm[1] - MM[1]) > 0.3:
            bad.append(f'{where}: размер {mm[0]:.1f}×{mm[1]:.1f} мм вместо 24,6×5,3 мм')
if not found:
    bad.append('логотип FutureFlow в PDF не найден (нужен PNG из assets, не SVG и не текст)')
print('=== логотип в PDF:', 'ок (%d шт.: 1418×304 px, #3c8ad8, 24,6×5,3 мм)' % found if not bad else '\n  ✖ ' + '\n  ✖ '.join(bad))
sys.exit(1 if bad else 0)
