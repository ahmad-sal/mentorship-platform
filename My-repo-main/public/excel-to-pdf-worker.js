'use strict';

importScripts(
  '/vendor/xlsx.full.min.js',
  '/vendor/jspdf.umd.min.js',
  '/vendor/jspdf.plugin.autotable.min.js',
  '/excel-to-pdf-engine.js'
);

self.workbookData = null;
self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'clear') {
    self.workbookData = null;
    return;
  }

  try {
    if (event.data.type === 'inspect') {
      self.workbookData = self.ExcelToPdfEngine.parseWorkbook(
        new Uint8Array(event.data.bytes),
        event.data.fileName,
        self.XLSX
      );
      self.postMessage({
        type: 'ready',
        workbook: {
          sheetCount: self.workbookData.sheets.length,
          hiddenSheetCount: self.workbookData.hiddenSheetCount
        }
      });
      return;
    }

    if (event.data.type === 'convert') {
      if (!self.workbookData) throw new Error('Choose and validate an Excel workbook before converting.');
      var bytes = self.ExcelToPdfEngine.createPdf(
        self.workbookData,
        self.jspdf && self.jspdf.jsPDF,
        self.autoTable,
        event.data.fileName
      );
      self.postMessage({
        type: 'converted',
        bytes: bytes.buffer,
        sheetCount: self.workbookData.sheets.length,
        hiddenSheetCount: self.workbookData.hiddenSheetCount
      }, [bytes.buffer]);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      operation: event.data.type,
      message: error && error.message || 'The workbook could not be opened. Check the file and try again.'
    });
  }
});
