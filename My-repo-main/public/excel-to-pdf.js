(function () {
  'use strict';

  var root = document.querySelector('.excel-to-pdf-page');
  if (!root || !window.ExcelToPdfEngine) return;

  var file = null;
  var workbook = null;
  var busy = false;
  var outputUrl = null;
  var worker = null;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var uploadTitle = root.querySelector('[data-upload-title]');
  var uploadHint = root.querySelector('[data-upload-hint]');
  var fileInfo = root.querySelector('[data-file-info]');
  var fileName = root.querySelector('[data-file-name]');
  var fileSize = root.querySelector('[data-file-size]');
  var convertButton = root.querySelector('[data-action="convert"]');
  var convertLabel = root.querySelector('[data-convert-label]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var results = root.querySelector('[data-results]');
  var resultDetail = root.querySelector('[data-result-detail]');
  var status = root.querySelector('[data-status]');
  var statusMessage = root.querySelector('[data-status-message]');
  var progressWrap = root.querySelector('[data-progress-wrap]');
  var progressMessage = root.querySelector('[data-progress-message]');
  var replaceButton = root.querySelector('[data-action="replace"]');

  function setStatus(message, kind) {
    statusMessage.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }

  function setProgress(message) {
    progressWrap.hidden = !message;
    if (message) progressMessage.textContent = message;
  }

  function updateControls() {
    uploadArea.setAttribute('aria-disabled', String(busy));
    fileInput.disabled = busy;
    replaceButton.disabled = busy;
    convertButton.hidden = !workbook;
    convertButton.disabled = busy || !workbook;
    convertButton.setAttribute('aria-busy', String(busy));
    convertLabel.textContent = busy ? 'Creating PDF…' : 'Convert to PDF';
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
    if (worker) worker.postMessage({ type: 'clear' });
    file = null;
    workbook = null;
    fileInfo.hidden = true;
    fileInput.value = '';
    uploadTitle.textContent = 'Select Excel File';
    uploadHint.textContent = 'Drop Excel file here or click to browse';
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

  function validateFile(selectedFile) {
    if (!selectedFile || !window.ExcelToPdfEngine.hasSupportedExtension(selectedFile.name)) {
      return 'Choose an Excel workbook with an .xlsx, .xls, .xlsm, or .xlsb extension.';
    }
    if (!selectedFile.size) return 'The selected workbook is empty.';
    if (selectedFile.size > window.ExcelToPdfEngine.MAX_FILE_BYTES) {
      return 'This workbook is larger than the 50 MB browser-processing limit.';
    }
    return '';
  }

  function loadWorkbook(selectedFile) {
    if (busy || !selectedFile) return;
    clearSelection();
    var validationError = validateFile(selectedFile);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    file = selectedFile;
    busy = true;
    updateControls();
    setProgress('Checking the workbook and reading visible worksheets…');
    setStatus('Reading the workbook locally in your browser.', '');

    selectedFile.arrayBuffer().then(function (buffer) {
      if (!window.Worker) throw new Error('This browser does not support background workbook processing. Try a recent version of Chrome, Edge, Firefox, or Safari.');
      worker = new Worker('/excel-to-pdf-worker.js');
      initializeWorker();
      worker.postMessage({ type: 'inspect', fileName: selectedFile.name, bytes: buffer }, [buffer]);
    }).catch(function (error) {
      if (worker) worker.terminate();
      worker = null;
      file = null;
      setStatus(error && error.message ? error.message :
        'The selected workbook could not be read. Try selecting it again.', 'error');
      finishLoading();
    });
  }

  function finishLoading() {
    busy = false;
    setProgress('');
    updateControls();
  }

  function initializeWorker() {
    if (!worker) worker = new Worker('/excel-to-pdf-worker.js');
    worker.onmessage = function (event) {
      if (!event.data) return;
      if (event.data.type === 'ready') {
        workbook = event.data.workbook;
        fileName.textContent = file.name;
        fileSize.textContent = formatSize(file.size);
        fileInfo.hidden = false;
        uploadTitle.textContent = 'Replace Excel File';
        uploadHint.textContent = 'Choose another workbook or drop it here';
        var sheetMessage = workbook.sheetCount +
          (workbook.sheetCount === 1 ? ' visible worksheet' : ' visible worksheets');
        setStatus(sheetMessage + ' ready to convert.', 'success');
        finishLoading();
      } else if (event.data.type === 'converted') {
        completeConversion(event.data);
      } else if (event.data.type === 'error') {
        if (event.data.operation === 'inspect') {
          file = null;
          workbook = null;
        }
        setStatus(event.data.message, 'error');
        finishLoading();
      }
    };
    worker.onerror = function () {
      if (worker) worker.terminate();
      worker = null;
      file = null;
      workbook = null;
      fileInfo.hidden = true;
      setStatus('The workbook could not be processed in the background. Check the file and try again.', 'error');
      finishLoading();
    };
  }

  function convertWorkbook() {
    if (busy || !file || !workbook) {
      setStatus('Choose and validate an Excel workbook before converting.', 'error');
      return;
    }
    invalidateResult();
    busy = true;
    updateControls();
    setProgress('Building a PDF from the visible worksheets…');
    setStatus('Creating the PDF locally in your browser.', '');

    try {
      initializeWorker();
      worker.postMessage({ type: 'convert', fileName: file.name });
    } catch (error) {
      setStatus(error && error.message ? error.message :
        'The PDF could not be created. Try another Excel workbook.', 'error');
      finishLoading();
    }
  }

  function completeConversion(result) {
    try {
      var bytes = new Uint8Array(result.bytes);
      if (bytes.length < 100 || bytes[0] !== 37 || bytes[1] !== 80 ||
          bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
        throw new Error('The generated PDF did not pass the file integrity check.');
      }
      var blob = new Blob([bytes], { type: 'application/pdf' });
      if (!blob.size) throw new Error('The generated PDF is empty.');
      outputUrl = URL.createObjectURL(blob);
      downloadButton.href = outputUrl;
      downloadButton.download = getOutputFilename(file.name);
      downloadButton.hidden = false;
      resultDetail.textContent = result.sheetCount +
        (result.sheetCount === 1 ? ' visible worksheet' : ' visible worksheets') +
        ' · ' + bytes.length + ' bytes · Text values remain selectable in the PDF.';
      results.hidden = false;
      var notice = result.hiddenSheetCount
        ? ' Hidden worksheets (' + result.hiddenSheetCount + ') were not included.'
        : '';
      setStatus('Your PDF is ready to download.' + notice, 'success');
    } catch (error) {
      setStatus(error && error.message ? error.message :
        'The PDF could not be created. Try another Excel workbook.', 'error');
    } finally {
      finishLoading();
    }
  }

  function getOutputFilename(sourceName) {
    var base = String(sourceName || 'converted-workbook').replace(/\.[^.]+$/, '');
    base = base.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return (base || 'converted-workbook') + '.pdf';
  }

  uploadArea.addEventListener('click', function () {
    if (!busy) fileInput.click();
  });
  uploadArea.addEventListener('keydown', function (event) {
    if ((event.key === 'Enter' || event.key === ' ') && !busy) {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', function () {
    if (!fileInput.files || !fileInput.files.length) return;
    if (fileInput.files.length !== 1) {
      clearSelection();
      setStatus('Choose exactly one Excel workbook at a time.', 'error');
      return;
    }
    loadWorkbook(fileInput.files[0]);
  });
  replaceButton.addEventListener('click', function () {
    if (!busy) fileInput.click();
  });
  convertButton.addEventListener('click', convertWorkbook);

  ['dragenter', 'dragover'].forEach(function (eventName) {
    uploadArea.addEventListener(eventName, function (event) {
      event.preventDefault();
      if (!busy) uploadArea.classList.add('is-dragging');
    });
  });
  ['dragleave', 'dragend'].forEach(function (eventName) {
    uploadArea.addEventListener(eventName, function (event) {
      event.preventDefault();
      uploadArea.classList.remove('is-dragging');
    });
  });
  uploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadArea.classList.remove('is-dragging');
    if (busy) return;
    var droppedFiles = event.dataTransfer && event.dataTransfer.files;
    if (!droppedFiles || !droppedFiles.length) return;
    if (droppedFiles.length !== 1) {
      clearSelection();
      setStatus('Drop exactly one Excel workbook at a time.', 'error');
      return;
    }
    loadWorkbook(droppedFiles[0]);
  });
  window.addEventListener('pagehide', function () {
    if (worker) worker.terminate();
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });

  updateControls();
})();
