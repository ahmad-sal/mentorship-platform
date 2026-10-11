import * as PDFJS from '/vendor/pdfjs.js';

window.PDFJS = PDFJS;

(function () {
  'use strict';

  var root = document.querySelector('.compress-pdf-page');
  if (!root || !window.CompressPdfEngine || !window.PDFJS || !window.PDFLib) return;

  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var file = null;
  var busy = false;
  var outputUrl = null;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var uploadTitle = root.querySelector('[data-upload-title]');
  var uploadHint = root.querySelector('[data-upload-hint]');
  var fileInfo = root.querySelector('[data-file-info]');
  var fileName = root.querySelector('[data-file-name]');
  var fileSize = root.querySelector('[data-file-size]');
  var levelSection = root.querySelector('[data-level-section]');
  var privacyNote = root.querySelector('[data-privacy-note]');
  var compressionInputs = Array.prototype.slice.call(root.querySelectorAll('input[name="compressionLevel"]'));
  var compressButton = root.querySelector('[data-action="compress"]');
  var compressLabel = root.querySelector('[data-compress-label]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var results = root.querySelector('[data-results]');
  var resultTitle = root.querySelector('[data-result-title]');
  var resultDetail = root.querySelector('[data-result-detail]');
  var donut = root.querySelector('[data-donut]');
  var donutSaved = root.querySelector('[data-donut-saved]');
  var donutValue = root.querySelector('[data-donut-value]');
  var donutLabel = root.querySelector('.compress-donut-label');
  var originalSizeLabel = root.querySelector('[data-original-size]');
  var compressedSizeLabel = root.querySelector('[data-compressed-size]');
  var differenceLabel = root.querySelector('[data-size-difference]');
  var status = root.querySelector('[data-status]');
  var statusMessage = root.querySelector('[data-status-message]');
  var progressWrap = root.querySelector('[data-progress-wrap]');
  var progressMessage = root.querySelector('[data-progress-message]');

  window.PDFJS.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs.worker.js';

  function setStatus(message, kind) {
    statusMessage.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }

  function setProgress(message) {
    progressWrap.hidden = !message;
    if (message) progressMessage.textContent = message;
  }

  function selectedLevel() {
    var selected = compressionInputs.find(function (input) { return input.checked; });
    return selected ? selected.value : '';
  }

  function updateControls() {
    var hasFile = Boolean(file);
    uploadArea.setAttribute('aria-disabled', String(busy));
    fileInput.disabled = busy;
    root.querySelector('[data-action="replace"]').disabled = busy;
    compressionInputs.forEach(function (input) { input.disabled = busy || !hasFile; });
    compressButton.hidden = !hasFile;
    compressButton.disabled = busy || !hasFile || !selectedLevel();
    compressButton.setAttribute('aria-busy', String(busy));
    compressLabel.textContent = busy ? 'Compressing…' : 'Compress PDF';
  }

  function invalidateResult() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.hidden = true;
    results.hidden = true;
  }

  function clearSelection() {
    invalidateResult();
    file = null;
    fileInfo.hidden = true;
    levelSection.hidden = true;
    privacyNote.hidden = true;
    compressionInputs.forEach(function (input) { input.checked = false; });
    uploadTitle.textContent = 'Select PDF File';
    uploadHint.textContent = 'Drop PDF here or click to browse';
    updateControls();
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB'];
    var size = bytes / 1024;
    var index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return size.toFixed(size >= 10 ? 1 : 2) + ' ' + units[index];
  }

  function formatPercent(value) {
    var rounded = Math.round(value * 10) / 10;
    if (rounded === 0 && value > 0) return 'less than 0.1%';
    return rounded.toFixed(1) + '%';
  }

  function validateFile(fileToLoad) {
    if (!fileToLoad || !/\.pdf$/i.test(fileToLoad.name)) return 'Choose a file with a .pdf extension.';
    var type = String(fileToLoad.type || '').toLowerCase();
    if (type && type !== 'application/pdf' && type !== 'application/octet-stream') {
      return 'The selected file is not a PDF.';
    }
    if (!fileToLoad.size) return 'The selected PDF is empty.';
    if (fileToLoad.size > MAX_FILE_BYTES) return 'This PDF is larger than the 100 MB browser-processing limit.';
    return '';
  }

  function hasPdfSignature(bytes) {
    return bytes.length >= 5 && bytes[0] === 37 && bytes[1] === 80 &&
      bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
  }

  async function loadPdf(nextFile) {
    if (busy || !nextFile) return;
    clearSelection();
    var validationError = validateFile(nextFile);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    busy = true;
    updateControls();
    setProgress('Checking the PDF pages…');
    setStatus('Reading the document locally in your browser.', '');
    var inspected = null;
    try {
      inspected = await window.CompressPdfEngine.inspectPdf(nextFile, window.PDFJS);
      file = nextFile;
      fileName.textContent = nextFile.name;
      fileSize.textContent = formatSize(nextFile.size);
      fileInfo.hidden = false;
      levelSection.hidden = false;
      privacyNote.hidden = false;
      uploadTitle.textContent = 'Replace PDF File';
      uploadHint.textContent = 'Choose another PDF or drop it here';
      setStatus('PDF ready. Select one compression level to continue.', 'success');
    } catch (error) {
      clearSelection();
      setStatus(error && error.message ? error.message :
        'This PDF could not be opened. It may be damaged, encrypted, or too large for this browser.', 'error');
    } finally {
      if (inspected && inspected.document) {
        try { await inspected.document.destroy(); } catch (error) { /* The worker may already be closed. */ }
      }
      inspected = null;
      busy = false;
      setProgress('');
      updateControls();
    }
  }

  function progressText(progress) {
    if (progress.stage === 'rendering') {
      return 'Rendering page ' + progress.page + ' of ' + progress.total + '…';
    }
    if (progress.stage === 'page-complete') {
      return 'Processed page ' + progress.page + ' of ' + progress.total + '.';
    }
    if (progress.stage === 'saving') return 'Building the compressed PDF…';
    return '';
  }

  function showResults(compressedSize) {
    var measured;
    try {
      measured = window.CompressPdfEngine.calculateResults(file.size, compressedSize);
    } catch (error) {
      throw new Error('The original and compressed file sizes could not be measured.');
    }

    originalSizeLabel.textContent = formatSize(measured.originalSize);
    compressedSizeLabel.textContent = formatSize(measured.compressedSize);

    var chartValue = Math.max(0, Math.min(100, measured.percentSaved));
    if (measured.hasSavings) {
      var savingsText = formatPercent(measured.percentSaved);
      resultTitle.textContent = 'Your PDF is now ' + savingsText + ' smaller!';
      resultDetail.textContent = 'You saved ' + formatSize(measured.savedBytes) + ' of the original file size.';
      donutValue.textContent = savingsText;
      donutLabel.textContent = 'saved';
      differenceLabel.textContent = 'Saved ' + formatSize(measured.savedBytes);
      donut.setAttribute('aria-label', savingsText + ' of the original file size was saved.');
    } else if (measured.isLarger) {
      var largerPercent = Math.abs(measured.percentSaved);
      var largerText = formatPercent(largerPercent);
      resultTitle.textContent = 'No size reduction was achieved.';
      resultDetail.textContent = 'The output is ' + largerText + ' larger. This PDF may already be optimized.';
      donutValue.textContent = '-' + largerText;
      donutLabel.textContent = 'larger';
      differenceLabel.textContent = 'Output is ' + formatSize(Math.abs(measured.savedBytes)) + ' larger';
      donut.setAttribute('aria-label', 'No file size was saved. The output is ' + largerText + ' larger.');
    } else {
      resultTitle.textContent = 'No size reduction was achieved.';
      resultDetail.textContent = 'The compressed PDF is the same size as the original.';
      donutValue.textContent = '0%';
      donutLabel.textContent = 'saved';
      differenceLabel.textContent = 'No size change';
      donut.setAttribute('aria-label', 'No change in file size.');
    }
    donutSaved.style.strokeDasharray = chartValue.toFixed(3) + ' 100';
    results.hidden = false;
  }

  async function compressSelectedFile() {
    if (busy) return;
    var level = selectedLevel();
    if (!file || !level) {
      setStatus('Choose a PDF and select one compression level before continuing.', 'error');
      return;
    }

    busy = true;
    invalidateResult();
    updateControls();
    setStatus('The PDF is being compressed locally in this browser.', '');
    setProgress('Preparing the pages…');
    try {
      var bytes = await window.CompressPdfEngine.compressPdf(
        file,
        level,
        window.PDFJS,
        window.PDFLib,
        function (progress) {
          var message = progressText(progress);
          if (message) setProgress(message);
        }
      );
      var signature = new Uint8Array(bytes.slice(0, 5));
      if (!hasPdfSignature(signature)) throw new Error('The compression engine did not produce a valid PDF.');
      var blob = new Blob([bytes], { type: 'application/pdf' });
      if (!blob.size) throw new Error('The compressed PDF could not be prepared for download.');
      var nextUrl = URL.createObjectURL(blob);
      try {
        showResults(blob.size);
      } catch (error) {
        URL.revokeObjectURL(nextUrl);
        throw error;
      }
      outputUrl = nextUrl;
      downloadButton.href = outputUrl;
      downloadButton.hidden = false;
      setStatus('Compression is complete. The result reflects the actual file sizes.', 'success');
    } catch (error) {
      setStatus(error && error.message ? error.message :
        'The PDF could not be compressed. Check the file and try again.', 'error');
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
  compressionInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked) {
        invalidateResult();
        setStatus('Compression level changed. Compress the PDF again to update the result.', '');
      }
      updateControls();
    });
  });
  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button || !root.contains(button) || busy) return;
    var action = button.getAttribute('data-action');
    if (action === 'replace') triggerPicker();
    else if (action === 'compress') compressSelectedFile();
  });

  window.addEventListener('pagehide', function () {
    invalidateResult();
  });

  updateControls();
})();
