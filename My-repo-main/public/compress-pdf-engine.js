(function (root) {
  'use strict';

  var PRESETS = {
    extreme: { label: 'Extreme Compression', resolution: 96, quality: 0.58 },
    recommended: { label: 'Recommended Compression', resolution: 144, quality: 0.76 },
    less: { label: 'Less Compression', resolution: 200, quality: 0.9 }
  };
  var MAX_PAGES = 300;
  var MAX_CANVAS_PIXELS = 16000000;
  var MAX_CANVAS_SIDE = 4096;
  var MAX_OUTPUT_IMAGE_BYTES = 200 * 1024 * 1024;

  function getCompressionSettings(level) {
    var preset = PRESETS[level];
    if (!preset) throw new Error('Choose a compression level to continue.');
    return {
      label: preset.label,
      scale: preset.resolution / 72,
      quality: preset.quality,
      resolution: preset.resolution
    };
  }

  function calculateResults(originalSize, compressedSize) {
    var original = Number(originalSize);
    var compressed = Number(compressedSize);
    if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(compressed) || compressed < 0) {
      throw new Error('The PDF file sizes could not be measured.');
    }
    var difference = original - compressed;
    return {
      originalSize: original,
      compressedSize: compressed,
      savedBytes: difference,
      percentSaved: difference / original * 100,
      hasSavings: difference > 0,
      isLarger: difference < 0
    };
  }

  async function inspectPdf(file, pdfjs) {
    if (!file || !pdfjs) throw new Error('Select a PDF file to continue.');
    var bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      throw new Error('Could not read "' + file.name + '". Try selecting the file again.');
    }
    if (!hasPdfSignature(bytes)) throw new Error('The selected file does not contain a valid PDF header.');
    var document;
    try {
      document = await pdfjs.getDocument({
        data: bytes,
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false
      }).promise;
    } catch (error) {
      throw new Error(describePdfError(file.name, error));
    }
    if (!document.numPages) {
      document.destroy();
      throw new Error('"' + file.name + '" does not contain any pages.');
    }
    if (document.numPages > MAX_PAGES) {
      document.destroy();
      throw new Error('This PDF has more than ' + MAX_PAGES + ' pages. Try a smaller document to stay within browser memory limits.');
    }
    return { document: document, pageCount: document.numPages };
  }

  async function compressPdf(file, level, pdfjs, pdfLib, onProgress) {
    var settings = getCompressionSettings(level);
    if (!file || !pdfjs || !pdfLib) throw new Error('The PDF processing tools are unavailable. Refresh the page and try again.');
    var data;
    try {
      data = new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      throw new Error('Could not read "' + file.name + '". Try selecting the file again.');
    }
    if (!hasPdfSignature(data)) throw new Error('The selected file does not contain a valid PDF header.');
    var source;
    try {
      source = await pdfjs.getDocument({
        data: data,
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false
      }).promise;
    } catch (error) {
      throw new Error(describePdfError(file.name, error));
    }
    if (!source.numPages) {
      source.destroy();
      throw new Error('"' + file.name + '" does not contain any pages.');
    }
    if (source.numPages > MAX_PAGES) {
      source.destroy();
      throw new Error('This PDF has more than ' + MAX_PAGES + ' pages. Try a smaller document to stay within browser memory limits.');
    }

    var output;
    var imageBytesTotal = 0;
    try {
      output = await pdfLib.PDFDocument.create({ updateMetadata: false });
      for (var pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
        report({ stage: 'rendering', page: pageNumber, total: source.numPages });
        var page;
        var canvas;
        try {
          page = await source.getPage(pageNumber);
          var baseViewport = page.getViewport({ scale: 1 });
          var scale = getSafeScale(baseViewport.width, baseViewport.height, settings.scale);
          var viewport = page.getViewport({ scale: scale });
          canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          var context = canvas.getContext('2d', { alpha: false });
          if (!context) throw new Error('Canvas is unavailable.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport: viewport }).promise;

          var imageBlob = await canvasToJpeg(canvas, settings.quality);
          var imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
          imageBytesTotal += imageBytes.length;
          if (imageBytesTotal > MAX_OUTPUT_IMAGE_BYTES) {
            throw new Error('The compressed output would exceed the browser memory limit. Try fewer pages or a smaller PDF.');
          }
          var image = await output.embedJpg(imageBytes);
          var outputPage = output.addPage([baseViewport.width, baseViewport.height]);
          outputPage.drawImage(image, {
            x: 0,
            y: 0,
            width: baseViewport.width,
            height: baseViewport.height
          });
          canvas.width = 0;
          canvas.height = 0;
          imageBytes = null;
          imageBlob = null;
          page.cleanup();
        } catch (error) {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          if (error && error.message && error.message.indexOf('browser memory limit') !== -1) throw error;
          if (error && error.message && error.message.indexOf('canvas is unavailable') !== -1) throw error;
          throw new Error('Page ' + pageNumber + ' of "' + file.name + '" could not be rendered. The PDF may be damaged or too large for this browser.');
        }
        report({ stage: 'page-complete', page: pageNumber, total: source.numPages });
        if (pageNumber % 2 === 0) await yieldToBrowser();
      }
      report({ stage: 'saving', total: source.numPages });
      var outputBytes = await output.save({ useObjectStreams: true, addDefaultPage: false });
      if (!outputBytes || !outputBytes.length) throw new Error('The compressed PDF could not be generated.');
      report({ stage: 'complete', total: source.numPages });
      return outputBytes;
    } catch (error) {
      if (error && error.message && /^(Page |The compressed PDF|The compressed output|Canvas is unavailable)/.test(error.message)) throw error;
      throw new Error('The PDF could not be compressed. It may be too large or contain content this browser cannot process.');
    } finally {
      try { await source.destroy(); } catch (error) { /* The PDF.js worker may already be closed. */ }
    }

    function report(progress) {
      if (typeof onProgress === 'function') onProgress(progress);
    }
  }

  function getSafeScale(width, height, desiredScale) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('The PDF contains a page with invalid dimensions.');
    }
    var scale = Math.min(
      desiredScale,
      MAX_CANVAS_SIDE / width,
      MAX_CANVAS_SIDE / height,
      Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
    );
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('This PDF page is too large for this browser to process.');
    return scale;
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('The page image could not be encoded.'));
        }, 'image/jpeg', quality);
      } catch (error) {
        reject(new Error('The page image could not be encoded.'));
      }
    });
  }

  function hasPdfSignature(bytes) {
    var limit = Math.min(bytes.length - 5, 1024);
    for (var index = 0; index <= limit; index += 1) {
      if (bytes[index] === 37 && bytes[index + 1] === 80 && bytes[index + 2] === 68 &&
        bytes[index + 3] === 70 && bytes[index + 4] === 45) return true;
    }
    return false;
  }

  function describePdfError(name, error) {
    if (error && (error.name === 'PasswordException' || error.code === 1 || error.code === 2)) {
      return '"' + name + '" is password-protected. Remove its password protection and try again.';
    }
    var message = String(error && error.message || '').toLowerCase();
    if (message.indexOf('password') !== -1 || message.indexOf('encrypt') !== -1) {
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

  var api = {
    MAX_PAGES: MAX_PAGES,
    calculateResults: calculateResults,
    compressPdf: compressPdf,
    getCompressionSettings: getCompressionSettings,
    inspectPdf: inspectPdf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CompressPdfEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
