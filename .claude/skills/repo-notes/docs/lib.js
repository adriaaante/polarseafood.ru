// Общая библиотека документов FutureFlow (docx-js, Times New Roman).
// Исполнитель — постоянный; Заказчик — из client.json в текущей папке (_materials/docs/ проекта).
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign } = require('docx');
const CLIENT = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'client.json'), 'utf8'));
const F = 'Times New Roman';
const NO = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const TB = { style: BorderStyle.SINGLE, size: 4, color: '000000' };

// ⚠ символ \n сам по себе в docx строку НЕ переносит (текст склеивается:
// «…ОГРНИП 325774600319981Получатель:») — нужен отдельный TextRun с break. Этим занимается tt().
const tt = (text, o = {}) => String(text).split('\n').map((s, i) =>
  new TextRun({ text: s, font: F, size: o.size || 20, bold: !!o.bold, break: i ? 1 : 0 }));
const t = (text, o = {}) => new TextRun({ text, font: F, size: o.size || 20, bold: !!o.bold });
const p = (text, o = {}) => new Paragraph({
  alignment: o.align || AlignmentType.LEFT, keepNext: !!o.keepNext,   // keepNext — заголовок не отрывается от следующего блока
  spacing: { before: o.before || 0, after: o.after === undefined ? 80 : o.after, line: 240 },
  children: tt(text, o),
});
const h = (text, size = 28) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 60, line: 240 },
  children: [new TextRun({ text, font: F, size, bold: true })],
});
const cell = (text, w, o = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  margins: { top: 40, bottom: 40, left: 80, right: 80 },
  verticalAlign: VerticalAlign.CENTER,
  shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade, color: 'auto' } : undefined,
  borders: o.noBorder ? { top: NO, bottom: NO, left: NO, right: NO } : { top: TB, bottom: TB, left: TB, right: TB },
  children: [new Paragraph({ alignment: o.align || AlignmentType.LEFT, spacing: { after: 0, line: 240 }, children: tt(text, o) })],
});

// Исполнитель — постоянные реквизиты
const ISP_LINE = 'ИП Зайдель Адриан Патрик, ИНН 772590578053, ОГРНИП 325774600319981, 115407, г. Москва, ул. Затонная, д. 5, корп. 4, кв. 27, тел. +7 925 904-01-11.';
const ISP_FULL = 'Индивидуальный предприниматель Зайдель Адриан Патрик (ОГРНИП 325774600319981, ИНН 772590578053), именуемый в дальнейшем «Исполнитель», с одной стороны';
// Заказчик-ИП: в client.json задать party_full целиком («Индивидуальный предприниматель …, именуемая …»), director_* можно не заполнять.
const ZAK_FULL = CLIENT.party_full || `${CLIENT.full} в лице ${CLIENT.director_title_genitive} ${CLIENT.director_genitive}, действующего на основании ${CLIENT.basis_doc}, именуемое в дальнейшем «Заказчик», с другой стороны`;
const ISP = ['ИСПОЛНИТЕЛЬ:', 'ИП Зайдель Адриан Патрик', 'ИНН 772590578053', 'ОГРНИП 325774600319981',
  '115407, г. Москва, ул. Затонная,', 'д. 5, корп. 4, кв. 27', 'Р/с 40802810800008299634', 'АО «ТБанк», БИК 044525974', 'тел. +7 925 904-01-11'];
const ZAK = ['ЗАКАЗЧИК:', CLIENT.short, CLIENT.inn_kpp, ...CLIENT.address_lines, CLIENT.director_title, CLIENT.director].filter(Boolean);
// обе колонки одной длины — иначе подписи сторон стоят на разной высоте (урок 10.10.2026: у ООО с ОГРН и банком строк больше)
while (ZAK.length < ISP.length) ZAK.push('');
while (ISP.length < ZAK.length) ISP.push('');

// Ширина полосы набора А4 (11906) при полях 1130/850 = 9926 twips — ВСЕ таблицы не шире TW, иначе вылезают за правое поле
// и при печати режутся у края листа (так было до 30.09.2026: 10620 — на 1,2 см шире поля, в 2,7 мм от края бумаги).
const TW = 9920;

// ⚠ ИП Зайдель работает БЕЗ печати: «М.П.» только у Заказчика.
function signBlock() {
  const col = (lines, sign, seal) => new TableCell({
    width: { size: TW / 2, type: WidthType.DXA }, borders: { top: NO, bottom: NO, left: NO, right: NO },
    children: [...lines.map((x, i) => p(x, { bold: i === 0 })), p('', { after: 300 }), p('_______________ ' + sign), ...(seal ? [p('М.П.')] : [])],
  });
  return new Table({
    columnWidths: [TW / 2, TW / 2], width: { size: TW, type: WidthType.DXA },
    borders: { top: NO, bottom: NO, left: NO, right: NO, insideHorizontal: NO, insideVertical: NO },
    rows: [new TableRow({ cantSplit: true, children: [col(ISP, '/ Зайдель А. П. /', false), col(ZAK, `/ ${CLIENT.director_short} /`, true)] })],
  });
}
// Таблица услуг: по строке на позицию (акт закрывает несколько счетов — по строке на счёт)
function servicesTable(items, head = 'Наименование работ, услуг') {
  const W = [500, 5100, 800, 700, 1410, 1410];   // сумма = TW
  const hc = (x, i) => cell(x, W[i], { bold: true, align: AlignmentType.CENTER, shade: 'F2F2F2' });
  return new Table({ columnWidths: W, width: { size: TW, type: WidthType.DXA }, rows: [
    new TableRow({ tableHeader: true, children: ['№', head, 'Кол-во', 'Ед.', 'Цена', 'Сумма'].map(hc) }),
    ...items.map((it, i) => new TableRow({ children: [
      cell(String(i + 1), W[0], { align: AlignmentType.CENTER }), cell(it.name, W[1]),
      cell('1', W[2], { align: AlignmentType.CENTER }), cell('усл.', W[3], { align: AlignmentType.CENTER }),
      cell(it.price, W[4], { align: AlignmentType.RIGHT }), cell(it.price, W[5], { align: AlignmentType.RIGHT }),
    ]})),
  ]});
}
// Шапка счёта с банковскими реквизитами Исполнителя
function bankTable() {
  const BW = [5000, 1900, 3020];   // сумма = TW
  return new Table({ columnWidths: BW, width: { size: TW, type: WidthType.DXA }, rows: [
    new TableRow({ children: [cell('Банк получателя: АО «ТБанк»', BW[0]), cell('БИК', BW[1], { align: AlignmentType.CENTER }), cell('044525974', BW[2])] }),
    new TableRow({ children: [cell('', BW[0]), cell('Сч. №', BW[1], { align: AlignmentType.CENTER }), cell('30101810145250000974', BW[2])] }),
    new TableRow({ children: [cell('ИНН 772590578053   ОГРНИП 325774600319981\nПолучатель: ИП Зайдель Адриан Патрик', BW[0]), cell('Сч. №', BW[1], { align: AlignmentType.CENTER }), cell('40802810800008299634', BW[2])] }),
  ]});
}
// ЛОГОТИП FutureFlow — ОДИН во ВСЕХ документах (счёт, договор, акт, допсоглашение; в PDF-отчётах тот же PNG того же
// размера): файл assets/futureflow-logo.png (в проекте — _materials/brand/), первый абзац, по правому краю, отступ после
// 8 pt, ровно 93×20 px = 24,6×5,3 мм (EMU 885825×190500), синий как в файле — не менять (repo-notes, раздел 3.0).
const LOGO_W = 93, LOGO_H = 20;
function logoFile() {
  const c = [process.env.FF_LOGO, path.resolve(process.cwd(), '../brand/futureflow-logo.png'), path.resolve(__dirname, '../assets/futureflow-logo.png'),
    path.join(process.env.HOME || '', '.claude/skills/repo-notes/assets/futureflow-logo.png')].filter(Boolean);
  const f = c.find(x => fs.existsSync(x)); if (!f) throw new Error('нет futureflow-logo.png: скопируй $SK/assets/futureflow-logo.png в _materials/brand/');
  return fs.readFileSync(f);
}
const logo = () => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 160 },
  children: [new ImageRun({ type: 'png', data: logoFile(), transformation: { width: LOGO_W, height: LOGO_H } })] });
// ЕДИНЫЙ РИТМ ОТСТУПОВ ВСЕХ ДОКУМЕНТОВ (счёт, акт, договор, допсоглашение; правило Adrian 30.09.2026): шрифт Times New
// Roman 10 pt, интерлиньяж одинарный; внутри блока — GAP_IN (6 pt), между блоками — GAP_BLOCK (12 pt), после шапки
// (заголовок + дата) — 18 pt, перед подписями — 24 pt, «Итого» отделено от таблицы. Числа отступов в генераторах руками
// не писать — только эти константы.
// АКТ — единый макет с ровными отступами (правило Adrian 30.09.2026: «всё ровно, с ровными отступами»). Ритм отступов:
// шапка (заголовок, подзаголовок, дата) плотно, после даты 18 pt; внутри блока абзацы через 6 pt (GAP_IN); между блоками
// (стороны → основание → таблица → итог → суммы → оговорки) 12 pt (GAP_BLOCK); перед подписями 24 pt. Руками отступы
// в генераторах актов не подбирать — только этот макет.
const GAP_IN = 120, GAP_BLOCK = 240;
const hx = (text, size, after) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after, line: 240 },
  children: [new TextRun({ text, font: F, size, bold: true })] });
// c = { num, subtitle ('сдачи-приёмки оказанных услуг' | '… выполненных работ'), dateText ('«30» сентября 2026 г.'),
//       basis, intro, items [{name, price}], total ('195 000,00'), totalText, payText, doneText }
function actDoc(c) {
  return [
    logo(),
    hx('АКТ № ' + c.num, 28, 60), hx(c.subtitle, 24, 60), hx('от ' + c.dateText, 22, 360),
    p('Исполнитель: ' + ISP_LINE, { after: GAP_IN }),
    p(`Заказчик: ${CLIENT.short}, ${CLIENT.inn_kpp}, ${CLIENT.address}${CLIENT.party_full ? '' : `, в лице ${CLIENT.director_title_genitive} ${CLIENT.director_genitive}`}.`, { after: GAP_BLOCK }),
    p('Основание: ' + c.basis, { after: GAP_BLOCK }),
    p(c.intro, { after: GAP_IN }),
    servicesTable(c.items),
    p(`Итого: ${c.total} руб. Без НДС.`, { align: AlignmentType.RIGHT, bold: true, before: GAP_IN, after: GAP_BLOCK }),
    p(c.totalText, { after: GAP_IN }),
    p(c.payText, { after: GAP_BLOCK }),
    p(c.doneText, { after: GAP_BLOCK }),
    p('Настоящий акт составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон.', { after: 480 }),
    signBlock(),
  ];
}
const PAGE = { properties: { page: { margin: { top: 850, right: 850, bottom: 850, left: 1130 } } } };
const save = (name, children) => Packer.toBuffer(new Document({ sections: [{ ...PAGE, children }] }))
  .then(b => { fs.writeFileSync(name, b); console.log('ok', name); });
module.exports = { actDoc, GAP_IN, GAP_BLOCK, CLIENT, F, t, tt, p, h, cell, signBlock, servicesTable, bankTable, save, logo, ISP_LINE, ISP_FULL, ZAK_FULL, Paragraph, TextRun, ImageRun, AlignmentType };
