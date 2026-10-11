#!/bin/bash
# HTML → PDF headless-Chromium'ом + проверка: страниц в PDF столько же, сколько блоков .page.
# ./build-pdf.sh report.html report.pdf
set -euo pipefail
in=$(readlink -f "$1"); out=$(readlink -f "${2:-${1%.html}.pdf}")
CH=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
"$CH" --headless --no-sandbox --disable-gpu --no-pdf-header-footer --print-to-pdf="$out" "file://$in" 2>/dev/null
pages=$(python3 -c "import re,sys;print(len(re.findall(rb'/Type\s*/Page[^s]',open(sys.argv[1],'rb').read())))" "$out")
blocks=$(python3 -c "import re,sys;s=re.sub(r'<!--.*?-->','',open(sys.argv[1],encoding='utf-8').read(),flags=re.S);print(len(re.findall(r'<section class=.page[ \"]',s)))" "$in")
echo "PDF: $out — страниц $pages, блоков .page $blocks"
[ "$pages" = "$blocks" ] || { echo "⚠ НЕ СОВПАДАЕТ: какой-то блок не влез на лист или не подцепился CSS/шрифт"; exit 1; }
python3 "$(dirname "$(readlink -f "$0")")/check-pdf-logo.py" "$out"   # логотип: тот же PNG, #3c8ad8, 24,6×5,3 мм (3.0)
