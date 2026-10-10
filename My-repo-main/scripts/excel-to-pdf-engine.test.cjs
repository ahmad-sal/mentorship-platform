const assert = require('node:assert/strict');
const XLSX = require('@e965/xlsx');
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');
const engine = require('../public/excel-to-pdf-engine.js');

async function run() {
  const workbook = XLSX.utils.book_new();
  const sales = XLSX.utils.aoa_to_sheet([
    ['Product', 'Quantity', 'Revenue'],
    ['Books', 4, 1250.5],
    ['Pens', 12, 24]
  ]);
  sales.C2.z = '$#,##0.00';
  XLSX.utils.book_append_sheet(workbook, sales, 'Sales');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Region', 'Total'],
    ['North', 300],
    ['South', 425]
  ]), 'Regions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Private', 'Do not include']
  ]), 'Hidden');
  workbook.Workbook = {
    Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }]
  };
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true });

  const parsed = engine.parseWorkbook(new Uint8Array(bytes), 'sample.xlsx', XLSX);
  assert.deepEqual(parsed.sheets.map((sheet) => sheet.name), ['Sales', 'Regions']);
  assert.equal(parsed.hiddenSheetCount, 1);
  assert.equal(parsed.sheets[0].headers[0], 'Product');
  assert.equal(parsed.sheets[0].rows[0][0], 'Books');
  assert.match(parsed.sheets[0].rows[0][2], /1,250\.50/);
  assert.equal(parsed.sheets[1].rows[1][0], 'South');

  for (const format of ['xls', 'xlsb']) {
    const extension = format === 'xlsb' ? 'xlsb' : 'xls';
    const legacyBytes = XLSX.write(workbook, { type: 'array', bookType: format });
    const legacyWorkbook = engine.parseWorkbook(new Uint8Array(legacyBytes), `sample.${extension}`, XLSX);
    assert.ok(legacyWorkbook.sheets.some((sheet) => sheet.name === 'Sales'));
  }

  const pdfBytes = engine.createPdf(parsed, jsPDF, autoTable, 'sample.xlsx');
  assert.equal(Buffer.from(pdfBytes).subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdfBytes.byteLength > 500);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfDocument = await pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    isEvalSupported: false
  }).promise;
  try {
    assert.ok(pdfDocument.numPages >= 2, 'each worksheet should be represented in the PDF');
    const extractedText = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      extractedText.push(...content.items.map((item) => item.str));
    }
    assert.ok(extractedText.includes('Books'), 'workbook values should remain selectable PDF text');
    assert.ok(extractedText.includes('Regions'), 'the second worksheet should be included');
    assert.ok(!extractedText.includes('Do not include'), 'hidden worksheets should not be exposed');
  } finally {
    await pdfDocument.destroy();
  }

  assert.throws(
    () => engine.parseWorkbook(new Uint8Array([1, 2, 3, 4]), 'sample.xlsx', XLSX),
    /valid Excel workbook signature/
  );
  assert.throws(
    () => engine.parseWorkbook(new Uint8Array([0x50, 0x4b, 3, 4]), 'sample.pdf', XLSX),
    /extension/
  );
  assert.throws(
    () => engine.parseWorkbook(new Uint8Array(bytes), 'sample.xlsx', {
      read() { throw new Error('File is password-protected or encrypted'); }
    }),
    /password-protected or encrypted/
  );

  const wideSheet = XLSX.utils.aoa_to_sheet([['A']]);
  wideSheet['!ref'] = 'A1:AO1';
  const wideWorkbook = { SheetNames: ['Wide'], Sheets: { Wide: wideSheet } };
  assert.throws(
    () => engine.parseWorkbook(new Uint8Array([0x50, 0x4b, 3, 4]), 'wide.xlsx', {
      read() { return wideWorkbook; },
      utils: XLSX.utils
    }),
    /40 columns/
  );

  const unicodeSheet = XLSX.utils.aoa_to_sheet([['Value'], ['नमस्ते']]);
  const unicodeWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(unicodeWorkbook, unicodeSheet, 'Unicode');
  const unicodeBytes = XLSX.write(unicodeWorkbook, { type: 'array', bookType: 'xlsx' });
  assert.throws(
    () => engine.parseWorkbook(new Uint8Array(unicodeBytes), 'unicode.xlsx', XLSX),
    /outside the PDF font/
  );

  console.log('Excel workbook parsing, worksheet filtering, validation, and selectable PDF output checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
