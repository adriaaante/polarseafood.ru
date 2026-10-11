#!/usr/bin/env python3
"""Сборка нового сайта ПОЛАР.

1. _materials/content/content.json (контент, собранный с polarseafood.ru) -> site/assets/js/data.js
2. Общие куски (шапка, подвал, модальные окна) из tools/partials/*.html вставляются во все site/*.html
   между маркерами <!--@name--> ... <!--/@name-->. Страницы правятся руками, общие куски — только в partials.
Запуск: python3 tools/build.py
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CONTENT = json.loads((ROOT / "_materials/content/content.json").read_text())

# Порядок и подписи разделов каталога; промо-страницы kalmar-polar и mintay-rzk дублируют товары — не выводим.
CATS = [
    ("krevetki", "Креветки", "shrimp"),
    ("morskie-delikatesy", "Морские деликатесы", "squid"),
    ("ryba-file-i-stejki", "Рыба, филе и стейки", "fish"),
    ("porcionnoe-file", "Порционное филе и фарш", "fillet"),
    ("kulinarnye-polufabrikaty", "Кулинарные полуфабрикаты", "pan"),
    ("chef-polar", "Chef Polar", "brand"),
    ("elit-polar", "Элит ПОЛАР", "brand"),
    ("cross-fish", "Cross Fish", "brand"),
    ("medvegonok", "Медвежонок", "brand"),
    ("ovoshchi-yagody-griby", "Овощи и ягоды", "berry"),
]
FIXES = {"908/120": "90/120"}  # опечатка исходного сайта (/krevetki)


def slugify(s):
    tr = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", ["a","b","v","g","d","e","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sch","","y","","e","yu","ya"]))
    s = "".join(tr.get(c, c) for c in s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def is_bulk(p):
    sec = (p.get("section") or "").lower()
    w = (p.get("weight") or "").lower()
    return "весов" in sec or "сырьев" in sec or bool(re.search(r"\b(3|5|10|22|25)\s*кг", w)) or w.startswith("весов")


def build_data():
    by = {c["slug"]: c for c in CONTENT["categories"]}
    cats, products, seen = [], [], set()
    for slug, title, icon in CATS:
        c = by[slug]
        items = []
        for p in c["products"]:
            pid = slugify(p["name"])
            while pid in seen:
                pid += "-2"
            seen.add(pid)
            size = p.get("size")
            for a, b in FIXES.items():
                size = size.replace(a, b) if size else size
            items.append({
                "id": pid, "cat": slug, "name": p["name"], "weight": p.get("weight"), "size": size,
                "desc": p.get("desc"), "section": p.get("section"), "img": p["image"],
                "bulk": is_bulk(p),
                "badge": "Российский знак качества" if "Минтай (порционное" in p["name"] else None,
            })
        products += items
        cats.append({"slug": slug, "title": title, "icon": icon, "count": len(items),
                     "text": c.get("description", ""), "src": c.get("url"),
                     "cover": next((i["img"] for i in items if not i["bulk"]), items[0]["img"])})
    news = sorted(CONTENT["news"], key=lambda n: n["date"], reverse=True)
    data = {
        "cats": cats, "products": products, "news": news, "recipes": CONTENT["recipes"],
        "articles": CONTENT["articles"], "media": [m for m in CONTENT["media"] if m.get("url")],
        "charity": CONTENT["charity"], "awards": {"highlights": CONTENT["awards"]["highlights"]},
        "countries": CONTENT["about"]["supplier_countries"],
    }
    js = "/* Сгенерировано tools/build.py из _materials/content/content.json — руками не править */\nwindow.POLAR=" + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (SITE / "assets/js/data.js").write_text(js)
    return len(products)


def inject_partials():
    parts = {p.stem: p.read_text().strip() for p in (ROOT / "tools/partials").glob("*.html")}
    for page in SITE.glob("*.html"):
        html = page.read_text()
        for name, body in parts.items():
            html = re.sub(rf"<!--@{name}-->.*?<!--/@{name}-->", lambda m: f"<!--@{name}-->\n{body}\n<!--/@{name}-->", html, flags=re.S)
        page.write_text(html)


if __name__ == "__main__":
    n = build_data()
    inject_partials()
    print(f"data.js: {n} товаров; partials вставлены в {len(list(SITE.glob('*.html')))} стр.")
