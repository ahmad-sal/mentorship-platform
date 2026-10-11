const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { mergePdfs, validatePdfFile } = require('../public/merge-pdf-engine.js');

async function createPdf(sizes) {
  const document = await PDFDocument.create();
  for (const [width, height] of sizes) document.addPage([width, height]);
  return document.save();
}

function asFile(name, bytes) {
  return {
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

(async () => {
  const first = asFile('first.pdf', await createPdf([[612, 792]]));
  const second = asFile('second.pdf', await createPdf([[842, 595], [595, 842]]));
  const updates = [];
  const mergedBytes = await mergePdfs([first, second], update => updates.push(update));
  const merged = await PDFDocument.load(mergedBytes);
  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(merged.getPages().map(page => [page.getWidth(), page.getHeight()]), [
    [612, 792],
    [842, 595],
    [595, 842]
  ]);
  assert.equal(updates.filter(update => update.stage === 'copying').length, 3);
  assert.equal(updates.at(-1).stage, 'complete');

  await assert.rejects(() => mergePdfs([first]), /at least two/);
  await assert.rejects(() => mergePdfs([
    first,
    asFile('broken.pdf', new Uint8Array([1, 2, 3]))
  ]), /broken\.pdf/);
  await assert.rejects(() => mergePdfs([
    first,
    asFile('corrupted.pdf', Buffer.from('%PDF-1.7\nnot a valid PDF document'))
  ]), error => /corrupted\.pdf/.test(error.message) && /damaged|unsupported|Could not be read/i.test(error.message));
  await assert.rejects(() => validatePdfFile(
    asFile('corrupted.pdf', Buffer.from('%PDF-1.7\nnot a valid PDF document'))
  ), error => /corrupted\.pdf/.test(error.message) && /damaged|unsupported|Could not be read/i.test(error.message));
  const emptyDocument = await PDFDocument.create();
  const emptyPdf = asFile('empty.pdf', await emptyDocument.save({ addDefaultPage: false }));
  await assert.rejects(() => validatePdfFile(emptyPdf), /does not contain any pages/);

  console.log('PDF merge engine checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
