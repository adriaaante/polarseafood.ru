/* ПОЛАР — общая логика всех страниц. Данные каталога — window.POLAR (assets/js/data.js). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const D = window.POLAR || { cats: [], products: [] };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- header, menu, tabbar ---------- */
  const hdr = $("#hdr"), tab = $("#tabbar");
  let lastY = 0;
  const onScroll = () => {
    const y = scrollY;
    hdr && hdr.classList.toggle("solid", y > 40);
    if (tab) tab.classList.toggle("hide", y > lastY + 4 && y > 400 && !document.body.classList.contains("menu-open"));
    if (tab && y < lastY - 4) tab.classList.remove("hide");
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("#burger");
  burger && burger.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    burger.setAttribute("aria-expanded", open);
  });
  $$("#mmenu a").forEach(a => a.addEventListener("click", () => document.body.classList.remove("menu-open")));
  const here = location.pathname.split("/").pop() || "index.html";
  $$(".nav a").forEach(a => { if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page"); });

  /* ---------- reveal on scroll ---------- */
  $$(".split-words").forEach(el => {
    el.innerHTML = el.innerHTML.split(/(<[^>]+>|\s+)/).map(t => (!t.trim() || t.startsWith("<")) ? t : `<span class="w"><span>${t}</span></span>`).join("");
    $$(".w>span", el).forEach((s, i) => s.style.transitionDelay = (i * 0.06) + "s");
  });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  const observe = r => $$(".rv,.split-words", r).forEach(el => io.observe(el));
  observe(document);

  /* ---------- counters ---------- */
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target, to = +el.dataset.count, dur = 1600, t0 = performance.now();
    const fmt = n => to < 3000 ? String(n) : n.toLocaleString("ru-RU");
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 4))); el.textContent = fmt(v) + (el.dataset.suf || ""); if (k < 1) requestAnimationFrame(step); };
    reduce ? (el.textContent = fmt(to) + (el.dataset.suf || "")) : requestAnimationFrame(step);
    cio.unobserve(el);
  }), { threshold: .5 });
  $$("[data-count]").forEach(el => cio.observe(el));

  /* ---------- snow / ice particles (hero) ---------- */
  const cv = $("#snow");
  if (cv && !reduce) {
    const ctx = cv.getContext("2d");
    let W, H, P = [], mx = 0, my = 0, run = true;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const size = () => { W = cv.width = cv.offsetWidth * dpr; H = cv.height = cv.offsetHeight * dpr; const n = Math.round(Math.min(140, W * H / (dpr * dpr) / 9000)); P = Array.from({ length: n }, () => mk(true)); };
    const mk = (any) => ({ x: Math.random() * W, y: any ? Math.random() * H : -10, r: (Math.random() * 1.8 + .4) * dpr, s: (Math.random() * .5 + .15) * dpr, d: Math.random() * Math.PI * 2, o: Math.random() * .6 + .25 });
    addEventListener("resize", size); size();
    addEventListener("pointermove", e => { mx = (e.clientX / innerWidth - .5); my = (e.clientY / innerHeight - .5); }, { passive: true });
    new IntersectionObserver(([e]) => { run = e.isIntersecting; if (run) requestAnimationFrame(loop); }).observe(cv);
    function loop() {
      if (!run || document.hidden) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.d += .01; p.y += p.s; p.x += Math.sin(p.d) * .3 * dpr + mx * .6 * dpr;
        if (p.y > H + 10 || p.x < -10 || p.x > W + 10) Object.assign(p, mk(false), { x: Math.random() * W });
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        g.addColorStop(0, `rgba(235,250,255,${p.o})`); g.addColorStop(1, "rgba(191,232,243,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, 7); ctx.fill();
      }
      requestAnimationFrame(loop);
    }
    document.addEventListener("visibilitychange", () => !document.hidden && run && requestAnimationFrame(loop));
    requestAnimationFrame(loop);
    const bg = $(".hero-bg img");
    bg && addEventListener("scroll", () => { const y = scrollY; if (y < innerHeight) bg.style.translate = `0 ${y * .25}px`; }, { passive: true });
  }

  /* ---------- tilt on cards (desktop) ---------- */
  if (!reduce && matchMedia("(hover:hover)").matches) {
    document.addEventListener("pointermove", e => {
      const c = e.target.closest?.(".cat,.path");
      if (!c) return;
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
      c.onpointerleave = () => c.style.transform = "";
    });
  }

  /* ---------- rails ---------- */
  $$("[data-rail]").forEach(nav => {
    const rail = $(nav.dataset.rail);
    $$("button", nav).forEach(b => b.addEventListener("click", () => rail.scrollBy({ left: (b.dataset.dir === "next" ? 1 : -1) * rail.clientWidth * .8, behavior: "smooth" })));
  });

  /* ---------- chain (ocean → shelf) ---------- */
  const steps = $$(".step"), media = $$(".chain-media img"), prog = $(".steps .prog"), stepsBox = $(".steps");
  if (steps.length) {
    const sio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const i = steps.indexOf(e.target);
      steps.forEach((s, j) => s.classList.toggle("on", j <= i));
      media.forEach((m, j) => m.classList.toggle("on", j === i));
      const cap = $(".chain-media .cap"); cap && (cap.textContent = e.target.dataset.cap || "");
    }), { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(s => sio.observe(s));
    addEventListener("scroll", () => {
      const r = stepsBox.getBoundingClientRect(), k = Math.min(1, Math.max(0, (innerHeight * .55 - r.top) / r.height));
      prog.style.height = (k * (r.height - 16)) + "px";
    }, { passive: true });
  }

  /* ---------- request list (B2B «собрать запрос») ---------- */
  const RKEY = "polar-req";
  const store = { get() { try { return JSON.parse(localStorage.getItem(RKEY)) || []; } catch { return []; } }, set(v) { try { localStorage.setItem(RKEY, JSON.stringify(v)); } catch { } } };
  let req = store.get().filter(id => D.products.some(p => p.id === id));
  const byId = id => D.products.find(p => p.id === id);
  const toast = msg => { const t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200); };
  const syncReq = () => {
    store.set(req);
    $$("[data-add]").forEach(b => { const on = req.includes(b.dataset.add); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.querySelector("use")?.setAttribute("href", on ? "#i-check" : "#i-plus"); if (b.dataset.label) b.lastChild.textContent = on ? " В запросе" : " Добавить в запрос"; });
    $$("[data-req]").forEach(box => box.innerHTML = req.map(id => `<span>${esc(byId(id)?.name)}<button type="button" data-rm="${id}" aria-label="Убрать">×</button></span>`).join(""));
    const bar = $("#reqbar"); if (bar) { bar.classList.toggle("show", req.length > 0); $("b", bar).textContent = req.length; }
  };
  document.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) { e.stopPropagation(); const id = add.dataset.add; req = req.includes(id) ? req.filter(x => x !== id) : [...req, id]; syncReq(); toast(req.includes(id) ? "Добавлено в запрос прайса" : "Убрано из запроса"); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) { req = req.filter(x => x !== rm.dataset.rm); syncReq(); }
  });

  /* ---------- modals ---------- */
  let lastFocus;
  const openModal = id => { const m = $("#" + id); if (!m) return; lastFocus = document.activeElement; m.classList.add("open"); document.body.style.overflow = "hidden"; setTimeout(() => $("input:not([type=radio]),button.x", m)?.focus(), 350); };
  const closeModal = m => { m.classList.remove("open"); document.body.style.overflow = ""; if (m.id === "m-product" && location.hash.startsWith("#p=")) history.replaceState(null, "", location.pathname + location.search); lastFocus?.focus?.(); };
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); $$(".modal.open").forEach(closeModal); openModal("m-" + o.dataset.open); }
    const c = e.target.closest("[data-close]"); if (c) closeModal(c.closest(".modal"));
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $$(".modal.open").forEach(closeModal); });

  /* product card + details */
  const catTitle = slug => D.cats.find(c => c.slug === slug)?.title || "";
  const card = p => `<article class="pcard" data-pid="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
      ${p.badge ? `<span class="pill coral flag">★ ${esc(p.badge)}</span>` : p.bulk ? `<span class="pill dark flag">Опт</span>` : ""}
      <button class="add" data-add="${p.id}" aria-label="Добавить в запрос прайса" aria-pressed="false"><svg><use href="#i-plus"/></svg></button>
      <div class="ph"><img src="${p.img}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>
      <div class="pb"><div class="pn">${esc(p.name)}</div><div class="pm">${p.weight ? `<span class="pill">${esc(p.weight)}</span>` : ""}${p.size ? `<span class="pill">калибр ${esc(p.size.split(",")[0])}${p.size.includes(",") ? "…" : ""}</span>` : ""}</div></div>
    </article>`;
  window.POLAR_CARD = card;
  const showProduct = id => {
    const p = byId(id); if (!p) return;
    const rows = [["Раздел", catTitle(p.cat)], ["Фасовка", p.weight], ["Калибр", p.size], ["Обработка", p.desc], ["Формат", p.bulk ? "Весовая продукция для опта и HoReCa" : "Фасованная продукция для розницы"]].filter(r => r[1]);
    $("#pd").innerHTML = `<div class="pd"><div class="ph"><img src="${p.img}" alt="${esc(p.name)}"></div><div>
      <p class="eyebrow">${esc(catTitle(p.cat))}</p><h3>${esc(p.name)}</h3>
      ${p.badge ? `<p><span class="pill coral">★ ${esc(p.badge)}</span></p>` : ""}
      <dl class="spec">${rows.map(r => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join("")}</dl>
      <div class="acts"><button class="btn btn-brand" data-add="${p.id}" data-label="1"><svg><use href="#i-plus"/></svg> Добавить в запрос</button><button class="btn btn-line" data-open="price">Узнать цену</button></div>
      <p class="note">Состав, пищевая ценность и документы о качестве — отправим вместе с прайсом. <a class="link-arrow" href="gde-kupit.html">Где купить</a></p>
    </div></div>`;
    syncReq(); openModal("m-product");
    if (!location.hash.startsWith("#p=" + id)) history.replaceState(null, "", "#p=" + id);
  };
  document.addEventListener("click", e => { const c = e.target.closest(".pcard"); if (c && !e.target.closest("[data-add]")) showProduct(c.dataset.pid); });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList?.contains("pcard")) showProduct(e.target.dataset.pid); });

  /* ---------- forms ---------- */
  const mask = inp => inp.addEventListener("input", () => {
    let d = inp.value.replace(/\D/g, ""); if (!d) { inp.value = ""; return; }
    if (d[0] === "8") d = "7" + d.slice(1); if (d[0] !== "7") d = "7" + d; d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    inp.value = "+7" + (p[0] ? ` (${p[0]}` : "") + (p[0].length === 3 ? ")" : "") + (p[1] ? ` ${p[1]}` : "") + (p[2] ? `-${p[2]}` : "") + (p[3] ? `-${p[3]}` : "");
  });
  $$("input[type=tel]").forEach(mask);
  document.addEventListener("input", e => { e.target.closest?.(".field")?.classList.remove("err"); if (e.target.name === "consent") e.target.closest(".consent").classList.remove("err"); });
  $$("form.pform").forEach(f => f.addEventListener("submit", async e => {
    e.preventDefault();
    const v = n => f.elements[n]?.value.trim() || "";
    const bad = [];
    const setErr = (n, on) => { const el = f.elements[n]?.closest(".field"); el && el.classList.toggle("err", on); if (on) bad.push(n); };
    setErr("name", !v("name"));
    setErr("phone", v("phone").replace(/\D/g, "").length !== 11);
    setErr("email", !!v("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email")));
    const cons = f.elements.consent; cons.closest(".consent").classList.toggle("err", !cons.checked); if (!cons.checked) bad.push("consent");
    if (bad.length) { (f.elements[bad[0]]?.focus?.()); return; }
    const data = Object.fromEntries(new FormData(f)); data.items = req.map(id => byId(id)?.name).filter(Boolean); data.page = location.href;
    // Куда уходят заявки, задаётся при запуске (window.POLAR_FORM_ENDPOINT — CRM / Telegram-бот / почтовый шлюз).
    let sent = false;
    if (window.POLAR_FORM_ENDPOINT) { try { sent = (await fetch(window.POLAR_FORM_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).ok; } catch { } }
    if (!sent) {
      const body = `Тип клиента: ${data.type || "-"}\nИмя: ${data.name}\nТелефон: ${data.phone}\nE-mail: ${data.email || "-"}\nГород: ${data.city || "-"}\nПозиции: ${data.items.join("; ") || "-"}\nКомментарий: ${data.comment || "-"}`;
      location.href = `mailto:info@polarseafood.ru?subject=${encodeURIComponent("Запрос прайс-листа с сайта")}&body=${encodeURIComponent(body)}`;
    }
    f.innerHTML = `<div class="success"><div class="ok"><svg width="34" height="34"><use href="#i-check"/></svg></div><h3>Заявка принята</h3><p style="color:var(--muted)">Менеджер свяжется с вами в рабочее время${data.email ? " и пришлёт прайс на " + esc(data.email) : ""}.</p><a class="btn btn-line" href="catalog.html">Вернуться в каталог</a></div>`;
    req = []; syncReq();
  }));

  /* ---------- lazy map ---------- */
  $$("[data-map]").forEach(b => b.addEventListener("click", () => {
    const box = b.closest(".mapbox");
    box.innerHTML = `<iframe src="${b.dataset.map}" loading="lazy" title="Карта" allowfullscreen></iframe>`;
  }));

  /* ---------- render helpers for pages ---------- */
  $$("[data-products]").forEach(box => {
    const ids = box.dataset.products.split(",");
    box.innerHTML = ids.map(byId).filter(Boolean).map(card).join("");
  });
  syncReq();
  if (location.hash.startsWith("#p=")) setTimeout(() => showProduct(location.hash.slice(3)), 300);
  window.POLAR_UI = { card, syncReq, observe, showProduct, catTitle, esc };
})();
