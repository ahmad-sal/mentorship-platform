(function (root) {
  'use strict';

  var MAX_FILE_BYTES = 50 * 1024 * 1024;
  var MAX_SHEETS = 30;
  var MAX_ROWS_PER_SHEET = 5000;
  var MAX_COLUMNS = 40;
  var MAX_TOTAL_CELLS = 50000;
  var MAX_TEXT_CHARACTERS = 5000000;
  var WIN_ANSI_EXTRAS = {
    338: true, 339: true, 352: true, 353: true, 376: true,
    381: true, 382: true, 402: true, 710: true, 732: true,
    8211: true, 8212: true, 8216: true, 8217: true, 8218: true,
    8220: true, 8221: true, 8222: true, 8224: true, 8225: true,
    8226: true, 8230: true, 8240: true, 8249: true, 8250: true,
    8364: true, 8482: true
  };
  var SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xlsb'];

  function parseWorkbook(bytes, fileName, xlsx) {
    if (!xlsx || typeof xlsx.read !== 'function') {
      throw new Error('The Excel reader could not be loaded. Refresh the page and try again.');
    }
    if (!(bytes instanceof Uint8Array) || !bytes.length) {
      throw new Error('The selected workbook is empty or could not be read.');
    }
    if (bytes.length > MAX_FILE_BYTES) {
      throw new Error('This workbook is larger than the 50 MB browser-processing limit.');
    }
    if (!hasSupportedExtension(fileName)) {
      throw new Error('Choose an Excel workbook with an .xlsx, .xls, .xlsm, or .xlsb extension.');
    }
    if (!hasWorkbookSignature(bytes)) {
      throw new Error('The file does not have a valid Excel workbook signature.');
    }

    var workbook;
    try {
      workbook = xlsx.read(bytes, {
        type: 'array',
        cellDates: true,
        cellStyles: true,
        bookVBA: false,
        WTF: true
      });
    } catch (error) {
      throw new Error(describeWorkbookError(error));
    }
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) {
      throw new Error('This file does not contain any readable worksheets.');
    }
    if (workbook.SheetNames.length > MAX_SHEETS) {
      throw new Error('This workbook has more than ' + MAX_SHEETS + ' worksheets and is too large to convert safely in the browser.');
    }

    var sheetMetadata = workbook.Workbook && Array.isArray(workbook.Workbook.Sheets)
      ? workbook.Workbook.Sheets : [];
    var sheets = [];
    var hiddenSheetCount = 0;
    var totalCells = 0;
    var totalCharacters = 0;

    workbook.SheetNames.forEach(function (name, sheetIndex) {
      var metadata = sheetMetadata[sheetIndex];
      if (metadata && metadata.Hidden) {
        hiddenSheetCount += 1;
        return;
      }
      var worksheet = workbook.Sheets[name];
      var reference = worksheet && worksheet['!ref'];
      if (!reference) return;

      var range;
      try {
        range = xlsx.utils.decode_range(reference);
      } catch (error) {
        throw new Error('The worksheet "' + name + '" has an invalid cell range.');
      }
      var rowCount = range.e.r - range.s.r + 1;
      var columnCount = range.e.c - range.s.c + 1;
      if (rowCount < 1 || columnCount < 1) return;
      if (rowCount > MAX_ROWS_PER_SHEET || columnCount > MAX_COLUMNS) {
        throw new Error('The worksheet "' + name + '" exceeds the limit of ' +
          MAX_ROWS_PER_SHEET + ' rows or ' + MAX_COLUMNS + ' columns supported per worksheet.');
      }

      totalCells += rowCount * columnCount;
      if (totalCells > MAX_TOTAL_CELLS) {
        throw new Error('This workbook contains too many cells for reliable browser conversion. Try a smaller workbook.');
      }

      var hiddenRows = worksheet['!rows'] || [];
      var hiddenColumns = worksheet['!cols'] || [];
      var rows = [];
      var columnIndexes = [];
      for (var column = range.s.c; column <= range.e.c; column += 1) {
        if (!hiddenColumns[column] || !hiddenColumns[column].hidden) columnIndexes.push(column);
      }
      if (!columnIndexes.length) return;

      for (var row = range.s.r; row <= range.e.r; row += 1) {
        if (hiddenRows[row] && hiddenRows[row].hidden) continue;
        var values = columnIndexes.map(function (columnIndex) {
          var address = xlsx.utils.encode_cell({ r: row, c: columnIndex });
          var cell = worksheet[address];
          var text = getCellText(cell, xlsx);
          totalCharacters += text.length;
          if (totalCharacters > MAX_TEXT_CHARACTERS) {
            throw new Error('This workbook contains too much text for reliable browser conversion.');
          }
          validatePdfText(text);
          return text;
        });
        if (values.some(function (value) { return value !== ''; })) rows.push(values);
      }
      if (!rows.length) return;

      var firstRow = rows[0];
      var hasHeader = firstRow.some(function (value) { return value !== ''; }) &&
        firstRow.some(function (value) { return value !== '' && !isNumericValue(value); });
      var headers = hasHeader
        ? firstRow.map(function (value, index) { return value || columnLabel(index); })
        : columnIndexes.map(function (columnIndex) { return columnLabel(columnIndex); });
      var dataRows = hasHeader ? rows.slice(1) : rows;

      sheets.push({
        name: String(name),
        headers: headers,
        rows: dataRows,
        rowCount: rows.length,
        columnCount: columnIndexes.length
      });
    });

    if (!sheets.length) {
      throw new Error(hiddenSheetCount
        ? 'This workbook has no visible worksheets with readable cell values.'
        : 'No readable cell values were found in this workbook.');
    }
    return {
      sheets: sheets,
      hiddenSheetCount: hiddenSheetCount,
      cellCount: totalCells
    };
  }

  function createPdf(workbook, jsPDF, autoTable, sourceName) {
    if (!workbook || !Array.isArray(workbook.sheets) || !workbook.sheets.length) {
      throw new Error('Choose a readable Excel workbook before converting.');
    }
    if (typeof jsPDF !== 'function' || typeof autoTable !== 'function') {
      throw new Error('The PDF generator could not be loaded. Refresh the page and try again.');
    }
    var document;
    try {
      document = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      workbook.sheets.forEach(function (sheet, sheetIndex) {
        var orientation = sheet.columnCount > 5 ? 'landscape' : 'portrait';
        if (sheetIndex === 0) {
          if (orientation === 'landscape') document = new jsPDF({
            orientation: orientation,
            unit: 'pt',
            format: 'a4',
            compress: true
          });
        } else {
          document.addPage('a4', orientation);
        }

        var margin = { top: 58, right: 32, bottom: 34, left: 32 };
        var fontSize = Math.max(5, Math.min(9, Math.floor(46 / sheet.columnCount)));
        var header = sheet.headers.map(function (value) { return String(value); });
        var body = sheet.rows.map(function (row) {
          return header.map(function (_, columnIndex) {
            return row[columnIndex] == null ? '' : String(row[columnIndex]);
          });
        });

        autoTable(document, {
          head: [header],
          body: body,
          startY: 58,
          margin: margin,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: fontSize,
            cellPadding: 3,
            overflow: 'linebreak',
            valign: 'middle',
            lineColor: [218, 226, 240],
            lineWidth: 0.35,
            textColor: [23, 32, 51]
          },
          headStyles: {
            fillColor: [30, 64, 175],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          alternateRowStyles: { fillColor: [246, 248, 252] },
          horizontalPageBreak: true,
          horizontalPageBreakRepeat: 0,
          rowPageBreak: 'avoid',
          didDrawPage: function () {
            document.setFont('helvetica', 'bold');
            document.setFontSize(13);
            document.setTextColor(23, 32, 51);
            document.text(toPdfLabel(trimLabel(sourceName || 'Excel workbook', 90)), margin.left, 27);
            document.setFont('helvetica', 'normal');
            document.setFontSize(9);
            document.setTextColor(90, 103, 125);
            document.text(toPdfLabel(trimLabel(sheet.name, 110)), margin.left, 43);
          }
        });
      });

      var pageCount = document.internal.getNumberOfPages();
      for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        document.setPage(pageNumber);
        var width = document.internal.pageSize.getWidth();
        var height = document.internal.pageSize.getHeight();
        document.setFont('helvetica', 'normal');
        document.setFontSize(8);
        document.setTextColor(120, 130, 148);
        document.text('Page ' + pageNumber + ' of ' + pageCount, width - 32, height - 17, { align: 'right' });
      }
      var output = document.output('arraybuffer');
      if (!output || output.byteLength < 100) {
        throw new Error('The generated PDF is empty or invalid.');
      }
      return new Uint8Array(output);
    } catch (error) {
      if (error && error.message && /^The generated PDF/.test(error.message)) throw error;
      throw new Error('The PDF could not be generated. The workbook may contain content this browser cannot render.');
    }
  }

  function getCellText(cell, xlsx) {
    if (!cell || cell.v == null && !cell.f) return '';
    var formatted = '';
    try {
      formatted = xlsx.utils.format_cell(cell);
    } catch (error) {
      formatted = '';
    }
    if (formatted !== '') return cleanText(formatted);
    if (cell.f && cell.v == null) return cleanText('=' + cell.f);
    if (cell.v instanceof Date) return cleanText(cell.v.toISOString());
    if (typeof cell.v === 'string' || typeof cell.v === 'number' || typeof cell.v === 'boolean') {
      return cleanText(String(cell.v));
    }
    return '';
  }

  function cleanText(text) {
    return String(text).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  }

  function validatePdfText(text) {
    for (var index = 0; index < text.length; index += 1) {
      var codePoint = text.codePointAt(index);
      if (codePoint > 0xffff) index += 1;
      if (codePoint < 32 && codePoint !== 10) continue;
      if (isSupportedPdfCharacter(codePoint)) continue;
      if (codePoint < 32) continue;
      throw new Error('This workbook contains characters outside the PDF font’s supported Western character set. Replace those characters and try again.');
    }
  }

  function isSupportedPdfCharacter(codePoint) {
    return codePoint <= 255 && (codePoint < 128 || codePoint >= 160) || Boolean(WIN_ANSI_EXTRAS[codePoint]);
  }

  function toPdfLabel(value) {
    return Array.from(String(value || '')).map(function (character) {
      return isSupportedPdfCharacter(character.codePointAt(0)) ? character : '?';
    }).join('');
  }

  function hasSupportedExtension(fileName) {
    var name = String(fileName || '').toLowerCase();
    return SUPPORTED_EXTENSIONS.some(function (extension) {
      return name.endsWith(extension);
    });
  }

  function hasWorkbookSignature(bytes) {
    var isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      (bytes[2] === 0x03 && bytes[3] === 0x04 ||
        bytes[2] === 0x05 && bytes[3] === 0x06 ||
        bytes[2] === 0x07 && bytes[3] === 0x08);
    var isOle = bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf &&
      bytes[2] === 0x11 && bytes[3] === 0xe0 && bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
    return isZip || isOle;
  }

  function isNumericValue(value) {
    return value !== '' && Number.isFinite(Number(value));
  }

  function columnLabel(index) {
    var label = '';
    var value = index + 1;
    while (value > 0) {
      var remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function trimLabel(value, maximumLength) {
    var label = String(value || '').replace(/[\r\n]/g, ' ').trim();
    return label.length > maximumLength ? label.slice(0, maximumLength - 1) + '…' : label;
  }

  function describeWorkbookError(error) {
    var message = String(error && error.message || '');
    if (/password|encrypt/i.test(message)) {
      return 'This workbook is password-protected or encrypted. Remove its password protection and try again.';
    }
    if (/zip|cfb|file|format|corrupt|invalid|end of data|unexpected/i.test(message)) {
      return 'This workbook could not be opened. It may be damaged, encrypted, or in an unsupported Excel format.';
    }
    return 'The workbook could not be read. Check that it is a valid Excel file and try again.';
  }

  var api = {
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    parseWorkbook: parseWorkbook,
    createPdf: createPdf,
    hasSupportedExtension: hasSupportedExtension,
    hasWorkbookSignature: hasWorkbookSignature
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExcelToPdfEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
