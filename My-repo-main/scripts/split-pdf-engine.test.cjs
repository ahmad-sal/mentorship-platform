const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { extractPages, inspectPdf } = require('../public/split-pdf-engine.js');

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
  const sourceBytes = await createPdf([
    [300, 400],
    [400, 500],
    [500, 600],
    [600, 700],
    [700, 800]
  ]);
  const source = asFile('source.pdf', sourceBytes);
  assert.equal(await inspectPdf(sourceBytes, source.name), 5);

  const updates = [];
  const outputBytes = await extractPages(source, [5, 2, 2], update => updates.push(update));
  const output = await PDFDocument.load(outputBytes);
  assert.equal(output.getPageCount(), 2);
  assert.deepEqual(output.getPages().map(page => [page.getWidth(), page.getHeight()]), [
    [400, 500],
    [700, 800]
  ]);
  assert.deepEqual(updates.filter(update => update.stage === 'copying').map(update => update.page), [2, 5]);
  assert.equal(updates.at(-1).stage, 'complete');

  for (const pages of [[], [0], [6], [1.5]]) {
    await assert.rejects(() => extractPages(source, pages));
  }
  await assert.rejects(() => inspectPdf(new Uint8Array([1, 2, 3]), 'broken.pdf'), /broken\.pdf/);

  console.log('PDF split engine checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
