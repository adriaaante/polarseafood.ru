#!/bin/bash
# DOCX → PDF через LibreOffice БЕЗ сжатия картинок + проверка логотипа (repo-notes, раздел 3.0).
# ./docx-pdf.sh "Счёт №ДС-002 (55 000).docx"        → рядом «Счёт №ДС-002 (55 000).pdf»
# По умолчанию LibreOffice пережимает картинки в JPEG и уменьшает разрешение: логотип и QR выходят пятнистыми,
# синий «плывёт» (урок 30.09.2026). Здесь — lossless и без уменьшения. Кириллица в имени мешает soffice — копия в tmp.
set -euo pipefail
in=$(readlink -f "$1"); out="${in%.docx}.pdf"
command -v soffice >/dev/null || { echo "нет LibreOffice: apt-get update && apt-get install -y libreoffice-writer-nogui"; exit 1; }
tmp=$(mktemp -d); cp "$in" "$tmp/doc.docx"
soffice --headless --convert-to \
  'pdf:writer_pdf_Export:{"UseLosslessCompression":{"type":"boolean","value":"true"},"ReduceImageResolution":{"type":"boolean","value":"false"}}' \
  --outdir "$tmp" "$tmp/doc.docx" >/dev/null 2>&1 || true   # soffice может вернуть ненулевой код и при успехе — судим по файлу
[ -f "$tmp/doc.pdf" ] || { echo "✖ LibreOffice не собрал PDF (нужен libreoffice-writer-nogui)"; rm -rf "$tmp"; exit 1; }
cp "$tmp/doc.pdf" "$out"; rm -rf "$tmp"
echo "PDF: $out"
python3 "$(dirname "$(readlink -f "$0")")/check-pdf-logo.py" "$out"
