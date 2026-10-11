#!/usr/bin/env python3
"""Сборка нового сайта ПОЛАР.

1. _materials/content/content.json (контент, собранный с polarseafood.ru) -> site/assets/js/data.js
2. Страницы товаров site/tovar/<id>.html — по одной на позицию (для поиска: свой адрес, title, H1, Product schema).
3. Готовый HTML каталога и разделов главной вставляется в страницы между <!--@gen:имя--> … <!--/@gen:имя-->,
   чтобы поисковик видел каталог без JavaScript.
4. Общие куски (шапка, подвал, модалки) из tools/partials/*.html — во все страницы между <!--@имя--> … <!--/@имя-->.
5. Open Graph по title/description каждой страницы, sitemap.xml и robots.txt.
Страницы правятся руками, общие куски и сгенерированные блоки — только здесь и в partials.
Запуск: python3 tools/build.py
"""
import html, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CONTENT = json.loads((ROOT / "_materials/content/content.json").read_text())
URL = "https://www.polarseafood.ru/"   # боевой адрес; превью на GitHub Pages подменяет его при деплое
DATE = "2026-10-11"

# Порядок и подписи разделов каталога; промо-страницы kalmar-polar и mintay-rzk дублируют товары — не выводим.
CATS = [
    ("krevetki", "Креветки", "ПОЛАР"),
    ("morskie-delikatesy", "Морские деликатесы", "ПОЛАР"),
    ("ryba-file-i-stejki", "Рыба, филе и стейки", "ПОЛАР"),
    ("porcionnoe-file", "Порционное филе и фарш", "ПОЛАР"),
    ("kulinarnye-polufabrikaty", "Кулинарные полуфабрикаты", "ПОЛАР"),
    ("chef-polar", "Chef Polar", "Chef Polar"),
    ("elit-polar", "Элит ПОЛАР", "Элит ПОЛАР"),
    ("cross-fish", "Cross Fish", "Cross Fish"),
    ("medvegonok", "Медвежонок", "Медвежонок"),
    ("ovoshchi-yagody-griby", "Овощи и ягоды", "ПОЛАР"),
]
FIXES = {"908/120": "90/120"}  # опечатка исходного сайта (/krevetki)
e = lambda s: html.escape(str(s or ""), quote=True)


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
    for slug, title, brand in CATS:
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
                "desc": p.get("desc"), "section": p.get("section"), "img": p["image"], "brand": brand,
                "bulk": is_bulk(p),
                "badge": "Российский знак качества" if "Минтай (порционное" in p["name"] else None,
            })
        products += items
        cats.append({"slug": slug, "title": title, "count": len(items),
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
    return data


# ---------- HTML-фрагменты (та же разметка, что строит assets/js/main.js — менять вместе) ----------
def card(p, base=""):
    flag = f'<span class="pill coral flag">★ {e(p["badge"])}</span>' if p["badge"] else ('<span class="pill dark flag">Опт</span>' if p["bulk"] else "")
    size = f'<span class="pill">калибр {e(p["size"].split(",")[0])}{"…" if "," in p["size"] else ""}</span>' if p["size"] else ""
    weight = f'<span class="pill">{e(p["weight"])}</span>' if p["weight"] else ""
    return (f'<article class="pcard" data-pid="{p["id"]}">{flag}'
            f'<button class="add" type="button" data-add="{p["id"]}" aria-label="Добавить в запрос прайса" aria-pressed="false"><svg><use href="#i-plus"/></svg></button>'
            f'<div class="ph"><img src="{base}{p["img"]}" alt="{e(p["name"])}" loading="lazy" decoding="async"></div>'
            f'<div class="pb"><a class="pn" href="{base}tovar/{p["id"]}.html">{e(p["name"])}</a><div class="pm">{weight}{size}</div></div></article>')


def gen_blocks(d):
    cats = d["cats"]
    catalog = "".join(
        f'<section class="cat-section" id="{c["slug"]}"><h2>{e(c["title"])} <small>{c["count"]}</small></h2>'
        f'<p class="cdesc">{e(c["text"])}</p><div class="pgrid">'
        + "".join(card(p) for p in d["products"] if p["cat"] == c["slug"]) + "</div></section>" for c in cats)
    home_cats = "".join(
        f'<a class="cat rv{" d" + str(i % 3) if i % 3 else ""}" href="catalog.html#{c["slug"]}"><div class="img"><img src="{c["cover"]}" alt="{e(c["title"])}" loading="lazy"></div><b>{e(c["title"])}</b><small>{c["count"]} позиций</small></a>'
        for i, c in enumerate(cats)) + \
        f'<a class="cat wide rv" href="catalog.html"><div class="img" style="justify-items:start;align-content:center"><b style="font-size:22px">Весь каталог</b><small>{len(d["products"])} позиций, фасованная и весовая продукция</small></div></a>'
    return {"catalog": catalog, "home-cats": home_cats}


PRODUCT = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}tovar/{id}.html">
<meta name="theme-color" content="#061A2E">
<link rel="icon" href="../assets/img/favicon.ico"><link rel="apple-touch-icon" href="../assets/img/apple-touch-icon.png">
<link rel="preload" href="../assets/fonts/manrope-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../assets/css/style.css">
<script type="application/ld+json">{ld}</script>
</head>
<body>
<!--@header--><!--/@header-->
<main>
<section class="phero sm"><div class="frost-bg"></div>
  <div class="wrap" style="position:relative">
    <nav class="crumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a> / <a href="../catalog.html">Продукция</a> / <a href="../catalog.html#{cat}">{cat_title}</a></nav>
  </div>
</section>
<section class="sec" style="padding-top:28px">
  <div class="wrap">
    <div class="pd pd-page">
      <div class="ph">{flag}<img src="../{img}" alt="{name}" fetchpriority="high"></div>
      <div>
        <p class="eyebrow">{brand} · {cat_title}</p>
        <h1 style="font-size:clamp(26px,4vw,44px)">{name}</h1>
        <p class="lead" style="font-size:17px">{lead}</p>
        <dl class="spec">{rows}</dl>
        <div class="acts"><button class="btn btn-brand" data-add="{id}" data-label="1"><svg><use href="#i-plus"/></svg> Добавить в запрос</button><button class="btn btn-line" data-open="price">Узнать цену</button></div>
        <p class="note">Состав, пищевая ценность, сроки хранения и документы о качестве — пришлём вместе с прайсом. <a class="link-arrow" href="../gde-kupit.html">Где купить</a></p>
      </div>
    </div>
  </div>
</section>
<section class="sec" style="padding-top:0">
  <div class="wrap">
    <div class="tile" style="min-height:0"><p class="eyebrow">О разделе «{cat_title}»</p><p style="color:var(--muted);margin:0">{cat_text}</p></div>
  </div>
</section>
<section class="sec" style="padding-top:0;overflow:hidden">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Ещё в разделе</p><h2>{cat_title}</h2></div><a class="link-arrow" href="../catalog.html#{cat}">Весь раздел</a></div>
    <div class="rail">{related}</div>
  </div>
</section>
</main>
<!--@footer--><!--/@footer-->
<!--@modals--><!--/@modals-->
<script src="../assets/js/data.js" defer></script>
<script src="../assets/js/main.js" defer></script>
</body>
</html>
"""


def build_products(d):
    out = SITE / "tovar"
    out.mkdir(exist_ok=True)
    for f in out.glob("*.html"):
        f.unlink()
    cats = {c["slug"]: c for c in d["cats"]}
    for p in d["products"]:
        c = cats[p["cat"]]
        fmt = "весовая продукция для опта и HoReCa" if p["bulk"] else "фасованная продукция для розницы"
        bits = [p["desc"], f"фасовка {p['weight']}" if p["weight"] else "", f"калибр {p['size']}" if p["size"] else ""]
        lead = f"{p['name']} от производителя ПОЛАР: " + ", ".join(b for b in bits if b) + f". {fmt.capitalize()}."
        rows = [("Марка", p["brand"]), ("Раздел", c["title"]), ("Фасовка", p["weight"]), ("Калибр", p["size"]),
                ("Обработка", p["desc"]), ("Формат", fmt.capitalize()), ("Производитель", "ООО «ПОЛАР СИФУД РАША», Калужская обл.")]
        if p["badge"]:
            rows.insert(0, ("Знак качества", p["badge"]))
        ld = [{"@context": "https://schema.org", "@type": "Product", "name": p["name"], "image": URL + p["img"],
               "description": lead, "brand": {"@type": "Brand", "name": p["brand"]}, "category": c["title"],
               "manufacturer": {"@type": "Organization", "name": "ООО «ПОЛАР СИФУД РАША»", "url": URL}},
              {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                  {"@type": "ListItem", "position": 1, "name": "Главная", "item": URL},
                  {"@type": "ListItem", "position": 2, "name": "Продукция", "item": URL + "catalog.html"},
                  {"@type": "ListItem", "position": 3, "name": c["title"], "item": URL + "catalog.html#" + c["slug"]},
                  {"@type": "ListItem", "position": 4, "name": p["name"]}]}]
        title = f"{p['name']}" + (f", {p['weight']}" if p["weight"] else "") + " — купить оптом от производителя | ПОЛАР"
        desc = (lead + " Запросите прайс-лист и условия поставки.")[:300]
        related = [q for q in d["products"] if q["cat"] == p["cat"] and q["id"] != p["id"]][:8]
        page = PRODUCT.format(
            title=e(title), desc=e(desc), url=URL, id=p["id"], ld=json.dumps(ld, ensure_ascii=False),
            cat=c["slug"], cat_title=e(c["title"]), brand=e(p["brand"]), name=e(p["name"]), img=p["img"], lead=e(lead),
            flag=f'<span class="pill coral flag">★ {e(p["badge"])}</span>' if p["badge"] else "",
            rows="".join(f"<div><dt>{a}</dt><dd>{e(b)}</dd></div>" for a, b in rows if b),
            cat_text=e(c["text"]), related="".join(card(q, "../") for q in related))
        (out / f"{p['id']}.html").write_text(page)
    return len(d["products"])


def rebase(fragment, base):
    """Относительные ссылки фрагмента — для страниц во вложенной папке."""
    if not base:
        return fragment
    return re.sub(r'((?:href|src|srcset)=")(?!https?:|mailto:|tel:|#|data:|/)', rf"\1{base}", fragment)


def og(html_text, path):
    t = re.search(r"<title>(.*?)</title>", html_text, re.S).group(1)
    dm = re.search(r'<meta name="description" content="([^"]*)"', html_text)
    tags = (f'<meta property="og:type" content="website"><meta property="og:site_name" content="ПОЛАР">'
            f'<meta property="og:title" content="{t}"><meta property="og:description" content="{dm.group(1) if dm else ""}">'
            f'<meta property="og:url" content="{URL}{path}"><meta property="og:image" content="{URL}assets/img/og.jpg">'
            f'<meta property="og:locale" content="ru_RU"><meta name="twitter:card" content="summary_large_image">')
    html_text = re.sub(r'<meta (property="og:[^"]+"|name="twitter:[^"]+")[^>]*>', "", html_text)
    return re.sub(r'(<meta name="description"[^>]*>)', lambda m: m.group(1) + "\n" + tags, html_text, count=1)


def inject(d):
    parts = {p.stem: p.read_text().strip() for p in (ROOT / "tools/partials").glob("*.html")}
    gens = gen_blocks(d)
    pages = sorted(SITE.glob("*.html")) + sorted((SITE / "tovar").glob("*.html"))
    for page in pages:
        base = "../" if page.parent.name == "tovar" else ""
        h = page.read_text()
        for name, body in parts.items():
            h = re.sub(rf"<!--@{name}-->.*?<!--/@{name}-->", lambda m: f"<!--@{name}-->\n{rebase(body, base)}\n<!--/@{name}-->", h, flags=re.S)
        for name, body in gens.items():
            h = re.sub(rf"<!--@gen:{name}-->.*?<!--/@gen:{name}-->", lambda m: f"<!--@gen:{name}-->{body}<!--/@gen:{name}-->", h, flags=re.S)
        rel = page.relative_to(SITE).as_posix()
        if page.name != "404.html":
            h = og(h, "" if rel == "index.html" else rel)
        page.write_text(h)
    return pages


def sitemap(pages):
    urls = [p.relative_to(SITE).as_posix() for p in pages if p.name != "404.html"]
    pr = {"index.html": "1.0", "catalog.html": "0.9", "partners.html": "0.9", "gde-kupit.html": "0.8"}
    body = "".join(f"<url><loc>{URL}{'' if u == 'index.html' else u}</loc><lastmod>{DATE}</lastmod><priority>{pr.get(u, '0.6' if u.startswith('tovar/') else '0.7')}</priority></url>" for u in urls)
    (SITE / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>\n')
    (SITE / "robots.txt").write_text(f"User-agent: *\nDisallow:\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid\n\nSitemap: {URL}sitemap.xml\n")
    return len(urls)


if __name__ == "__main__":
    data = build_data()
    n = build_products(data)
    pages = inject(data)
    s = sitemap(pages)
    print(f"data.js: {len(data['products'])} товаров; страниц товаров: {n}; partials и OG: {len(pages)} стр.; sitemap: {s} адресов")
