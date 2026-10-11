'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { Document, Paragraph, Table, TableRow, TableCell, Packer } = require('docx');
const PptxGenJS = require('pptxgenjs');
const XLSX = require('@e965/xlsx');
const mammoth = require('mammoth');
const sharp = require('sharp');
const {
  DOCUMENT_FORMATS,
  IMAGE_FORMATS,
  convertDocument,
  convertImage,
  inspectDocument,
  inspectImage
} = require('../converter-suite.cjs');

const MATRIX_MARKER = 'Converter Suite matrix marker';

async function createDocumentFixtures() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const firstPage = pdf.addPage([612, 792]);
  firstPage.drawText(MATRIX_MARKER, { x: 48, y: 720, size: 16, font });
  firstPage.drawText('Name', { x: 48, y: 660, size: 11, font });
  firstPage.drawText('Score', { x: 250, y: 660, size: 11, font });
  firstPage.drawText('Alpha', { x: 48, y: 640, size: 11, font });
  firstPage.drawText('42', { x: 250, y: 640, size: 11, font });
  const secondPage = pdf.addPage([612, 792]);
  secondPage.drawText('Second source page', { x: 48, y: 720, size: 14, font });
  const pdfBuffer = Buffer.from(await pdf.save());

  const wordDocument = new Document({
    sections: [{
      children: [
        new Paragraph({ text: MATRIX_MARKER }),
        new Paragraph({ text: 'Word body content.' }),
        new Table({
          rows: [
            new TableRow({ children: ['Name', 'Score'].map((text) => new TableCell({ children: [new Paragraph(text)] })) }),
            new TableRow({ children: ['Alpha', '42'].map((text) => new TableCell({ children: [new Paragraph(text)] })) })
          ]
        })
      ]
    }]
  });
  const wordBuffer = await Packer.toBuffer(wordDocument);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const firstSlide = pptx.addSlide();
  firstSlide.addText(MATRIX_MARKER, { x: 0.5, y: 0.5, w: 8, h: 0.5, fontSize: 18 });
  firstSlide.addTable([['Name', 'Score'], ['Alpha', '42']], { x: 0.5, y: 1.5, w: 8, h: 1 });
  pptx.addSlide().addText('Second source slide', { x: 0.5, y: 0.5, w: 8, h: 0.5, fontSize: 18 });
  const powerpointBuffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[MATRIX_MARKER], ['Name', 'Score'], ['Alpha', 42]]),
    'Report'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Second worksheet'], ['North', 7]]),
    'More data'
  );
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return {
    pdf: { originalname: 'matrix.pdf', buffer: pdfBuffer },
    word: { originalname: 'matrix.docx', buffer: wordBuffer },
    powerpoint: { originalname: 'matrix.pptx', buffer: powerpointBuffer },
    excel: { originalname: 'matrix.xlsx', buffer: excelBuffer }
  };
}

function hasSoffice() {
  const executable = process.env.SOFFICE_PATH || 'soffice';
  try {
    execFileSync(executable, ['--version'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
    return true;
  } catch (error) {
    return false;
  }
}

async function readOutput(format, bytes) {
  if (format === 'pdf') {
    const document = await PDFDocument.load(bytes);
    assert.ok(document.getPageCount() > 0, 'PDF output must have at least one page');
    return { pageCount: document.getPageCount() };
  }
  if (format === 'word') {
    const output = await mammoth.extractRawText({ buffer: bytes });
    assert.ok(output.value.trim().length > 0, 'Word output must contain reconstructed content');
    return { text: output.value };
  }
  const extension = DOCUMENT_FORMATS[format].extension;
  const inspected = await inspectDocument({
    originalname: 'result' + extension,
    buffer: bytes
  }, format, format);
  assert.ok(inspected.detail, 'Office output must be readable by its corresponding parser');
  return inspected;
}

async function testDocumentMatrix(fixtures, officeOptions) {
  let tested = 0;
  const skipped = [];
  for (const [from, file] of Object.entries(fixtures)) {
    for (const to of Object.keys(DOCUMENT_FORMATS)) {
      if (to === 'pdf' && from !== 'pdf' && !officeOptions) {
        skipped.push(from + '->' + to);
        continue;
      }
      const result = await convertDocument(file, from, to, officeOptions || {});
      assert.equal(path.extname(result.filename), DOCUMENT_FORMATS[to].extension);
      assert.equal(result.mime, DOCUMENT_FORMATS[to].mime);
      assert.ok(result.bytes.length > 100, from + '->' + to + ' output should be non-empty');
      assert.notDeepEqual(result.bytes, file.buffer, from + '->' + to + ' must process content, not rename the source');
      await readOutput(to, result.bytes);
      tested += 1;
    }
  }
  assert.equal(tested + skipped.length, 16, 'all PDF Converter combinations must be accounted for');
  return { tested, skipped };
}

async function testImageMatrix() {
  const transparentPng = await sharp({
    create: { width: 12, height: 8, channels: 4, background: { r: 220, g: 20, b: 100, alpha: 0 } }
  }).png().toBuffer();
  const jpegBytes = await sharp(transparentPng).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
  const webpBytes = await sharp(transparentPng).webp({ quality: 92 }).toBuffer();
  const inputBuffers = {
    jpeg: jpegBytes,
    jpg: jpegBytes,
    png: transparentPng,
    webp: webpBytes
  };
  let tested = 0;
  for (const [from, config] of Object.entries(IMAGE_FORMATS)) {
    for (const [to, outputConfig] of Object.entries(IMAGE_FORMATS)) {
      const extension = config.extension;
      const file = { originalname: 'matrix' + extension, buffer: inputBuffers[from] };
      const result = await convertImage(file, from, to);
      assert.equal(result.filename, 'matrix' + outputConfig.extension);
      assert.equal(result.mime, outputConfig.mime);
      assert.notDeepEqual(result.bytes, file.buffer, from + '->' + to + ' must decode and re-encode the image');
      const metadata = await sharp(result.bytes).metadata();
      assert.equal(metadata.format, outputConfig.sharp);
      assert.equal(metadata.width, 12);
      assert.equal(metadata.height, 8);
      tested += 1;
    }
  }
  assert.equal(tested, 16);

  const flattened = await convertImage({
    originalname: 'transparent.png',
    buffer: transparentPng
  }, 'png', 'jpeg');
  const raw = await sharp(flattened.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.ok(raw.data[0] > 240 && raw.data[1] > 240 && raw.data[2] > 240, 'transparent pixels should composite onto white');
}

async function main() {
  await testImageMatrix();
  const fixtures = await createDocumentFixtures();
  const officeOptions = hasSoffice() ? {} : null;
  const documentResults = await testDocumentMatrix(fixtures, officeOptions);

  if (!officeOptions) {
    for (const from of ['word', 'powerpoint', 'excel']) {
      await assert.rejects(
        convertDocument(fixtures[from], from, 'pdf'),
        (error) => error.statusCode === 503
      );
    }
  }

  await assert.rejects(
    inspectDocument({ originalname: 'renamed.docx', buffer: Buffer.from('%PDF-not-docx') }, 'word', 'pdf'),
    /valid Office document signature/
  );
  await assert.rejects(
    convertDocument({ originalname: 'wrong.xlsx', buffer: Buffer.from('not a workbook') }, 'excel', 'word'),
    /valid Office document signature/
  );
  await assert.rejects(
    inspectImage({ originalname: 'image.png', buffer: Buffer.from('not an image') }, 'png'),
    /damaged or is not a supported/
  );
  await assert.rejects(
    convertImage({ originalname: 'wrong.jpg', buffer: fixtures.pdf.buffer }, 'jpg', 'png'),
    /damaged or is not a supported|contents do not match/
  );

  console.log('Converter Suite verified ' + documentResults.tested + '/16 document conversions and 16/16 image conversions.' +
    (documentResults.skipped.length ? ' Office-to-PDF rendering needs LibreOffice; explicitly verified the 503 response.' : ''));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
