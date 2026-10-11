// ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ к договору (смена цены или состава услуг, с датой вступления в силу).
const L = require('./lib.js');
const { CLIENT, p, h, F, AlignmentType, Paragraph, TextRun, GAP_IN, GAP_BLOCK } = L;   // отступы — общий ритм документов (lib.js)
const CFG = Object.assign({
  num: CLIENT.prefix + '00_', dateText: '«__» ________ 2026 г.', city: 'г. Москва',
  contractTitle: 'к Договору возмездного оказания услуг по продвижению', contractNo: '№ ____ от «__» ________ 2026 г.',
  points: [
    'С «__» ________ 2026 г. состав услуг по Договору дополняется: ________.',
    'Общая ежемесячная стоимость услуг по Договору с «__» ________ 2026 г. составляет ______ (________) рублей 00 копеек, без НДС.',
  ],
  out: 'Допсоглашение №' + CLIENT.prefix + '00_ к договору.docx',
}, process.env.FF_DOC_CFG ? JSON.parse(process.env.FF_DOC_CFG) : {});   // CRM FutureFlow передаёт CFG сюда (тот же макет)
const pts = [...CFG.points,
  'Остальные условия Договора, не затронутые настоящим Соглашением, остаются без изменений и сохраняют силу. Настоящее Соглашение является неотъемлемой частью Договора.',
  'Настоящее Соглашение вступает в силу с момента подписания обеими Сторонами и составлено в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон.'];
L.save(CFG.out, [
  L.logo(),                                    // логотип FutureFlow — первым абзацем, справа (repo-notes, раздел 3.0)
  h(`ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ № ${CFG.num}`), h(CFG.contractTitle, 24), h(CFG.contractNo, 24),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: GAP_IN, after: 360, line: 240 },
    children: [new TextRun({ text: `${CFG.city}                                                                                    ${CFG.dateText}`, font: F, size: 20 })] }),
  p(`${L.ISP_FULL}, и ${L.ZAK_FULL}, совместно именуемые «Стороны», заключили настоящее Дополнительное соглашение к ${CFG.contractTitle.replace(/^к /, '')} ${CFG.contractNo} (далее — Договор) о нижеследующем:`, { after: GAP_BLOCK }),
  ...pts.map((x, i) => p(`${i + 1}. ${x}`, { after: i === pts.length - 1 ? 480 : GAP_IN })),
  L.signBlock(),
]);
