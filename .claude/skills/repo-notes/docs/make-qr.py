#!/usr/bin/env python3
"""QR для оплаты по ГОСТ Р 56042 — обязателен в КАЖДОМ счёте. Сумма — В КОПЕЙКАХ.
python3 make-qr.py <номер> <копейки> "<назначение>"
пример: python3 make-qr.py СФ-1556 8000000 "Оплата по счёту № СФ-1556 от 17.09.2026 г. (договор № 1545)"
  → Purpose=Оплата по счёту № СФ-1556 от 17.09.2026 г. (договор № 1545). Без НДС
«Без НДС» в назначении платежа обязательно (решение Adrian 04.10.2026: банки требуют, чтобы у Заказчика
при оплате по QR назначение было с НДС-пометкой) — скрипт дописывает его сам, писать в аргументе не нужно.
Вставка в docx — 144 px (~3,8 см) между суммой прописью и подписью."""
import sys, qrcode
num, kop, purpose = sys.argv[1], sys.argv[2], sys.argv[3].strip()
if 'БЕЗ НДС' not in purpose.upper() and 'НДС НЕ ОБЛАГАЕТСЯ' not in purpose.upper():
    purpose = purpose.rstrip('. ') + '. Без НДС'
data = ('ST00012|Name=ИП Зайдель Адриан Патрик|PersonalAcc=40802810800008299634|BankName=АО «ТБанк»|'
        'BIC=044525974|CorrespAcc=30101810145250000974|PayeeINN=772590578053|Sum=%s|Purpose=%s' % (kop, purpose))
out = 'qr-%s.png' % num.replace('/', '-')
qrcode.make(data).save(out)
print(out); print(data)
