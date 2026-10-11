import * as PDFJS from '/vendor/pdfjs.js';

window.PDFJS = PDFJS;

(function () {
  'use strict';

  var root = document.querySelector('.split-pdf-page');
  if (!root) return;

  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var file = null;
  var pdfDocument = null;
  var pdfLoadingTask = null;
  var pageCount = 0;
  var selectedPages = new Set();
  var busy = false;
  var outputUrl = null;
  var observer = null;
  var renderQueue = Promise.resolve();
  var renderingTasks = new Map();
  var visiblePages = new Set();
  var renderedPages = new Set();
  var documentVersion = 0;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var uploadTitle = root.querySelector('[data-upload-title]');
  var uploadHint = root.querySelector('[data-upload-hint]');
  var documentInfo = root.querySelector('[data-document-info]');
  var documentName = root.querySelector('[data-document-name]');
  var pageCountLabel = root.querySelector('[data-page-count]');
  var rangePanel = root.querySelector('[data-range-panel]');
  var rangeForm = root.querySelector('[data-range-form]');
  var rangeFrom = root.querySelector('[data-range-from]');
  var rangeTo = root.querySelector('[data-range-to]');
  var rangeError = root.querySelector('[data-range-error]');
  var pagesSection = root.querySelector('[data-pages-section]');
  var pageGrid = root.querySelector('[data-page-grid]');
  var selectionSummary = root.querySelector('[data-selection-summary]');
  var splitButton = root.querySelector('[data-action="split"]');
  var splitLabel = root.querySelector('[data-split-label]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var status = root.querySelector('[data-status]');
  var statusMessage = root.querySelector('[data-status-message]');
  var progressWrap = root.querySelector('[data-progress-wrap]');
  var progressMessage = root.querySelector('[data-progress-message]');

  if (!window.SplitPdfEngine || !window.PDFJS || !window.PDFLib) {
    setStatus('The PDF tools could not be loaded. Refresh the page and try again.', 'error');
    return;
  }
  window.PDFJS.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs.worker.js';

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function setStatus(message, kind) {
    statusMessage.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }

  function setProgress(message) {
    progressWrap.hidden = !message;
    if (message) progressMessage.textContent = message;
  }

  function invalidateOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.hidden = true;
  }

  function updateControls() {
    var loaded = Boolean(pdfDocument);
    uploadArea.setAttribute('aria-disabled', String(busy));
    fileInput.disabled = busy;
    splitButton.hidden = !loaded;
    splitButton.disabled = busy || selectedPages.size === 0;
    splitButton.setAttribute('aria-busy', String(busy));
    splitLabel.textContent = busy ? 'Splitting…' : 'Split PDF';
    rangeFrom.disabled = busy || !loaded;
    rangeTo.disabled = busy || !loaded;
    root.querySelectorAll('[data-action="apply-range"], [data-action="select-all"], [data-action="deselect-all"], [data-page-number]')
      .forEach(function (button) { button.disabled = busy || !loaded; });
  }

  function releaseThumbnail(pageNumber) {
    var card = pageGrid.querySelector('[data-page-number="' + pageNumber + '"]');
    if (!card) return;
    var canvas = card.querySelector('canvas');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    if (card.querySelector('.split-page-thumbnail')) {
      card.querySelector('.split-page-thumbnail').innerHTML =
        '<span class="split-thumbnail-placeholder" aria-hidden="true"><span class="split-thumbnail-page"></span></span>';
    }
    renderedPages.delete(pageNumber);
  }

  function showThumbnailLoading(pageNumber) {
    var card = pageGrid.querySelector('[data-page-number="' + pageNumber + '"]');
    if (!card || renderedPages.has(pageNumber) || renderingTasks.has(pageNumber)) return;
    card.querySelector('.split-page-thumbnail').innerHTML =
      '<span class="split-thumbnail-placeholder" aria-hidden="true"><span class="split-spinner"></span></span>';
  }

  function clearDocument() {
    documentVersion += 1;
    invalidateOutput();
    if (observer) observer.disconnect();
    observer = null;
    renderingTasks.forEach(function (task) {
      try { task.cancel(); } catch (error) { /* A completed render cannot be cancelled. */ }
    });
    renderingTasks.clear();
    visiblePages.clear();
    renderedPages.clear();
    pageGrid.querySelectorAll('canvas').forEach(function (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    });
    if (pdfLoadingTask) {
      pdfLoadingTask.destroy().catch(function () {});
      pdfLoadingTask = null;
    } else if (pdfDocument) {
      pdfDocument.destroy().catch(function () {});
    }
    pdfDocument = null;
    file = null;
    pageCount = 0;
    selectedPages.clear();
    pageGrid.replaceChildren();
    documentInfo.hidden = true;
    rangePanel.hidden = true;
    pagesSection.hidden = true;
    rangeFrom.value = '';
    rangeTo.value = '';
    rangeFrom.removeAttribute('max');
    rangeTo.removeAttribute('max');
    rangeError.hidden = true;
    uploadTitle.textContent = 'Select PDF';
    uploadHint.textContent = 'Drop a PDF here or click to browse';
    selectionSummary.textContent = '0 pages selected out of 0';
    updateControls();
  }

  async function renderPageCards() {
    pageGrid.replaceChildren();
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var pageNumber = Number(entry.target.getAttribute('data-page-number'));
          if (entry.isIntersecting) {
            visiblePages.add(pageNumber);
            showThumbnailLoading(pageNumber);
            queueRender(pageNumber);
          } else {
            visiblePages.delete(pageNumber);
            var task = renderingTasks.get(pageNumber);
            if (task) {
              try { task.cancel(); } catch (error) { /* The render may already have completed. */ }
            } else {
              releaseThumbnail(pageNumber);
            }
          }
        });
      }, { root: null, rootMargin: '280px 0px', threshold: 0.01 });
    }

    for (var start = 1; start <= pageCount; start += 100) {
      var end = Math.min(start + 99, pageCount);
      var cards = [];
      for (var page = start; page <= end; page += 1) {
        cards.push(
          '<button class="split-page-card" type="button" data-page-number="' + page + '" aria-pressed="false" aria-label="Select page ' + page + '">' +
            '<span class="split-page-thumbnail"><span class="split-thumbnail-placeholder" aria-hidden="true"><span class="split-thumbnail-page"></span></span></span>' +
            '<span class="split-page-caption"><span>Page ' + page + '</span><span class="split-page-check" aria-hidden="true">✓</span></span>' +
          '</button>'
        );
      }
      pageGrid.insertAdjacentHTML('beforeend', cards.join(''));
      for (var visiblePage = start; visiblePage <= end; visiblePage += 1) {
        var card = pageGrid.querySelector('[data-page-number="' + visiblePage + '"]');
        if (observer) {
          observer.observe(card);
        } else {
          visiblePages.add(visiblePage);
          showThumbnailLoading(visiblePage);
          queueRender(visiblePage);
        }
      }
      if (end < pageCount) {
        setProgress('Preparing page choices… ' + end + ' of ' + pageCount);
        await new Promise(function (resolve) {
          if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(resolve);
          else window.setTimeout(resolve, 0);
        });
      }
    }
  }

  function queueRender(pageNumber) {
    renderQueue = renderQueue.then(function () {
      return renderPage(pageNumber);
    }).catch(function () {});
  }

  async function renderPage(pageNumber) {
    if (!pdfDocument || !visiblePages.has(pageNumber) || renderedPages.has(pageNumber)) return;
    var renderVersion = documentVersion;
    var renderDocument = pdfDocument;
    var card = pageGrid.querySelector('[data-page-number="' + pageNumber + '"]');
    if (!card) return;

    var task = null;
    try {
      var page = await renderDocument.getPage(pageNumber);
      if (renderVersion !== documentVersion || !visiblePages.has(pageNumber)) return;
      var naturalViewport = page.getViewport({ scale: 1 });
      var scale = Math.min(160 / naturalViewport.width, 210 / naturalViewport.height, 1);
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.setAttribute('aria-hidden', 'true');
      var thumbnail = card.querySelector('.split-page-thumbnail');
      thumbnail.replaceChildren(canvas);
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
      renderingTasks.set(pageNumber, task);
      await task.promise;
      if (renderingTasks.get(pageNumber) === task) renderingTasks.delete(pageNumber);
      if (renderVersion !== documentVersion) return;
      if (visiblePages.has(pageNumber)) {
        renderedPages.add(pageNumber);
      } else {
        releaseThumbnail(pageNumber);
      }
    } catch (error) {
      if (task && renderingTasks.get(pageNumber) === task) renderingTasks.delete(pageNumber);
      if (renderVersion !== documentVersion) return;
      if (error && error.name === 'RenderingCancelledException') {
        if (visiblePages.has(pageNumber)) queueRender(pageNumber);
        else releaseThumbnail(pageNumber);
        return;
      }
      if (visiblePages.has(pageNumber)) {
        var thumbnail = card.querySelector('.split-page-thumbnail');
        if (thumbnail) thumbnail.innerHTML = '<span class="split-thumbnail-error">Preview unavailable</span>';
      } else {
        releaseThumbnail(pageNumber);
      }
    }
  }

  function updateSelectionCard(pageNumber) {
    var card = pageGrid.querySelector('[data-page-number="' + pageNumber + '"]');
    if (!card) return;
    var isSelected = selectedPages.has(pageNumber);
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
    card.setAttribute('aria-label', (isSelected ? 'Deselect' : 'Select') + ' page ' + pageNumber);
  }

  function updateSelectionSummary() {
    selectionSummary.textContent = selectedPages.size + ' ' +
      (selectedPages.size === 1 ? 'page' : 'pages') + ' selected out of ' + pageCount;
  }

  function changeSelection(nextPages, message) {
    var changed = selectedPages.size !== nextPages.size;
    if (!changed) {
      selectedPages.forEach(function (page) {
        if (!nextPages.has(page)) changed = true;
      });
    }
    if (!changed) return;
    selectedPages = nextPages;
    invalidateOutput();
    pageGrid.querySelectorAll('[data-page-number]').forEach(function (card) {
      updateSelectionCard(Number(card.getAttribute('data-page-number')));
    });
    updateSelectionSummary();
    updateControls();
    setStatus(message || 'Page selection updated. Split again to refresh the download.', '');
  }

  function validateFile(fileToLoad) {
    if (!fileToLoad || !/\.pdf$/i.test(fileToLoad.name)) {
      return 'Choose a file with a .pdf extension.';
    }
    var type = String(fileToLoad.type || '').toLowerCase();
    if (type && type !== 'application/pdf' && type !== 'application/octet-stream') {
      return 'The selected file is not a PDF.';
    }
    if (!fileToLoad.size) return 'The selected PDF is empty.';
    if (fileToLoad.size > MAX_FILE_BYTES) return 'This PDF is larger than the 100 MB browser-processing limit.';
    return '';
  }

  async function loadPdf(fileToLoad) {
    if (busy || !fileToLoad) return;
    clearDocument();
    var validationError = validateFile(fileToLoad);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    busy = true;
    updateControls();
    setProgress('Reading and checking the PDF…');
    setStatus('Loading the document locally in your browser.', '');

    try {
      var bytes = new Uint8Array(await fileToLoad.arrayBuffer());
      if (!hasPdfSignature(bytes)) throw new Error('The selected file does not contain a valid PDF header.');
      var verifiedPageCount = await window.SplitPdfEngine.inspectPdf(bytes, fileToLoad.name);
      pdfLoadingTask = window.PDFJS.getDocument({
        data: bytes.slice(),
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false
      });
      var loadedDocument = await pdfLoadingTask.promise;
      if (!loadedDocument.numPages) throw new Error('This PDF does not contain any pages.');
      if (loadedDocument.numPages !== verifiedPageCount) {
        throw new Error('The PDF page count could not be verified consistently. Try re-exporting the document.');
      }
      pdfDocument = loadedDocument;
      file = fileToLoad;
      pageCount = loadedDocument.numPages;
      updateControls();
      documentName.textContent = file.name;
      pageCountLabel.textContent = String(pageCount);
      documentInfo.hidden = false;
      rangePanel.hidden = false;
      pagesSection.hidden = false;
      rangeFrom.max = String(pageCount);
      rangeTo.max = String(pageCount);
      uploadTitle.textContent = 'Replace PDF';
      uploadHint.textContent = 'Choose another PDF or drop it here';
      await renderPageCards();
      updateSelectionSummary();
      setStatus('PDF loaded. Select pages individually or apply a page range.', 'success');
    } catch (error) {
      clearDocument();
      setStatus(pdfLoadError(fileToLoad.name, error), 'error');
    } finally {
      busy = false;
      setProgress('');
      updateControls();
    }
  }

  function hasPdfSignature(bytes) {
    var limit = Math.min(bytes.length - 4, 1024);
    for (var index = 0; index <= limit; index += 1) {
      if (bytes[index] === 37 && bytes[index + 1] === 80 && bytes[index + 2] === 68 &&
        bytes[index + 3] === 70 && bytes[index + 4] === 45) return true;
    }
    return false;
  }

  function pdfLoadError(fileName, error) {
    var message = String(error && error.message || '').toLowerCase();
    if (message.indexOf('password') !== -1 || message.indexOf('encrypt') !== -1) {
      return '"' + fileName + '" is password-protected. Remove its password protection and try again.';
    }
    if (message.indexOf('memory') !== -1 || message.indexOf('array buffer') !== -1) {
      return '"' + fileName + '" is too large for this browser to process. Try a smaller file.';
    }
    if (message.indexOf('valid pdf header') !== -1) return 'The selected file does not contain a valid PDF header.';
    if (message.indexOf('does not contain any pages') !== -1 || message.indexOf('could not be read') !== -1) {
      return error.message;
    }
    return '"' + fileName + '" could not be opened. It may be damaged or use unsupported PDF features. Try re-exporting it as a standard PDF.';
  }

  function showRangeError(message) {
    rangeError.textContent = message;
    rangeError.hidden = !message;
  }

  function applyRange() {
    if (!pdfDocument) return;
    var fromValue = rangeFrom.value.trim();
    var toValue = rangeTo.value.trim();
    var from = Number(fromValue);
    var to = Number(toValue);
    if (!fromValue || !toValue || !Number.isInteger(from) || !Number.isInteger(to)) {
      showRangeError('Enter whole page numbers for both the start and end of the range.');
      return;
    }
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
      showRangeError('Page numbers must be between 1 and ' + pageCount + '.');
      return;
    }
    if (from > to) {
      showRangeError('From Page must be less than or equal to To Page.');
      return;
    }
    showRangeError('');
    var nextPages = new Set();
    for (var page = from; page <= to; page += 1) nextPages.add(page);
    changeSelection(nextPages, 'Selected pages ' + from + ' through ' + to + '.');
  }

  function splitProgressText(progress) {
    if (progress.stage === 'copying') {
      return 'Copying selected page ' + progress.index + ' of ' + progress.total + '…';
    }
    if (progress.stage === 'saving') return 'Generating the new PDF…';
    return '';
  }

  async function splitSelectedPages() {
    if (busy) return;
    if (!file || !selectedPages.size) {
      setStatus('Select at least one page before splitting the PDF.', 'error');
      return;
    }

    busy = true;
    updateControls();
    setStatus('Selected pages are being extracted locally in this browser.', '');
    setProgress('Preparing the selected pages…');
    try {
      var bytes = await window.SplitPdfEngine.extractPages(file, Array.from(selectedPages), function (progress) {
        var message = splitProgressText(progress);
        if (message) setProgress(message);
      });
      var nextUrl;
      try {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        if (!blob.size) throw new Error('empty output');
        nextUrl = URL.createObjectURL(blob);
      } catch (error) {
        throw new Error('The PDF was generated, but this browser could not prepare the download. Try selecting fewer pages.');
      }
      invalidateOutput();
      outputUrl = nextUrl;
      downloadButton.href = outputUrl;
      downloadButton.hidden = false;
      setStatus('Your PDF is ready. It contains ' + selectedPages.size + ' selected ' +
        (selectedPages.size === 1 ? 'page' : 'pages') + ' in the original document order.', 'success');
    } catch (error) {
      setStatus(error && error.message ? error.message :
        'The selected pages could not be extracted. Check the PDF and try again.', 'error');
    } finally {
      busy = false;
      setProgress('');
      updateControls();
    }
  }

  function triggerPicker() {
    if (!busy) fileInput.click();
  }

  uploadArea.addEventListener('click', function (event) {
    if (!event.target.closest('button')) triggerPicker();
  });
  uploadArea.addEventListener('keydown', function (event) {
    if (event.target !== uploadArea || busy) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerPicker();
    }
  });
  uploadArea.addEventListener('dragenter', function (event) {
    event.preventDefault();
    if (!busy && event.dataTransfer && event.dataTransfer.types.indexOf('Files') !== -1) {
      uploadArea.classList.add('is-dragging');
    }
  });
  uploadArea.addEventListener('dragover', function (event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  });
  uploadArea.addEventListener('dragleave', function (event) {
    if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove('is-dragging');
  });
  uploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadArea.classList.remove('is-dragging');
    if (!busy && event.dataTransfer && event.dataTransfer.files.length) loadPdf(event.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', function () {
    var nextFile = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (nextFile) loadPdf(nextFile);
  });
  rangeForm.addEventListener('submit', function (event) {
    event.preventDefault();
    applyRange();
  });
  rangeFrom.addEventListener('input', function () { showRangeError(''); });
  rangeTo.addEventListener('input', function () { showRangeError(''); });

  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action], button[data-page-number]');
    if (!button || !root.contains(button) || busy) return;
    var action = button.getAttribute('data-action');
    if (action === 'split') {
      splitSelectedPages();
    } else if (action === 'select-all') {
      var allPages = new Set();
      for (var page = 1; page <= pageCount; page += 1) allPages.add(page);
      changeSelection(allPages, 'All ' + pageCount + ' pages are selected.');
    } else if (action === 'deselect-all') {
      changeSelection(new Set(), 'No pages are selected. Choose at least one page to split.');
    } else if (button.hasAttribute('data-page-number')) {
      var pageNumber = Number(button.getAttribute('data-page-number'));
      var nextSelection = new Set(selectedPages);
      if (nextSelection.has(pageNumber)) nextSelection.delete(pageNumber);
      else nextSelection.add(pageNumber);
      changeSelection(nextSelection, 'Page ' + pageNumber +
        (nextSelection.has(pageNumber) ? ' selected.' : ' deselected.'));
    }
  });

  window.addEventListener('pagehide', function () {
    invalidateOutput();
    if (observer) observer.disconnect();
    if (pdfLoadingTask) pdfLoadingTask.destroy().catch(function () {});
    else if (pdfDocument) pdfDocument.destroy().catch(function () {});
  });

  updateControls();
})();
