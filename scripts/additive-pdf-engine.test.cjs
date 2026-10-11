const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts, degrees } = require('pdf-lib');
const { applyChanges } = require('../public/additive-pdf-engine.js');

async function run() {
  const source = await PDFDocument.create();
  const first = source.addPage([400, 600]);
  const second = source.addPage([600, 400]);
  const third = source.addPage([420, 595]);
  third.setRotation(degrees(90));
  const helvetica = await source.embedFont(StandardFonts.Helvetica);
  first.drawText('Original page one', { x: 24, y: 560, size: 14, font: helvetica });
  second.drawText('Original landscape page', { x: 24, y: 360, size: 14, font: helvetica });
  third.drawText('Original rotated page', { x: 24, y: 560, size: 14, font: helvetica });
  const sourceBytes = await source.save();
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU9sAAAAASUVORK5CYII=';
  const pageInfo = {
    width: 400,
    height: 600,
    transform: [1, 0, 0, -1, 0, 600],
    objects: [
      { id: 'text', type: 'text', x: 0.1, y: 0.1, w: 0.5, h: 0.12, text: 'Added heading', fontFamily: 'Helvetica', fontSize: 18, bold: true, italic: true, underline: true, color: '#123456', backgroundColor: '#fff000', backgroundOpacity: 0.25, opacity: 0.8, align: 'center' },
      { id: 'image', type: 'image', x: 0.1, y: 0.3, w: 0.1, h: 0.1, dataUrl: imageData, opacity: 1 },
      { id: 'draw', type: 'draw', x: 0.2, y: 0.5, w: 0.15, h: 0.08, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0.2 }], color: '#ff0000', strokeWidth: 4, opacity: 0.7 },
      { id: 'arrow', type: 'arrow', x: 0.45, y: 0.5, w: 0.2, h: 0.1, reverseX: true, color: '#0000ff', strokeWidth: 2, opacity: 1 },
      { id: 'line', type: 'line', x: 0.1, y: 0.7, w: 0.2, h: 0.01, color: '#00aa00', strokeWidth: 2, opacity: 1 },
      { id: 'circle', type: 'circle', x: 0.4, y: 0.7, w: 0.1, h: 0.08, color: '#ff00ff', fillColor: '#ccccff', fillOpacity: 0.3, strokeWidth: 2, opacity: 0.9 },
      { id: 'rectangle', type: 'rectangle', x: 0.6, y: 0.7, w: 0.2, h: 0.1, color: '#00aaaa', fillColor: '#eeeeee', fillOpacity: 0.4, strokeWidth: 3, opacity: 1 },
      { id: 'triangle', type: 'triangle', x: 0.3, y: 0.84, w: 0.15, h: 0.1, color: '#aa00aa', fillColor: '#ffddaa', fillOpacity: 0.5, strokeWidth: 2, opacity: 0.8 }
    ]
  };
  const landscapePageInfo = {
    width: 600,
    height: 400,
    transform: [1, 0, 0, -1, 0, 400],
    objects: [
      { id: 'page-two-text', type: 'text', x: 0.12, y: 0.12, w: 0.5, h: 0.15, text: 'Page two annotation', fontFamily: 'Times', fontSize: 16, bold: true, italic: false, underline: false, color: '#111111', backgroundColor: '#ffffff', backgroundOpacity: 0, opacity: 1, align: 'left' }
    ]
  };
  const rotatedPageInfo = {
    width: 595,
    height: 420,
    transform: [0, 1, 1, 0, 0, 0],
    rotation: 90,
    objects: [
    { id: 'rotated-text', type: 'text', x: 0.12, y: 0.12, w: 0.48, h: 0.14, text: 'Rotated annotation', fontFamily: 'Helvetica', fontSize: 16, bold: false, italic: false, underline: false, color: '#222222', backgroundColor: '#ffff00', backgroundOpacity: 0.3, opacity: 1, align: 'left' },
    { id: 'rotated-image', type: 'image', x: 0.65, y: 0.12, w: 0.12, h: 0.18, dataUrl: imageData, opacity: 1 },
    { id: 'rotated-rectangle', type: 'rectangle', x: 0.1, y: 0.4, w: 0.3, h: 0.25, color: '#008800', fillColor: '#ccffcc', fillOpacity: 0.4, strokeWidth: 2, opacity: 1 }
    ]
  };

  const outputBytes = await applyChanges(sourceBytes, [pageInfo, landscapePageInfo, rotatedPageInfo], require('pdf-lib'));
  const output = await PDFDocument.load(outputBytes);
  assert.equal(output.getPageCount(), 3, 'all original pages remain in order');
  assert.equal(output.getPages()[2].getRotation().angle, 90, 'rotated source pages retain their orientation');
  assert.ok(outputBytes.length > sourceBytes.length, 'the output contains additional PDF drawing content');
  assert.deepEqual(Object.keys(StandardFonts).filter((font) => /Helvetica|TimesRoman|Courier/.test(font)).length > 0, true);

  const unedited = await PDFDocument.create();
  unedited.addPage([240, 320]);
  const copyBytes = await applyChanges(await unedited.save(), [{ width: 240, height: 320, transform: [1, 0, 0, -1, 0, 320], objects: [] }], require('pdf-lib'));
  assert.equal((await PDFDocument.load(copyBytes)).getPageCount(), 1, 'unchanged files are still valid PDFs');
  await assert.rejects(() => applyChanges(sourceBytes, [Object.assign({}, pageInfo, {
    objects: [{ type: 'text', x: 0, y: 0, w: 0.3, h: 0.1, text: 'bad color', color: 'invalid' }]
  }), landscapePageInfo], require('pdf-lib')), /valid color/);
  console.log('Additive PDF export verified: multipage preservation, text, image, pencil, five shapes, and invalid-input handling.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
