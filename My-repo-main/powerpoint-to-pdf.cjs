'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const yauzl = require('yauzl');
const { PDFDocument } = require('pdf-lib');

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 30000;
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_PRESENTATION_XML_BYTES = 4 * 1024 * 1024;
const MAX_SLIDES = 500;
const CONVERSION_TIMEOUT_MS = 120000;
const PPT_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function validatePresentation(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw createError(400, 'Choose a PowerPoint presentation to continue.');
  }
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw createError(413, 'This presentation is larger than the 50 MB file limit.');
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (extension === '.ppt') {
    if (file.buffer.length < PPT_SIGNATURE.length ||
        !file.buffer.subarray(0, PPT_SIGNATURE.length).equals(PPT_SIGNATURE)) {
      throw createError(400, 'The selected file is not a valid legacy PowerPoint presentation.');
    }
    return Promise.resolve({ format: 'ppt', slideCount: null });
  }
  if (extension !== '.pptx') {
    throw createError(400, 'Choose a PowerPoint presentation in .pptx or .ppt format.');
  }
  return inspectPptx(file.buffer);
}

function inspectPptx(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      validateEntrySizes: true,
      strictFileNames: true
    }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(createError(400, 'This PPTX file is not a readable ZIP-based PowerPoint presentation.'));
        return;
      }

      let settled = false;
      let entryCount = 0;
      let uncompressedBytes = 0;
      let contentTypes = '';
      let presentationXml = '';
      let slideEntryCount = 0;

      function fail(error) {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      }

      zipFile.on('error', () => {
        fail(createError(400, 'This PowerPoint package is damaged or could not be read.'));
      });

      zipFile.on('entry', (entry) => {
        entryCount += 1;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          fail(createError(413, 'This presentation contains too many package items to process safely.'));
          return;
        }

        const name = entry.fileName;
        const segments = name.split('/');
        if (name.startsWith('/') || name.includes('\\') || segments.includes('..')) {
          fail(createError(400, 'This presentation contains an unsafe or invalid package path.'));
          return;
        }

        uncompressedBytes += entry.uncompressedSize;
        if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
          fail(createError(413, 'The expanded presentation is too large to process safely.'));
          return;
        }

        if (/^ppt\/slides\/slide\d+\.xml$/i.test(name)) slideEntryCount += 1;
        const isContentTypes = name === '[Content_Types].xml';
        const isPresentation = name === 'ppt/presentation.xml';
        if (!isContentTypes && !isPresentation) {
          zipFile.readEntry();
          return;
        }
        const maxBytes = isContentTypes ? 1024 * 1024 : MAX_PRESENTATION_XML_BYTES;
        if (entry.uncompressedSize > maxBytes) {
          fail(createError(400, 'This PowerPoint package contains invalid presentation metadata.'));
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(createError(400, 'This PowerPoint package is damaged or could not be read.'));
            return;
          }
          const chunks = [];
          let size = 0;
          stream.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
              stream.destroy();
              fail(createError(400, 'This PowerPoint package contains invalid presentation metadata.'));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', () => {
            fail(createError(400, 'This PowerPoint package is damaged or could not be read.'));
          });
          stream.on('end', () => {
            if (settled) return;
            if (isContentTypes) contentTypes = Buffer.concat(chunks).toString('utf8');
            else presentationXml = Buffer.concat(chunks).toString('utf8');
            zipFile.readEntry();
          });
        });
      });

      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        const hasPresentationType =
          /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation\.main\+xml/i
            .test(contentTypes);
        const slideCount = (presentationXml.match(/<p:sldId(?:\s|>)/g) || []).length;
        if (!hasPresentationType || !presentationXml || !slideCount ||
            slideEntryCount < slideCount) {
          reject(createError(400, 'This file does not contain a complete, readable PPTX presentation.'));
          return;
        }
        if (slideCount > MAX_SLIDES) {
          reject(createError(413, 'This presentation contains more than ' + MAX_SLIDES + ' slides.'));
          return;
        }
        resolve({ format: 'pptx', slideCount });
      });

      zipFile.readEntry();
    });
  });
}

async function convertPresentation(file, options = {}) {
  const presentation = await validatePresentation(file);
  const executable = options.executable || process.env.SOFFICE_PATH || 'soffice';
  const prefixArgs = options.prefixArgs || [];
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'powerpoint-to-pdf-'));
  const inputDirectory = path.join(temporaryDirectory, 'input');
  const outputDirectory = path.join(temporaryDirectory, 'output');
  const profileDirectory = path.join(temporaryDirectory, 'profile');

  try {
    await Promise.all([
      fs.promises.mkdir(inputDirectory, { mode: 0o700 }),
      fs.promises.mkdir(outputDirectory, { mode: 0o700 }),
      fs.promises.mkdir(profileDirectory, { mode: 0o700 })
    ]);
    const inputPath = path.join(inputDirectory, 'presentation.' + presentation.format);
    const outputPath = path.join(outputDirectory, 'presentation.pdf');
    await fs.promises.writeFile(inputPath, file.buffer, { flag: 'wx', mode: 0o600 });

    const args = prefixArgs.concat([
      '--headless',
      '--nologo',
      '--nodefault',
      '--nofirststartwizard',
      '-env:UserInstallation=' + pathToFileURL(profileDirectory).href,
      '--convert-to',
      'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}',
      '--outdir',
      outputDirectory,
      inputPath
    ]);
    await runOfficeConverter(executable, args, options.timeout || CONVERSION_TIMEOUT_MS);

    let stat;
    try {
      stat = await fs.promises.stat(outputPath);
    } catch (error) {
      throw createError(422, 'The presentation could not be converted. It may be damaged or use unsupported content.');
    }
    if (!stat.isFile() || stat.size < 100 || stat.size > MAX_PDF_BYTES) {
      throw createError(422, 'The generated PDF is empty or exceeds the 100 MB output limit.');
    }

    const pdfBytes = await fs.promises.readFile(outputPath);
    if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw createError(422, 'The conversion engine did not produce a valid PDF.');
    }

    let pdf;
    try {
      pdf = await PDFDocument.load(pdfBytes, {
        throwOnInvalidObject: true,
        updateMetadata: false
      });
    } catch (error) {
      throw createError(422, 'The presentation could not be converted into a readable PDF.');
    }
    const pageCount = pdf.getPageCount();
    if (!pageCount || pageCount > MAX_SLIDES ||
        presentation.slideCount !== null && pageCount !== presentation.slideCount) {
      throw createError(422, 'The PDF did not contain every presentation slide. Conversion was stopped to avoid an incomplete result.');
    }

    return { bytes: pdfBytes, pageCount };
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw error;
    throw error;
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
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
        reject(createError(503, 'PowerPoint conversion is temporarily unavailable because the server office engine is not installed.'));
        return;
      }
      if (error.killed || error.code === 'ETIMEDOUT') {
        reject(createError(504, 'This presentation took too long to convert. Try a smaller presentation.'));
        return;
      }
      reject(createError(422, 'This presentation could not be converted. It may be damaged or use unsupported content.'));
    });
  });
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_PDF_BYTES,
  MAX_SLIDES,
  validatePresentation,
  inspectPptx,
  convertPresentation
};
