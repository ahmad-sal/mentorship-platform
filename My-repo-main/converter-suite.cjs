'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const posix = path.posix;
const { pathToFileURL } = require('url');
const yauzl = require('yauzl');
const sharp = require('sharp');
const XLSX = require('@e965/xlsx');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const { Document, Paragraph, Table, TableRow, TableCell, Packer, WidthType } = require('docx');
const PptxGenJS = require('pptxgenjs');
const { XMLParser } = require('fast-xml-parser');
const { PDFDocument } = require('pdf-lib');

const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 30000;
const MAX_ARCHIVE_EXPANSION = 256 * 1024 * 1024;
const MAX_TEXT_CHARS = 5 * 1024 * 1024;
const MAX_SLIDES = 500;
const MAX_SHEETS = 30;
const MAX_CELLS = 50000;
const OFFICE_TIMEOUT_MS = 120000;
const PDFJS_CANDIDATE_PATH = 'pdfjs-dist/legacy/build/pdf.mjs';

const DOCUMENT_FORMATS = {
  pdf: { extension: '.pdf', mime: 'application/pdf' },
  word: {
    extension: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  powerpoint: {
    extension: '.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  },
  excel: {
    extension: '.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
};

const IMAGE_FORMATS = {
  jpeg: { extension: '.jpeg', mime: 'image/jpeg', sharp: 'jpeg' },
  jpg: { extension: '.jpg', mime: 'image/jpeg', sharp: 'jpeg' },
  png: { extension: '.png', mime: 'image/png', sharp: 'png' },
  webp: { extension: '.webp', mime: 'image/webp', sharp: 'webp' }
};

const FORMAT_BY_EXTENSION = {
  '.pdf': 'pdf',
  '.docx': 'word',
  '.pptx': 'powerpoint',
  '.xlsx': 'excel'
};

const XML_PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false
});

async function convertDocument(file, from, to, options = {}) {
  assertFormat(DOCUMENT_FORMATS, from, 'document source');
  assertFormat(DOCUMENT_FORMATS, to, 'document destination');
  validateDocumentFile(file, from);

  let result;
  if (to === 'pdf' && from !== 'pdf') {
    await parseOfficeDocument(file.buffer, from);
    result = await renderOfficePdf(file, from, options);
  } else if (from === 'pdf' && to === 'pdf') {
    result = await normalizePdf(file.buffer);
  } else {
    const model = from === 'pdf'
      ? await parsePdf(file.buffer)
      : await parseOfficeDocument(file.buffer, from);
    result = await generateOfficeDocument(model, to);
  }

  verifyOutput(result, DOCUMENT_FORMATS[to]);
  return {
    ...result,
    filename: outputFilename(file.originalname, DOCUMENT_FORMATS[to].extension),
    mime: DOCUMENT_FORMATS[to].mime
  };
}

async function inspectDocument(file, from, to) {
  assertFormat(DOCUMENT_FORMATS, from, 'document source');
  assertFormat(DOCUMENT_FORMATS, to, 'document destination');
  validateDocumentFile(file, from);
  if (from === 'pdf' && to === 'pdf') {
    const pdf = await normalizePdf(file.buffer);
    return { message: 'Readable PDF checked. Ready to normalize.', detail: pdf.pageCount + ' pages' };
  }
  if (from === 'pdf') {
    const model = await parsePdf(file.buffer);
    return { message: 'PDF checked. Ready to convert supported selectable text.', detail: model.paragraphs.length + ' text pages' };
  }
  const model = await parseOfficeDocument(file.buffer, from);
  return {
    message: formatLabel(from) + ' document checked. Ready to convert.',
    detail: String(model.paragraphs.length) + ' text items'
  };
}

async function convertImage(file, from, to) {
  assertFormat(IMAGE_FORMATS, from, 'image source');
  assertFormat(IMAGE_FORMATS, to, 'image destination');
  validateImageFile(file, from);

  let source;
  try {
    source = sharp(file.buffer, {
      limitInputPixels: 40000000,
      failOn: 'error',
      animated: false
    });
    const metadata = await inspectImage(file, from);

    const outputFormat = IMAGE_FORMATS[to].sharp;
    let pipeline = source.rotate();
    if (outputFormat === 'jpeg') {
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true });
    } else if (outputFormat === 'webp') {
      pipeline = pipeline.webp({ quality: 90, effort: 4 });
    } else {
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    }
    const output = await pipeline.toBuffer();
    if (!output.length || output.length > MAX_OUTPUT_BYTES) {
      throw createError(422, 'The converted image is empty or exceeds the output limit.');
    }
    const outputMetadata = await sharp(output, { limitInputPixels: 40000000 }).metadata();
    if (outputMetadata.format !== outputFormat || !outputMetadata.width || !outputMetadata.height) {
      throw createError(422, 'The image processor did not produce a valid output image.');
    }
    return {
      bytes: output,
      filename: outputFilename(file.originalname, IMAGE_FORMATS[to].extension),
      mime: IMAGE_FORMATS[to].mime
    };
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw error;
    throw createError(422, 'The image could not be converted. Try another supported image file.');
  }
}

async function inspectImage(file, from) {
  validateImageFile(file, from);
  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      limitInputPixels: 40000000,
      failOn: 'error',
      animated: false
    }).metadata();
  } catch (error) {
    throw createError(400, 'This image is damaged or is not a supported JPEG, PNG, or WebP file.');
  }
  if (metadata.format !== IMAGE_FORMATS[from].sharp) {
    throw createError(400, 'The image contents do not match the selected source format.');
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40000000) {
    throw createError(413, 'This image exceeds the 40-megapixel processing limit.');
  }
  if (metadata.pages && metadata.pages > 1) {
    throw createError(400, 'Animated images are not supported. Upload a single-frame image.');
  }
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    pages: metadata.pages || 1
  };
}

function validateDocumentFile(file, format) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createError(400, 'Choose a non-empty document to convert.');
  }
  if (file.buffer.length > MAX_DOCUMENT_BYTES) {
    throw createError(413, 'Documents must be 30 MB or smaller.');
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (FORMAT_BY_EXTENSION[extension] !== format) {
    throw createError(400, 'Choose a .' + DOCUMENT_FORMATS[format].extension.slice(1) + ' file for the selected source format.');
  }
  if (format === 'pdf') {
    if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw createError(400, 'The selected file is not a valid PDF.');
    }
    return;
  }
  if (!file.buffer.subarray(0, 4).equals(Buffer.from('PK\u0003\u0004'))) {
    throw createError(400, 'The selected file does not have a valid Office document signature.');
  }
}

function validateImageFile(file, format) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createError(400, 'Choose a non-empty image to convert.');
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw createError(413, 'Images must be 20 MB or smaller.');
  }
  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (extension !== IMAGE_FORMATS[format].extension) {
    throw createError(400, 'Choose an image with the .' + IMAGE_FORMATS[format].extension.slice(1) + ' extension.');
  }
}

async function normalizePdf(buffer) {
  let document;
  try {
    document = await PDFDocument.load(buffer, {
      throwOnInvalidObject: true,
      updateMetadata: false
    });
  } catch (error) {
    throw createError(400, 'This PDF is damaged, encrypted, or could not be opened.');
  }
  if (!document.getPageCount()) throw createError(400, 'This PDF does not contain any pages.');
  document.setCreator('Converter Suite');
  document.setProducer('Converter Suite PDF normalization');
  document.setModificationDate(new Date());
  const bytes = Buffer.from(await document.save({ useObjectStreams: true }));
  return { bytes, pageCount: document.getPageCount() };
}

async function parsePdf(buffer) {
  let pdf;
  try {
    const pdfjs = await import(PDFJS_CANDIDATE_PATH);
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0
    }).promise;
  } catch (error) {
    throw createError(400, 'This PDF is damaged, encrypted, or could not be opened.');
  }

  try {
    if (!pdf.numPages || pdf.numPages > MAX_SLIDES) {
      throw createError(413, 'PDF documents must contain between 1 and ' + MAX_SLIDES + ' pages.');
    }
    const pages = [];
    const tables = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = groupPdfTextItems(content.items);
      const text = lines.map((line) => line.text).filter(Boolean).join('\n');
      totalCharacters += text.length;
      if (totalCharacters > MAX_TEXT_CHARS) {
        throw createError(413, 'This PDF contains too much text to convert safely.');
      }
      pages.push({ number: pageNumber, text });
      const table = detectPdfTable(lines);
      if (table) tables.push(table);
    }
    if (!pages.some((page) => page.text)) {
      throw createError(422, 'No selectable text was found. Scanned PDFs require OCR, which is not available in this converter.');
    }
    return {
      title: 'Converted PDF',
      paragraphs: pages.filter((page) => page.text).map((page) => 'Page ' + page.number + ': ' + page.text),
      tables,
      slides: pages.map((page) => ({ title: 'Page ' + page.number, text: page.text }))
    };
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw error;
    throw createError(400, 'This PDF contains damaged or unreadable page content.');
  } finally {
    await pdf.destroy();
  }
}

function groupPdfTextItems(items) {
  const positionedItems = items
    .filter((item) => typeof item.str === 'string' && item.str.trim() && item.transform)
    .map((item) => ({
      text: item.str.trim(),
      x: Number(item.transform[4]) || 0,
      y: Number(item.transform[5]) || 0,
      width: Number(item.width) || 0
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];
  for (const item of positionedItems) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      line.items.sort((left, right) => left.x - right.x);
      return {
        items: line.items,
        text: line.items.map((item) => item.text).join(' ')
      };
    });
}

function detectPdfTable(lines) {
  const rows = lines.map((line) => {
    const cells = [];
    let current = '';
    let endX = null;
    for (const item of line.items) {
      if (endX !== null && item.x - endX > 36) {
        cells.push(current.trim());
        current = '';
      }
      current += (current ? ' ' : '') + item.text;
      endX = item.x + item.width;
    }
    if (current.trim()) cells.push(current.trim());
    return cells;
  });
  const candidateRows = rows.filter((row) => row.length >= 2);
  if (candidateRows.length < 2) return null;
  const columnCount = Math.min(...candidateRows.map((row) => row.length));
  if (columnCount < 2 || columnCount > 20) return null;
  return candidateRows.map((row) => row.slice(0, columnCount));
}

async function parseOfficeDocument(buffer, format) {
  await validateOfficePackage(buffer, format);
  if (format === 'word') return parseWord(buffer);
  if (format === 'powerpoint') return parsePowerPoint(buffer);
  return parseExcel(buffer);
}

async function validateOfficePackage(buffer, format) {
  const required = {
    word: ['[Content_Types].xml', 'word/document.xml'],
    powerpoint: ['[Content_Types].xml', 'ppt/presentation.xml'],
    excel: ['[Content_Types].xml', 'xl/workbook.xml']
  }[format];
  const entries = await readZipEntries(buffer, (name) => required.includes(name), 4 * 1024 * 1024);
  const contentTypes = entries.get('[Content_Types].xml');
  const mainPart = entries.get(required[1]);
  if (!contentTypes || !mainPart || !mainPart.length) {
    throw createError(400, 'This file is not a complete, readable ' + formatLabel(format) + ' document.');
  }
  const expectedContentType = {
    word: /wordprocessingml\.document\.main\+xml/i,
    powerpoint: /presentationml\.presentation\.main\+xml/i,
    excel: /spreadsheetml\.sheet\.main\+xml/i
  }[format];
  if (!expectedContentType.test(contentTypes.toString('utf8'))) {
    throw createError(400, 'The Office package type does not match the selected source format.');
  }
}

function readZipEntries(buffer, shouldRead, maxEntryBytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      validateEntrySizes: true,
      strictFileNames: true
    }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(createError(400, 'This Office document is not a readable ZIP-based file.'));
        return;
      }

      const entries = new Map();
      let count = 0;
      let expandedBytes = 0;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };

      zipFile.on('error', () => fail(createError(400, 'The Office package is damaged or could not be read.')));
      zipFile.on('entry', (entry) => {
        count += 1;
        expandedBytes += entry.uncompressedSize;
        const segments = entry.fileName.split('/');
        if (count > MAX_ARCHIVE_ENTRIES || expandedBytes > MAX_ARCHIVE_EXPANSION) {
          fail(createError(413, 'This Office package exceeds the safe processing limits.'));
          return;
        }
        if (entry.fileName.startsWith('/') || entry.fileName.includes('\\') || segments.includes('..')) {
          fail(createError(400, 'This Office package contains an unsafe or invalid path.'));
          return;
        }
        if (!shouldRead(entry.fileName)) {
          zipFile.readEntry();
          return;
        }
        if (entry.uncompressedSize > maxEntryBytes) {
          fail(createError(413, 'This Office document contains an oversized content part.'));
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(createError(400, 'The Office package is damaged or could not be read.'));
            return;
          }
          const chunks = [];
          let size = 0;
          stream.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxEntryBytes) {
              stream.destroy();
              fail(createError(413, 'This Office document contains an oversized content part.'));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', () => fail(createError(400, 'The Office package is damaged or could not be read.')));
          stream.on('end', () => {
            if (settled) return;
            if (entries.has(entry.fileName)) {
              fail(createError(400, 'This Office package contains duplicate document parts.'));
              return;
            }
            entries.set(entry.fileName, Buffer.concat(chunks));
            zipFile.readEntry();
          });
        });
      });
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipFile.readEntry();
    });
  });
}

async function parseWord(buffer) {
  let html;
  try {
    const converted = await mammoth.convertToHtml({ buffer });
    html = converted.value;
  } catch (error) {
    throw createError(400, 'This Word document is damaged, encrypted, or unsupported.');
  }
  const $ = cheerio.load(html);
  const paragraphs = [];
  $('p, h1, h2, h3, h4, li').each((_, element) => {
    if ($(element).closest('table').length) return;
    const text = $(element).text().trim();
    if (text) paragraphs.push(text);
  });
  const tables = [];
  $('table').each((_, table) => {
    const rows = [];
    $(table).find('tr').each((__, row) => {
      const cells = [];
      $(row).children('th, td').each((___, cell) => cells.push($(cell).text().trim()));
      if (cells.length) rows.push(cells);
    });
    if (rows.length) tables.push(rows);
  });
  const totalCharacters = paragraphs.join('').length +
    tables.reduce((total, table) => total + table.flat().join('').length, 0);
  if (totalCharacters > MAX_TEXT_CHARS) throw createError(413, 'This Word document contains too much text to convert safely.');
  return { title: 'Converted Word document', paragraphs, tables, slides: [] };
}

async function parsePowerPoint(buffer) {
  const entries = await readZipEntries(buffer, (name) =>
    name === 'ppt/presentation.xml' ||
    name === 'ppt/_rels/presentation.xml.rels' ||
    /^ppt\/slides\/slide\d+\.xml$/i.test(name), 4 * 1024 * 1024);
  const presentationXml = entries.get('ppt/presentation.xml')?.toString('utf8') || '';
  const relationshipsXml = entries.get('ppt/_rels/presentation.xml.rels')?.toString('utf8') || '';
  const orderedRelationshipIds = Array.from(presentationXml.matchAll(/<(?:\w+:)?sldId\b([^>]*)\/?>/g))
    .map((match) => readXmlAttribute(match[1], 'r:id'));
  const relationshipPaths = new Map();
  for (const match of relationshipsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const id = readXmlAttribute(match[1], 'Id');
    const target = readXmlAttribute(match[1], 'Target');
    if (!id || !target) continue;
    const normalized = target.startsWith('/')
      ? target.slice(1)
      : posix.normalize(posix.join('ppt', target));
    if (normalized.startsWith('ppt/slides/') && !normalized.split('/').includes('..')) {
      relationshipPaths.set(id, normalized);
    }
  }
  if (!orderedRelationshipIds.length || orderedRelationshipIds.length > MAX_SLIDES) {
    throw createError(400, 'This presentation does not contain a supported number of slides.');
  }

  const slides = [];
  const tables = [];
  let totalCharacters = 0;
  for (const id of orderedRelationshipIds) {
    const slidePath = relationshipPaths.get(id);
    const xml = slidePath && entries.get(slidePath);
    if (!xml) throw createError(400, 'This presentation is missing a slide or has damaged slide relationships.');
    const slideXml = xml.toString('utf8');
    const text = collectXmlText(slideXml);
    totalCharacters += text.length;
    if (totalCharacters > MAX_TEXT_CHARS) throw createError(413, 'This presentation contains too much text to convert safely.');
    slides.push({ title: 'Slide ' + (slides.length + 1), text });
    tables.push(...extractPowerPointTables(slideXml));
  }
  return {
    title: 'Converted presentation',
    paragraphs: slides.filter((slide) => slide.text).map((slide) => slide.title + ': ' + slide.text),
    tables,
    slides
  };
}

function extractPowerPointTables(xml) {
  const tableElements = xml.match(/<(?:\w+:)?tbl\b[\s\S]*?<\/(?:\w+:)?tbl>/gi) || [];
  return tableElements.map((tableXml) => {
    const rows = tableXml.match(/<(?:\w+:)?tr\b[\s\S]*?<\/(?:\w+:)?tr>/gi) || [];
    return rows.map((rowXml) => {
      const cells = rowXml.match(/<(?:\w+:)?tc\b[\s\S]*?<\/(?:\w+:)?tc>/gi) || [];
      return cells.map((cellXml) => collectXmlText(cellXml));
    }).filter((row) => row.length);
  }).filter((table) => table.length);
}

function readXmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp('(?:^|\\s)' + name.replace(':', '\\:') + '\\s*=\\s*"([^"]*)"', 'i'));
  return match ? decodeXml(match[1]) : '';
}

function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': '\'' };
    if (named[entity]) return named[entity];
    const codePoint = entity.startsWith('&#x')
      ? parseInt(entity.slice(3, -1), 16)
      : parseInt(entity.slice(2, -1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

function collectXmlText(xml) {
  let parsed;
  try {
    parsed = XML_PARSER.parse(xml);
  } catch (error) {
    throw createError(400, 'A presentation slide contains invalid XML.');
  }
  const values = [];
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'a:t' || key === 't') collectTextValue(child, values);
      else visit(child);
    }
  }
  visit(parsed);
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

function collectTextValue(value, values) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextValue(item, values));
  } else if (typeof value === 'string') {
    values.push(value);
  } else if (value && typeof value === 'object') {
    if (typeof value['#text'] === 'string') values.push(value['#text']);
    else Object.values(value).forEach((item) => collectTextValue(item, values));
  }
}

function parseExcel(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, WTF: true });
  } catch (error) {
    throw createError(400, 'This Excel workbook is damaged, encrypted, or unsupported.');
  }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > MAX_SHEETS) {
    throw createError(400, 'This workbook must contain between 1 and ' + MAX_SHEETS + ' worksheets.');
  }
  let cellCount = 0;
  let textSize = 0;
  const tables = [];
  const paragraphs = [];
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: ''
    });
    cellCount += rows.reduce((total, row) => total + row.length, 0);
    for (const row of rows) {
      for (const cell of row) textSize += String(cell ?? '').length;
    }
    if (cellCount > MAX_CELLS) throw createError(413, 'This workbook contains more than 50,000 cells.');
    if (textSize > MAX_TEXT_CHARS) throw createError(413, 'This workbook contains too much text to convert safely.');
    if (rows.some((row) => row.some((cell) => String(cell ?? '').trim()))) {
      tables.push(rows);
      paragraphs.push(name);
    }
  }
  return { title: 'Converted workbook', paragraphs, tables, slides: [] };
}

async function generateOfficeDocument(model, format) {
  if (format === 'word') return generateWord(model);
  if (format === 'powerpoint') return generatePowerPoint(model);
  return generateExcel(model);
}

async function generateWord(model) {
  const children = [];
  if (model.title) children.push(new Paragraph({ text: model.title, heading: 'Title' }));
  for (const table of model.tables || []) {
    if (!table.length) continue;
    const rows = table.map((row) => new TableRow({
      children: row.map((cell) => new TableCell({
        children: [new Paragraph({ text: String(cell ?? '') })]
      }))
    }));
    children.push(new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    }));
    children.push(new Paragraph({ text: '' }));
  }
  for (const paragraph of model.paragraphs || []) {
    const text = String(paragraph).trim();
    if (text) children.push(new Paragraph({ text }));
  }
  if (model.slides?.length && !model.paragraphs?.length) {
    model.slides.forEach((slide, index) => {
      if (slide.text) children.push(new Paragraph({ text: 'Slide ' + (index + 1), heading: 'Heading1' }));
      if (slide.text) children.push(new Paragraph({ text: slide.text }));
    });
  }
  if (!children.length) children.push(new Paragraph({ text: ' ' }));
  const document = new Document({ sections: [{ properties: {}, children }] });
  return { bytes: await Packer.toBuffer(document) };
}

async function generatePowerPoint(model) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Converter Suite';
  pptx.subject = 'Reconstructed from supported document text and tables';
  pptx.title = model.title || 'Converted document';
  const sourceSlides = Array.isArray(model.slides) && model.slides.length
    ? model.slides
    : buildSlidesFromContent(model);

  for (const [index, sourceSlide] of sourceSlides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(sourceSlide.title || 'Page ' + (index + 1), {
      x: 0.55, y: 0.35, w: 12.2, h: 0.65,
      fontFace: 'Aptos Display', fontSize: 24, bold: true, color: '0C1524',
      margin: 0
    });
    if (sourceSlide.text) {
      slide.addText(sourceSlide.text, {
        x: 0.65, y: 1.2, w: 12, h: 5.6,
        fontFace: 'Aptos', fontSize: 16, color: '263247',
        breakLine: false, valign: 'top', margin: 0.05,
        fit: 'shrink'
      });
    }
  }
  if (!sourceSlides.length) {
    const slide = pptx.addSlide();
    slide.addText(model.title || 'Converted document', {
      x: 0.55, y: 0.35, w: 12.2, h: 0.65, fontSize: 24, bold: true
    });
  }
  return { bytes: Buffer.from(await pptx.write({ outputType: 'nodebuffer' })) };
}

function buildSlidesFromContent(model) {
  const slides = [];
  for (const table of model.tables || []) {
    const rows = table || [];
    for (let offset = 0; offset < rows.length; offset += 18) {
      const text = rows.slice(offset, offset + 18)
        .map((row) => row.map((cell) => String(cell ?? '')).join('  |  '))
        .join('\n');
      slides.push({ title: 'Table ' + (slides.length + 1), text });
    }
  }
  const paragraphs = model.paragraphs || [];
  for (let offset = 0; offset < paragraphs.length; offset += 7) {
    slides.push({
      title: model.title || 'Converted content',
      text: paragraphs.slice(offset, offset + 7).join('\n\n')
    });
  }
  return slides;
}

async function generateExcel(model) {
  const workbook = XLSX.utils.book_new();
  const occupiedNames = new Set();
  const tables = model.tables?.length
    ? model.tables
    : (model.slides?.length
      ? [[['Slide', 'Content'], ...model.slides.map((slide, index) => [index + 1, slide.text || ''])]]
      : [[['Content'], ...(model.paragraphs || []).map((paragraph) => [paragraph])]]);
  for (let index = 0; index < tables.length && index < MAX_SHEETS; index += 1) {
    const safeName = uniqueSheetName(model.paragraphs?.[index] || 'Content ' + (index + 1), occupiedNames);
    const rows = tables[index] && tables[index].length ? tables[index] : [['']];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, safeName);
  }
  if (model.tables?.length && model.paragraphs?.some(Boolean) && workbook.SheetNames.length < MAX_SHEETS) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Content'], ...model.paragraphs.map((paragraph) => [paragraph])]),
      uniqueSheetName('Extracted text', occupiedNames)
    );
  }
  if (!workbook.SheetNames.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['']]), 'Content');
  }
  return { bytes: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) };
}

function uniqueSheetName(candidate, occupiedNames) {
  const base = String(candidate || 'Content').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Content';
  let name = base;
  let suffix = 2;
  while (occupiedNames.has(name.toLowerCase())) {
    const ending = ' (' + suffix + ')';
    name = base.slice(0, 31 - ending.length) + ending;
    suffix += 1;
  }
  occupiedNames.add(name.toLowerCase());
  return name;
}

async function renderOfficePdf(file, from, options) {
  const executable = options.executable || process.env.SOFFICE_PATH || 'soffice';
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'converter-suite-'));
  const inputDirectory = path.join(temporaryDirectory, 'input');
  const outputDirectory = path.join(temporaryDirectory, 'output');
  const profileDirectory = path.join(temporaryDirectory, 'profile');
  try {
    await Promise.all([
      fs.promises.mkdir(inputDirectory, { mode: 0o700 }),
      fs.promises.mkdir(outputDirectory, { mode: 0o700 }),
      fs.promises.mkdir(profileDirectory, { mode: 0o700 })
    ]);
    const extension = DOCUMENT_FORMATS[from].extension;
    const inputPath = path.join(inputDirectory, 'source' + extension);
    const outputPath = path.join(outputDirectory, 'source.pdf');
    await fs.promises.writeFile(inputPath, file.buffer, { flag: 'wx', mode: 0o600 });
    const filter = {
      word: 'writer_pdf_Export',
      powerpoint: 'impress_pdf_Export',
      excel: 'calc_pdf_Export'
    }[from];
    const args = (options.prefixArgs || []).concat([
      '--headless', '--nologo', '--nodefault', '--nofirststartwizard',
      '-env:UserInstallation=' + pathToFileURL(profileDirectory).href,
      '--convert-to', 'pdf:' + filter,
      '--outdir', outputDirectory,
      inputPath
    ]);
    await runOfficeConverter(executable, args, options.timeout || OFFICE_TIMEOUT_MS);
    const stat = await fs.promises.stat(outputPath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size < 100 || stat.size > MAX_OUTPUT_BYTES) {
      throw createError(422, 'The office engine did not produce a complete PDF for this document.');
    }
    const bytes = await fs.promises.readFile(outputPath);
    const normalized = await normalizePdf(bytes);
    return { bytes: normalized.bytes, pageCount: normalized.pageCount };
  } finally {
    await fs.promises.rm(temporaryDirectory, {
      recursive: true,
      force: true,
      maxRetries: 12,
      retryDelay: 250
    });
  }
}

function runOfficeConverter(executable, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      timeout,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }, (error) => {
      if (!error) {
        resolve();
        return;
      }
      if (error.code === 'ENOENT') {
        reject(createError(503, 'Office-to-PDF rendering is unavailable because the server office engine is not installed.'));
      } else if (error.killed || error.code === 'ETIMEDOUT') {
        reject(createError(504, 'This document took too long to render. Try a smaller file.'));
      } else {
        reject(createError(422, 'The office engine could not render this document. It may be damaged or use unsupported content.'));
      }
    });
  });
}

function verifyOutput(result, format) {
  if (!result || !Buffer.isBuffer(result.bytes) || result.bytes.length < 16 ||
      result.bytes.length > MAX_OUTPUT_BYTES) {
    throw createError(422, 'The converter did not produce a valid output file.');
  }
  if (format.extension === '.pdf' && !result.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw createError(422, 'The converter did not produce a valid PDF.');
  }
  if (format.extension !== '.pdf' && !result.bytes.subarray(0, 4).equals(Buffer.from('PK\u0003\u0004'))) {
    throw createError(422, 'The converter did not produce a valid Office document.');
  }
}

function outputFilename(inputName, extension) {
  let base = path.basename(String(inputName || 'converted-file'), path.extname(String(inputName || '')));
  base = base.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return (base || 'converted-file') + extension;
}

function assertFormat(formats, format, label) {
  if (!Object.prototype.hasOwnProperty.call(formats, format)) {
    throw createError(400, 'Choose a supported ' + label + ' format.');
  }
}

function formatLabel(format) {
  return { word: 'Word', powerpoint: 'PowerPoint', excel: 'Excel' }[format] || format;
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  DOCUMENT_FORMATS,
  IMAGE_FORMATS,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  convertDocument,
  convertImage,
  inspectDocument,
  inspectImage,
  validateDocumentFile,
  validateImageFile
};
