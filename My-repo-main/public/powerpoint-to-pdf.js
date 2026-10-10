(function () {
  'use strict';

  var root = document.querySelector('.powerpoint-to-pdf-page');
  if (!root) return;

  var MAX_FILE_BYTES = 50 * 1024 * 1024;
  var file = null;
  var presentation = null;
  var busy = false;
  var outputUrl = null;
  var requestController = null;

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
    convertButton.hidden = !presentation;
    convertButton.disabled = busy || !presentation;
    convertButton.setAttribute('aria-busy', String(busy));
    convertLabel.textContent = busy ? 'Converting presentation…' : 'Convert to PDF';
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
    if (requestController) requestController.abort();
    requestController = null;
    file = null;
    presentation = null;
    fileInfo.hidden = true;
    fileInput.value = '';
    uploadTitle.textContent = 'Select PowerPoint File';
    uploadHint.textContent = 'Drop presentation here or click to browse';
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
    if (!selectedFile || !/\.(pptx|ppt)$/i.test(selectedFile.name)) {
      return 'Choose a PowerPoint presentation with a .pptx or .ppt extension.';
    }
    if (!selectedFile.size) return 'The selected presentation is empty.';
    if (selectedFile.size > MAX_FILE_BYTES) return 'This presentation is larger than the 50 MB file limit.';
    return '';
  }

  async function inspectFile(selectedFile) {
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
    setProgress('Checking the presentation structure…');
    setStatus('Validating the selected presentation.', '');

    try {
      var signature = new Uint8Array(await selectedFile.slice(0, 8).arrayBuffer());
      var extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));
      var validZip = signature.length >= 4 && signature[0] === 0x50 && signature[1] === 0x4b &&
        (signature[2] === 0x03 && signature[3] === 0x04 ||
          signature[2] === 0x05 && signature[3] === 0x06 ||
          signature[2] === 0x07 && signature[3] === 0x08);
      var validOle = signature.length === 8 && signature[0] === 0xd0 && signature[1] === 0xcf &&
        signature[2] === 0x11 && signature[3] === 0xe0 && signature[4] === 0xa1 &&
        signature[5] === 0xb1 && signature[6] === 0x1a && signature[7] === 0xe1;
      if (extension === '.pptx' && !validZip || extension === '.ppt' && !validOle) {
        throw new Error('The file signature does not match a supported PowerPoint presentation.');
      }

      requestController = new AbortController();
      var formData = new FormData();
      formData.append('file', selectedFile);
      var response = await fetch('/api/tools/powerpoint-to-pdf/inspect', {
        method: 'POST',
        body: formData,
        signal: requestController.signal
      });
      var result = await readJsonResponse(response);
      if (!response.ok) throw new Error(result.error || 'The presentation could not be validated.');

      presentation = result;
      fileName.textContent = selectedFile.name;
      fileSize.textContent = formatSize(selectedFile.size);
      fileInfo.hidden = false;
      uploadTitle.textContent = 'Replace PowerPoint File';
      uploadHint.textContent = 'Choose another presentation or drop it here';
      setStatus(result.slideCount
        ? result.slideCount + (result.slideCount === 1 ? ' slide ready to convert.' : ' slides ready to convert.')
        : 'Presentation structure validated. Ready to convert.', 'success');
    } catch (error) {
      if (error.name !== 'AbortError') {
        file = null;
        presentation = null;
        fileInfo.hidden = true;
        setStatus(error.message || 'The presentation could not be read. Try a valid PPTX or PPT file.', 'error');
      }
    } finally {
      requestController = null;
      busy = false;
      setProgress('');
      updateControls();
    }
  }

  async function convertPresentation() {
    if (busy || !file || !presentation) {
      setStatus('Choose and validate a PowerPoint presentation before converting.', 'error');
      return;
    }
    invalidateResult();
    busy = true;
    updateControls();
    setProgress('Rendering all slides and creating the PDF…');
    setStatus('Converting with the self-hosted office engine. Large presentations may take a moment.', '');

    try {
      requestController = new AbortController();
      var formData = new FormData();
      formData.append('file', file);
      var response = await fetch('/api/tools/powerpoint-to-pdf', {
        method: 'POST',
        body: formData,
        signal: requestController.signal
      });
      if (!response.ok) {
        var errorResult = await readJsonResponse(response);
        throw new Error(errorResult.error || 'The presentation could not be converted. Try another file.');
      }
      var bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 100 || bytes[0] !== 0x25 || bytes[1] !== 0x50 ||
          bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
        throw new Error('The conversion engine returned an invalid PDF.');
      }
      var blob = new Blob([bytes], { type: 'application/pdf' });
      if (!blob.size) throw new Error('The generated PDF is empty.');
      outputUrl = URL.createObjectURL(blob);
      downloadButton.href = outputUrl;
      downloadButton.download = getOutputFilename(file.name);
      downloadButton.hidden = false;
      var pageCount = Number(response.headers.get('X-Converted-Slides')) || presentation.slideCount;
      resultDetail.textContent = pageCount
        ? pageCount + (pageCount === 1 ? ' slide converted' : ' slides converted') +
          ' · ' + formatSize(blob.size) + ' · One PDF page per slide.'
        : 'Presentation converted · ' + formatSize(blob.size) + ' PDF.';
      results.hidden = false;
      setStatus('Your presentation PDF is ready to download.', 'success');
    } catch (error) {
      if (error.name !== 'AbortError') {
        setStatus(error.message || 'The presentation could not be converted. Keep your file and try again.', 'error');
      }
    } finally {
      requestController = null;
      busy = false;
      setProgress('');
      updateControls();
    }
  }

  async function readJsonResponse(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  function getOutputFilename(sourceName) {
    var base = String(sourceName || 'converted-presentation').replace(/\.[^.]+$/, '');
    base = base.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return (base || 'converted-presentation') + '.pdf';
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
      setStatus('Choose exactly one PowerPoint presentation at a time.', 'error');
      return;
    }
    inspectFile(fileInput.files[0]);
  });
  replaceButton.addEventListener('click', function () {
    if (!busy) fileInput.click();
  });
  convertButton.addEventListener('click', convertPresentation);

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
      setStatus('Drop exactly one PowerPoint presentation at a time.', 'error');
      return;
    }
    inspectFile(droppedFiles[0]);
  });
  window.addEventListener('pagehide', function () {
    if (requestController) requestController.abort();
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });

  updateControls();
})();
