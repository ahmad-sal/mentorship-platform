const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { PDFDocument } = require('pdf-lib');
const {
  validatePresentation,
  convertPresentation,
  MAX_SLIDES
} = require('../powerpoint-to-pdf.cjs');

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const uncompressed = Buffer.from(value);
    const compressed = zlib.deflateRawSync(uncompressed);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressed.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createPresentation(slideCount = 2) {
  const slideIds = Array.from({ length: slideCount }, (_, index) =>
    `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join('');
  const entries = {
    '[Content_Types].xml': '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    'ppt/presentation.xml': `<p:presentation><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`
  };
  for (let index = 1; index <= slideCount; index += 1) {
    entries[`ppt/slides/slide${index}.xml`] = `<p:sld id="${index}"/>`;
  }
  return createZip(entries);
}

async function createFakeOffice(pages, mode = 'success') {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fake-soffice-'));
  const scriptPath = path.join(directory, 'soffice.cjs');
  const source = mode === 'timeout'
    ? 'setTimeout(() => {}, 5000);'
    : `const fs = require('fs');
const path = require('path');
const { PDFDocument } = require(${JSON.stringify(require.resolve('pdf-lib'))});
(async () => {
  const args = process.argv.slice(2);
  const outputDirectory = args[args.indexOf('--outdir') + 1];
  const inputPath = args[args.length - 1];
  const pdf = await PDFDocument.create();
  for (let i = 0; i < ${pages}; i += 1) pdf.addPage([960, 540]);
  const bytes = ${mode === 'invalid-pdf' ? "Buffer.concat([Buffer.from('%PDF-invalid-document'), Buffer.alloc(200)])" : 'await pdf.save()'};
  fs.writeFileSync(path.join(outputDirectory, path.basename(inputPath, path.extname(inputPath)) + '.pdf'), bytes);
})().catch(() => process.exit(2));`;
  await fs.promises.writeFile(scriptPath, source);
  return { directory, scriptPath };
}

async function withFakeOffice(pages, callback, mode) {
  const fakeOffice = await createFakeOffice(pages, mode);
  try {
    return await callback({
      executable: process.execPath,
      prefixArgs: [fakeOffice.scriptPath],
      timeout: 15000
    });
  } finally {
    await fs.promises.rm(fakeOffice.directory, { recursive: true, force: true });
  }
}

async function main() {
  const presentationBuffer = createPresentation(2);
  const presentationFile = {
    originalname: 'quarterly-review.pptx',
    mimetype: 'application/octet-stream',
    buffer: presentationBuffer
  };
  const metadata = await validatePresentation(presentationFile);
  assert.deepEqual(metadata, { format: 'pptx', slideCount: 2 });

  const result = await withFakeOffice(2, (options) =>
    convertPresentation(presentationFile, options));
  const generatedPdf = await PDFDocument.load(result.bytes);
  assert.equal(generatedPdf.getPageCount(), 2);
  assert.equal(result.pageCount, 2);
  const firstPage = generatedPdf.getPage(0).getSize();
  assert.ok(firstPage.width > firstPage.height, 'slide page proportions should be preserved');

  await assert.rejects(
    validatePresentation({
      originalname: 'renamed.pptx',
      buffer: createZip({ 'xl/workbook.xml': '<workbook/>' })
    }),
    /complete, readable PPTX/
  );
  await assert.rejects(
    validatePresentation({ originalname: 'damaged.pptx', buffer: Buffer.from('not a zip') }),
    /ZIP-based PowerPoint/
  );
  assert.throws(
    () => validatePresentation({ originalname: 'wrong.pdf', buffer: Buffer.from('%PDF-') }),
    /pptx or .ppt/
  );
  assert.deepEqual(
    await validatePresentation({
      originalname: 'legacy.ppt',
      buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    }),
    { format: 'ppt', slideCount: null }
  );
  await assert.rejects(
    validatePresentation({
      originalname: 'too-many-slides.pptx',
      buffer: createPresentation(MAX_SLIDES + 1)
    }),
    /more than 500 slides/
  );

  await assert.rejects(
    withFakeOffice(1, (options) => convertPresentation(presentationFile, options)),
    /did not contain every presentation slide/
  );
  await assert.rejects(
    withFakeOffice(1, (options) => convertPresentation(presentationFile, options), 'invalid-pdf'),
    /readable PDF/
  );
  await assert.rejects(
    withFakeOffice(1, (options) =>
      convertPresentation(presentationFile, { ...options, timeout: 1000 }), 'timeout'),
    /too long to convert/
  );

  await assert.rejects(
    convertPresentation(presentationFile, {
      executable: path.join(os.tmpdir(), 'missing-soffice-binary')
    }),
    /office engine is not installed/
  );

  console.log('PowerPoint package validation, page-count checks, PDF integrity, proportions, timeout and missing-engine checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
