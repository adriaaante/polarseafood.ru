#!/usr/bin/env node
// Связь проекта с FutureFlow CRM (https://crm.futureflow.ru): документы проекта видны в CRM, счета CRM — в реестре проекта.
// Без зависимостей (Node 18+). Запускать из корня репозитория проекта.
//
//   node $SK/scripts/crm.js sync          — ГЛАВНОЕ: перед выдачей номера и после каждого документа. В обе стороны:
//        1) из CRM: счета, акты, допсоглашения и договоры, созданные в CRM, — строкой в свою таблицу finance-log (next-number.py
//           их увидит), их файлы — в _materials/docs; оплаты, отмеченные в CRM, — в статус счёта;
//        2) каждый документ из таблиц finance-log («Договоры», «Счета», «Акты и соглашения») с файлами .docx/.pdf из
//           _materials/docs уходит в CRM; повторный запуск ничего не задваивает, «оплачен» в статусе — оплата в CRM.
//   node $SK/scripts/crm.js status        — что CRM знает о клиенте: следующий номер, неоплаченные счета, график
//   node $SK/scripts/crm.js paid КН-004 [ДД.ММ.ГГГГ]                     — отметить оплату счёта
//   node $SK/scripts/crm.js requisites    — реквизиты из _materials/docs/client.json в карточку клиента CRM (префикс — только если его нет)
//   node $SK/scripts/crm.js schedule <день> <сумма> [ГГГГ-ММ] ["строка услуги"] — цена по графику (с месяца — старая строка закроется)
//
// Ключ — переменная окружения FUTUREFLOW_CRM_API_KEY (настройки окружения claude.ai/code; выдаётся в CRM → «Настройки» →
// «Сессии проектов»). Без ключа скрипт ничего не ломает: предупреждает и выходит с кодом 0 — документ остаётся в репо.
// Репозиторий берётся из git remote origin (или FUTUREFLOW_CRM_REPO=owner/name), адрес CRM — FUTUREFLOW_CRM_URL.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = (process.env.FUTUREFLOW_CRM_URL || 'https://crm.futureflow.ru').replace(/\/$/, '');
const KEY = process.env.FUTUREFLOW_CRM_API_KEY || '';
const DOCS = '_materials/docs';
const LOG = '_materials/finance-log.md';

function repoName() {
  if (process.env.FUTUREFLOW_CRM_REPO) return process.env.FUTUREFLOW_CRM_REPO;
  const url = execFileSync('git', ['remote', 'get-url', 'origin']).toString().trim();
  const m = /([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  if (!m) throw new Error('Не понял репозиторий из ' + url + ' — задайте FUTUREFLOW_CRM_REPO=owner/name');
  return `${m[1]}/${m[2]}`;
}
async function api(method, url, body) {
  const opt = { method, headers: { authorization: 'Bearer ' + KEY } };
  if (body instanceof FormData) opt.body = body;
  else if (body) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `CRM ответила ${r.status}`), { status: r.status });
  return data;
}

// ---------- finance-log: таблицы документов ----------
const SECTIONS = [['Договоры', 'contract'], ['Счета', 'invoice'], ['Акты и соглашения', 'act']];
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
const toIso = (d) => { const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(d || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const kopOf = (s) => { const m = /(\d[\d\s ]*)(?:,(\d{2}))?/.exec(String(s || '').replace(/^\+/, '')); return m ? Number(m[1].replace(/\D/g, '')) * 100 + Number(m[2] || 0) : null; };
const strip = (s) => String(s || '').replace(/\*\*|`/g, '').trim();

function readLog(text, prefix) {
  const rows = [];
  const lines = text.split('\n');
  let sec = null, head = null;
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { sec = SECTIONS.find(([name]) => h[1].startsWith(name)) || null; head = null; continue; }
    if (!sec || !line.trim().startsWith('|')) continue;
    const c = cells(line);
    if (!head) { head = c.map((x) => x.toLowerCase()); continue; }
    if (/^:?-{3,}/.test(c[0])) continue;
    const col = (re) => { const i = head.findIndex((x) => re.test(x)); return i >= 0 ? strip(c[i]) : ''; };
    const cell = col(/^№|^документ/);   // «№» или «Документ» (у Сферикса): «СФ-1558», «Акт № 1» — без серии клиента не берём
    const number = (/[A-Za-zА-ЯЁ]{2}-\d{3,}/.exec(cell) || [])[0] || '';
    if (!number || (prefix && !number.startsWith(prefix))) continue;
    const basis = col(/основани|предмет/);
    const status = col(/статус/).toLowerCase();
    let type = sec[1];
    if (type === 'act' && /соглашени/i.test(cell + ' ' + basis + ' ' + col(/сумм/))) type = 'addendum';
    rows.push({ type, number, date: toIso(col(/дата/)), sum: col(/сумм|цена/), basis, status,
      paid: /оплачен/.test(status) && !/не\s*оплачен|ждём|ждем/.test(status), cancelled: /отмен|аннулир/.test(status) });
  }
  return rows;
}
// строка услуги счёта: первая «…» с «договор», иначе — без неё (в CRM подставится заголовок)
const itemOf = (basis) => (basis.match(/«([^»]{15,})»/g) || []).map((q) => q.slice(1, -1)).find((q) => /договор/i.test(q)) || '';

// файлы документа: в _materials/docs и подпапках (out/…); имя содержит номер целиком — «Счёт №КН-004 …», «Счёт № АД-1548 …»,
// «Счёт АД-1550 от …»; «КН-0021» за «КН-002» не принимается
function listDocs(dir, depth = 2) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? (depth > 1 && !/^(node_modules|img|\.)/.test(e.name) ? listDocs(path.join(dir, e.name), depth - 1) : [])
    : [path.join(dir, e.name)]);
}
// документ — по ПЕРВОМУ номеру в имени: «Доп. соглашение №КН-003 к договору №КН-001» — это КН-003, не договор КН-001
const firstNumber = (name) => (/(?:^|[^0-9A-Za-zА-Яа-яЁё])([A-Za-zА-ЯЁ]{2}-\d{3,})(?![0-9])/.exec(name) || [])[1];
function filesFor(number) {
  const hit = listDocs(DOCS).filter((f) => firstNumber(path.basename(f).normalize('NFC')) === number);
  return { docx: hit.find((f) => /\.docx$/i.test(f)), pdf: hit.find((f) => /\.pdf$/i.test(f)) };
}

async function push(repo, d) {
  const f = filesFor(d.number);
  const fd = new FormData();
  fd.set('repo', repo); fd.set('type', d.type); fd.set('number', d.number); fd.set('date', d.date);
  const kop = kopOf(d.sum);
  if (kop) fd.set('kop', String(kop));
  if (d.type === 'invoice') { const it = itemOf(d.basis); if (it) fd.set('item', it); }
  const title = path.basename(f.docx || f.pdf || '').normalize('NFC').replace(/\.(docx|pdf)$/i, '');
  if (title) fd.set('title', title);
  fd.set('note', 'из реестра проекта (finance-log)');
  for (const k of ['docx', 'pdf']) if (f[k]) fd.set(k, new Blob([fs.readFileSync(f[k])]), path.basename(f[k]).normalize('NFC'));
  const r = await api('POST', '/ext/v1/documents', fd);
  if (d.type === 'invoice' && d.paid) await api('POST', '/ext/v1/invoices/paid', { repo, number: d.number, date: d.date, note: 'оплачен по реестру проекта' });
  return { ...r, files: [f.docx, f.pdf].filter(Boolean).length };
}

// ---------- обратная сторона: CRM → реестр и файлы проекта ----------
const SEC_OF = { invoice: 'Счета', act: 'Акты и соглашения', addendum: 'Акты и соглашения', contract: 'Договоры' };
const fmtRub = (k) => (k / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 }).replace(/\u00a0/g, ' ') + ' ₽';
const ru = (d) => (d || '').split('-').reverse().join('.');
// таблицы реестра: раздел → { head, last (индекс последней строки таблицы), rows: { номер → индекс строки } }
function layout(lines) {
  const out = {};
  let sec = null, head = null;
  lines.forEach((line, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { sec = SECTIONS.find(([name]) => h[1].startsWith(name))?.[0] || null; head = null; return; }
    if (!sec || !line.trim().startsWith('|')) return;
    const c = cells(line);
    if (!head) { head = c.map((x) => x.toLowerCase()); out[sec] = out[sec] || { head, last: i, rows: {} }; out[sec].last = i; return; }
    out[sec].last = i;
    if (/^:?-{3,}/.test(c[0])) return;
    const ni = head.findIndex((x) => /^№|^документ/.test(x));
    const num = ni >= 0 && (/[A-Za-zА-ЯЁ]{2}-\d{3,}/.exec(c[ni]) || [])[0];
    if (num) out[sec].rows[num] = i;
  });
  return out;
}
// строка таблицы по её заголовку: № / Дата / Сумма|Цена / Основание|Предмет|Договор / Статус
function rowFor(head, v) {
  return '| ' + head.map((h) => /^№|^документ/.test(h) ? v.number : /дата/.test(h) ? v.date : /сумм|цена/.test(h) ? v.sum
    : /основани|предмет|договор/.test(h) ? v.basis : /статус/.test(h) ? v.status : '').join(' | ') + ' |';
}
function setStatus(line, head, status) {
  const c = cells(line), si = head.findIndex((x) => /статус/.test(x));
  if (si < 0) return line;
  c[si] = status;
  return '| ' + c.join(' | ') + ' |';
}
const ST = { issued: 'выставлен в CRM', sent: 'выставлен в CRM, отправлен', partial: 'оплачен частично (CRM)', paid: 'оплачен', cancelled: 'отменён' };
const NAME = { invoice: 'Счёт', act: 'Акт', addendum: 'Доп. соглашение', contract: 'Договор' };

// 1) документы, созданные в CRM, — строкой в свою таблицу; 2) оплаты из CRM — в статус счёта. Возвращает отчёт.
function pullIntoLog(text, c) {
  const lines = text.split('\n');
  const L = layout(lines);
  const added = [], paid = [];
  const crmItems = [...c.invoices.map((i) => ({ ...i, type: 'invoice' })), ...c.documents.filter((d) => d.number && SEC_OF[d.type])];
  const inserts = {};
  for (const it of crmItems) {
    const sec = L[SEC_OF[it.type]];
    if (!sec || !it.from_crm || it.status === 'cancelled' || sec.rows[it.number] != null) continue;
    const kop = it.total_kop ?? it.kop;
    (inserts[SEC_OF[it.type]] = inserts[SEC_OF[it.type]] || []).push(rowFor(sec.head, {
      number: it.number, date: ru(it.date), sum: kop ? fmtRub(kop) : '—',
      basis: `${it.type === 'invoice' ? (it.item || 'по графику CRM') : (it.title || NAME[it.type])} (создан в CRM)`,
      status: it.type === 'invoice' ? (it.status === 'paid' ? `✅ оплачен ${ru(it.paid_date)} (CRM)` : ST[it.status] || it.status) : 'создан в CRM',
    }));
    added.push(it.number);
  }
  // оплаты: в CRM оплачен, в реестре — нет
  const inv = L['Счета'];
  if (inv) for (const i of c.invoices) {
    const idx = inv.rows[i.number];
    if (idx == null || !['paid', 'partial'].includes(i.status)) continue;
    const st = cells(lines[idx])[inv.head.findIndex((x) => /статус/.test(x))] || '';
    if (/оплачен/.test(st.toLowerCase()) && !/не\s*оплачен/.test(st.toLowerCase()) && i.status === 'paid') continue;
    lines[idx] = setStatus(lines[idx], inv.head, i.status === 'paid' ? `✅ оплачен ${ru(i.paid_date)} (отмечено в CRM)` : ST.partial);
    paid.push(i.number);
  }
  // вставки — снизу вверх, чтобы индексы не съезжали
  for (const [secName, rows] of Object.entries(inserts).sort((x, y) => L[y[0]].last - L[x[0]].last)) lines.splice(L[secName].last + 1, 0, ...rows);
  return { text: lines.join('\n'), added, paid };
}

// файлы документов, созданных в CRM, — в _materials/docs, если в проекте их ещё нет
async function pullFiles(repo, c) {
  const got = [];
  const items = [...c.invoices.map((i) => ({ ...i, kind: 'invoice', type: 'invoice' })), ...c.documents.map((d) => ({ ...d, kind: 'document' }))]
    .filter((x) => x.from_crm && x.number && x.status !== 'cancelled');
  for (const x of items) {
    const have = filesFor(x.number);
    const kop = x.total_kop ?? x.kop;
    const base = (x.file_name && x.file_name.replace(/\.(docx|pdf)$/i, '')) ||
      `${NAME[x.type] || 'Документ'} №${x.number}${kop ? ` (${(kop / 100).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')})` : ''}`;
    for (const fmt of ['docx', 'pdf']) {
      if (!x[fmt] || have[fmt]) continue;
      const r = await fetch(`${BASE}/ext/v1/files/${x.kind}/${x.id}/${fmt}?repo=${encodeURIComponent(repo)}`, { headers: { authorization: 'Bearer ' + KEY } });
      if (!r.ok) continue;
      fs.mkdirSync(DOCS, { recursive: true });
      fs.writeFileSync(path.join(DOCS, `${base}.${fmt}`), Buffer.from(await r.arrayBuffer()));
      got.push(`${base}.${fmt}`);
    }
  }
  return got;
}

async function main() {
  const [cmd = 'status', ...args] = process.argv.slice(2);
  if (!KEY) { console.log('⚠ Нет ключа FUTUREFLOW_CRM_API_KEY — в CRM ничего не отправлено (документ остаётся в репозитории). Ключ: CRM → «Настройки» → «Сессии проектов».'); return; }
  const repo = repoName();
  if (cmd === 'status') {
    const c = await api('GET', '/ext/v1/client?repo=' + encodeURIComponent(repo));
    console.log(`${c.name} · следующий номер в CRM: ${c.next_number || '— (нет префикса)'}`);
    for (const i of c.open_invoices) console.log(`  ждёт оплаты: ${i.number} от ${i.date} — ${(i.debt_kop / 100).toLocaleString('ru-RU')} ₽`);
    for (const s of c.schedules) console.log(`  график: ${s.day}-го — ${(s.kop / 100).toLocaleString('ru-RU')} ₽${s.kind === 'transfer' ? ' (перевод)' : ''}${s.starts ? ' с ' + s.starts : ''}${s.ends ? ' по ' + s.ends : ''}`);
    return;
  }
  if (cmd === 'sync') {
    const c = await api('GET', '/ext/v1/client?repo=' + encodeURIComponent(repo));
    // ↓ из CRM: документы, созданные в CRM, и оплаты, отмеченные в CRM, — в реестр; их файлы — в _materials/docs
    const pulled = pullIntoLog(fs.readFileSync(LOG, 'utf8'), c);
    if (pulled.added.length || pulled.paid.length) {
      fs.writeFileSync(LOG, pulled.text);
      if (pulled.added.length) console.log(`↓ в реестр дописаны документы из CRM: ${pulled.added.join(', ')}`);
      if (pulled.paid.length) console.log(`↓ оплаты из CRM: ${pulled.paid.join(', ')}`);
    }
    const files = await pullFiles(repo, c);
    if (files.length) console.log(`↓ файлы из CRM в ${DOCS}: ${files.join(', ')}`);
    if (pulled.added.length || pulled.paid.length || files.length) console.log(`  закоммитьте ${LOG} и ${DOCS} (и в main — правило H скилла)`);
    // ↑ в CRM: всё из реестра, кроме созданного в самой CRM
    const own = new Set([...c.invoices, ...c.documents].filter((x) => x.from_crm).map((x) => x.number));
    const docs = readLog(pulled.text, c.prefix).filter((d) => d.date && !d.cancelled && !own.has(d.number));
    for (const d of docs) {
      try {
        const r = await push(repo, d);
        console.log(`↑ ${d.number} (${d.type}) — ${r.created ? 'добавлен' : 'обновлён'} в CRM, файлов: ${r.files}${d.type === 'invoice' && d.paid ? ', оплачен' : ''}`);
      } catch (e) { console.log(`✗ ${d.number}: ${e.message}`); if (e.status === 401) process.exitCode = 1; }
    }
    const after = await api('GET', '/ext/v1/client?repo=' + encodeURIComponent(repo));
    console.log(`Следующий номер в CRM: ${after.next_number || '—'} (next-number.py должен выдать тот же)`);
    return;
  }
  if (cmd === 'paid') {
    const [number, date] = args;
    if (!number) throw new Error('Номер счёта: crm.js paid КН-004 [ДД.ММ.ГГГГ]');
    const r = await api('POST', '/ext/v1/invoices/paid', { repo, number, date });
    console.log(`${r.number}: ${r.status === 'paid' ? 'оплачен' : r.status}`);
    return;
  }
  if (cmd === 'requisites') {
    const cj = JSON.parse(fs.readFileSync(path.join(DOCS, 'client.json'), 'utf8'));
    const { _comment, prefix, ...fields } = cj;
    const r = await api('PATCH', '/ext/v1/client', { repo, ...fields, set_prefix: prefix, ...(fields.party_full ? { kind: 'ip' } : {}) });
    console.log(`Реквизиты ${r.name} обновлены в CRM`);
    return;
  }
  if (cmd === 'schedule') {
    const [day, total, from, item] = args;
    const r = await api('PUT', '/ext/v1/schedule', { repo, day: Number(day), total, from, item });
    console.log(`График: ${r.schedule.day}-го — ${(r.schedule.kop / 100).toLocaleString('ru-RU')} ₽${r.schedule.starts ? ' с ' + r.schedule.starts : ''}`);
    return;
  }
  throw new Error('Команды: sync, status, paid, requisites, schedule');
}

main().catch((e) => { console.error('CRM: ' + e.message); process.exitCode = 1; });
