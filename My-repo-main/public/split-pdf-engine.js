(function (root) {
  'use strict';

  var library = root && root.PDFLib;
  if (!library && typeof require === 'function') library = require('pdf-lib');
  if (!library) throw new Error('The PDF processing library is unavailable.');

  async function inspectPdf(bytes, fileName) {
    var document;
    try {
      document = await library.PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false
      });
    } catch (error) {
      throw new Error(describeSourceError(fileName, error));
    }
    var pageCount;
    try {
      pageCount = document.getPageCount();
    } catch (error) {
      throw new Error(describeSourceError(fileName, error));
    }
    if (!pageCount) throw new Error('"' + fileName + '" does not contain any pages.');
    return pageCount;
  }

  async function extractPages(file, selectedPages, onProgress) {
    if (!file || !Array.isArray(selectedPages) || selectedPages.length === 0) {
      throw new Error('Select at least one page to split.');
    }

    var sourceBytes;
    try {
      sourceBytes = await file.arrayBuffer();
    } catch (error) {
      throw new Error('Could not read "' + file.name + '". Try selecting the file again.');
    }

    var sourceDocument;
    try {
      sourceDocument = await library.PDFDocument.load(sourceBytes, {
        ignoreEncryption: false,
        updateMetadata: false
      });
    } catch (error) {
      throw new Error(describeSourceError(file.name, error));
    }

    var pageCount = sourceDocument.getPageCount();
    if (!pageCount) throw new Error('"' + file.name + '" does not contain any pages.');
    var pageNumbers = Array.from(new Set(selectedPages));
    if (pageNumbers.some(function (page) {
      return !Number.isInteger(page) || page < 1 || page > pageCount;
    })) {
      throw new Error('One or more selected pages are outside this document.');
    }
    pageNumbers.sort(function (left, right) { return left - right; });

    var output = await library.PDFDocument.create({ updateMetadata: false });
    var copiedPages;
    try {
      copiedPages = await output.copyPages(sourceDocument, pageNumbers.map(function (page) { return page - 1; }));
    } catch (error) {
      throw new Error(describeSourceError(file.name, error));
    }

    for (var index = 0; index < copiedPages.length; index += 1) {
      try {
        output.addPage(copiedPages[index]);
      } catch (error) {
        throw new Error(describeSourceError(file.name, error));
      }
      report({ stage: 'copying', page: pageNumbers[index], index: index + 1, total: copiedPages.length });
      if ((index + 1) % 5 === 0) await yieldToBrowser();
    }

    report({ stage: 'saving', total: copiedPages.length });
    var bytes;
    try {
      bytes = await output.save({ useObjectStreams: true, addDefaultPage: false });
    } catch (error) {
      throw new Error('The selected pages could not be generated. Try a smaller or re-exported PDF.');
    }
    if (!bytes || !bytes.length) throw new Error('The selected pages could not be generated.');
    report({ stage: 'complete', total: copiedPages.length });
    return bytes;

    function report(state) {
      if (typeof onProgress === 'function') onProgress(state);
    }
  }

  function describeSourceError(name, error) {
    var message = String(error && error.message || '').toLowerCase();
    if (message.indexOf('encrypt') !== -1 || message.indexOf('password') !== -1) {
      return '"' + name + '" is password-protected. Remove its password protection and try again.';
    }
    if (message.indexOf('memory') !== -1 || message.indexOf('array buffer') !== -1) {
      return '"' + name + '" is too large for this browser to process. Try a smaller file.';
    }
    return '"' + name + '" could not be read. It may be damaged or use unsupported PDF features. Try re-exporting it as a standard PDF.';
  }

  function yieldToBrowser() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  var api = { inspectPdf: inspectPdf, extractPages: extractPages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SplitPdfEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
