(function (root) {
  'use strict';

  var library = root && root.PDFLib;
  if (!library && typeof require === 'function') library = require('pdf-lib');
  if (!library) throw new Error('The PDF processing library is unavailable.');

  async function validatePdfFile(file) {
    var bytes;
    try {
      bytes = await file.arrayBuffer();
    } catch (error) {
      throw new Error('Could not read "' + file.name + '". Try selecting the file again.');
    }

    try {
      var document = await library.PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false
      });
      var pageCount = document.getPageCount();
      if (!pageCount) throw new Error('"' + file.name + '" does not contain any pages.');
      return pageCount;
    } catch (error) {
      if (error && error.message && error.message.indexOf('does not contain any pages') !== -1) throw error;
      throw new Error(describeSourceError(file.name, error));
    }
  }

  async function mergePdfs(files, onProgress) {
    if (!Array.isArray(files) || files.length < 2) {
      throw new Error('Select at least two PDF files to merge.');
    }

    var mergedDocument = await library.PDFDocument.create({ updateMetadata: false });
    var totalPages = 0;

    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      var file = files[fileIndex];
      report({ stage: 'reading', fileName: file.name, fileIndex: fileIndex + 1, totalFiles: files.length });

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

      var pageIndices;
      try {
        pageIndices = sourceDocument.getPageIndices();
      } catch (error) {
        throw new Error(describeSourceError(file.name, error));
      }
      if (!pageIndices.length) {
        throw new Error('"' + file.name + '" does not contain any pages.');
      }

      var copiedPages;
      try {
        copiedPages = await mergedDocument.copyPages(sourceDocument, pageIndices);
      } catch (error) {
        throw new Error(describeSourceError(file.name, error));
      }

      for (var pageIndex = 0; pageIndex < copiedPages.length; pageIndex += 1) {
        try {
          mergedDocument.addPage(copiedPages[pageIndex]);
        } catch (error) {
          throw new Error(describeSourceError(file.name, error));
        }
        totalPages += 1;
        report({
          stage: 'copying',
          fileName: file.name,
          fileIndex: fileIndex + 1,
          totalFiles: files.length,
          pageIndex: pageIndex + 1,
          filePages: copiedPages.length,
          totalPages: totalPages
        });
        if ((pageIndex + 1) % 5 === 0) await yieldToBrowser();
      }
      copiedPages = null;
      sourceDocument = null;
      sourceBytes = null;
    }

    if (!totalPages) throw new Error('No pages were available to merge.');

    report({ stage: 'saving', totalFiles: files.length, totalPages: totalPages });
    var bytes;
    try {
      bytes = await mergedDocument.save({ useObjectStreams: true, addDefaultPage: false });
    } catch (error) {
      throw new Error('The merged PDF could not be generated. Try using smaller or re-exported files.');
    }
    if (!bytes || !bytes.length) throw new Error('The merged PDF could not be generated.');
    report({ stage: 'complete', totalFiles: files.length, totalPages: totalPages });
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

  var api = { mergePdfs: mergePdfs, validatePdfFile: validatePdfFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MergePdfEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
