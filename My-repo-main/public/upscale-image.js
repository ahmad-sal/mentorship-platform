(function () {
  'use strict';

  var root = document.querySelector('.upscale-image-page');
  if (!root) return;

  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var file = null;
  var requestId = 0;
  var controller = null;
  var processing = false;
  var originalUrl = null;
  var enhancedUrl = null;
  var downloadUrl = null;
  var enhancedBlob = null;
  var outputFilename = '';
  var pointerId = null;
  var split = 50;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var uploadTitle = root.querySelector('[data-upload-title]');
  var uploadHint = root.querySelector('[data-upload-hint]');
  var fileInfo = root.querySelector('[data-file-info]');
  var fileName = root.querySelector('[data-file-name]');
  var fileDetails = root.querySelector('[data-file-details]');
  var comparisonWrap = root.querySelector('[data-comparison-wrap]');
  var comparison = root.querySelector('[data-comparison]');
  var originalLayer = root.querySelector('[data-original-layer]');
  var originalImage = root.querySelector('[data-original-image]');
  var enhancedImage = root.querySelector('[data-enhanced-image]');
  var enhancedLabel = root.querySelector('[data-enhanced-label]');
  var divider = root.querySelector('[data-divider]');
  var progress = root.querySelector('[data-progress]');
  var progressMessage = root.querySelector('[data-progress-message]');
  var upscaleButton = root.querySelector('[data-action="upscale"]');
  var finalPanel = root.querySelector('[data-final]');
  var finalDetails = root.querySelector('[data-final-details]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var retryButton = root.querySelector('[data-action="retry"]');
  var status = root.querySelector('[data-status]');
  var statusMessage = root.querySelector('[data-status-message]');

  function setStatus(message, kind) {
    statusMessage.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }

  function setProgress(message) {
    progress.hidden = !message;
    if (message) progressMessage.textContent = message;
  }

  function setBusy(value) {
    processing = value;
    uploadArea.setAttribute('aria-disabled', String(value));
    upscaleButton.disabled = value || !enhancedBlob;
    upscaleButton.textContent = value ? 'Preparing…' : 'Upscale';
    upscaleButton.setAttribute('aria-busy', String(value));
    retryButton.disabled = value;
  }

  function revokeObjectUrl(value) {
    if (value) URL.revokeObjectURL(value);
  }

  function clearOutput() {
    revokeObjectUrl(enhancedUrl);
    revokeObjectUrl(downloadUrl);
    enhancedUrl = null;
    downloadUrl = null;
    enhancedBlob = null;
    outputFilename = '';
    enhancedImage.removeAttribute('src');
    enhancedImage.hidden = true;
    enhancedLabel.hidden = true;
    divider.hidden = true;
    finalPanel.hidden = true;
    downloadButton.removeAttribute('href');
    downloadButton.removeAttribute('download');
    downloadButton.hidden = true;
    upscaleButton.hidden = true;
    upscaleButton.disabled = true;
    comparison.classList.add('is-loading');
    comparisonWrap.hidden = true;
    originalLayer.style.width = '100%';
  }

  function clearSelection() {
    requestId += 1;
    if (controller) controller.abort();
    controller = null;
    clearOutput();
    revokeObjectUrl(originalUrl);
    originalUrl = null;
    originalImage.removeAttribute('src');
    file = null;
    fileInfo.hidden = true;
    uploadTitle.textContent = 'Select Image';
    uploadHint.textContent = 'Drop an image here or click to browse';
    retryButton.hidden = true;
    setProgress('');
    setBusy(false);
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

  function extensionOf(name) {
    var match = String(name || '').match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function immediateFileError(nextFile) {
    if (!nextFile) return 'Choose an image file to continue.';
    if (!nextFile.size) return 'The selected image is empty.';
    if (nextFile.size > MAX_FILE_BYTES) return 'This image is larger than the 20 MB processing limit.';
    var extension = extensionOf(nextFile.name);
    if (extension === 'svg') {
      return 'SVG is a vector format and cannot be preserved by AI upscaling. Choose a raster image instead.';
    }
    if (extension === 'bmp' || extension === 'ico') {
      return 'BMP and ICO cannot be validated by the installed image engine. Choose PNG, JPEG, WebP, GIF, TIFF, or AVIF.';
    }
    return '';
  }

  async function postFile(url, nextFile, signal) {
    var form = new FormData();
    form.append('file', nextFile, nextFile.name);
    var response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        signal: signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new Error('Could not reach the AI image processor. Check your connection and try again.');
    }
    if (!response.ok) {
      var detail;
      try {
        detail = await response.json();
      } catch (error) {
        detail = null;
      }
      throw new Error(detail && detail.error ? detail.error : 'The image could not be processed. Please try again.');
    }
    return response;
  }

  function decodeImage(image, url, signal) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function cleanup() {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      }
      function onLoad() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      }
      function onError() {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('This browser cannot preview the selected image format.'));
      }
      function onAbort() {
        if (settled) return;
        settled = true;
        cleanup();
        var error = new Error('Image preview cancelled.');
        error.name = 'AbortError';
        reject(error);
      }
      if (signal.aborted) {
        onAbort();
        return;
      }
      image.addEventListener('load', onLoad);
      image.addEventListener('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });
      image.src = url;
      if (image.complete && image.naturalWidth) onLoad();
    });
  }

  async function loadOriginalPreview(nextFile, activeId, signal) {
    originalUrl = URL.createObjectURL(nextFile);
    try {
      return await decodeImage(originalImage, originalUrl, signal);
    } catch (browserError) {
      if (activeId !== requestId || signal.aborted) throw browserError;
      revokeObjectUrl(originalUrl);
      originalUrl = null;
      originalImage.removeAttribute('src');
      var previewResponse = await postFile('/api/tools/upscale-image/preview', nextFile, signal);
      if (previewResponse.headers.get('content-type') !== 'image/png') {
        throw new Error('A safe image preview could not be generated.');
      }
      var previewBlob = await previewResponse.blob();
      originalUrl = URL.createObjectURL(previewBlob);
      var dimensions = await decodeImage(originalImage, originalUrl, signal);
      return {
        width: Number(previewResponse.headers.get('X-Original-Width')) || dimensions.width,
        height: Number(previewResponse.headers.get('X-Original-Height')) || dimensions.height
      };
    }
  }

  async function verifyEnhancedBlob(blob, width, height) {
    if (!blob || !blob.size || blob.type !== 'image/png') {
      throw new Error('The AI processor returned an invalid image file.');
    }
    var imageBitmap;
    try {
      imageBitmap = await createImageBitmap(blob);
    } catch (error) {
      throw new Error('The AI processor returned an image that could not be opened.');
    }
    var valid = imageBitmap.width === width && imageBitmap.height === height;
    imageBitmap.close();
    if (!valid) throw new Error('The AI processor did not return the expected 2× image dimensions.');
  }

  async function loadFile(nextFile) {
    if (!nextFile) return;
    clearSelection();
    var activeId = requestId;
    var validationError = immediateFileError(nextFile);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    file = nextFile;
    controller = new AbortController();
    var signal = controller.signal;
    setBusy(true);
    setProgress('Preparing the original image preview…');
    setStatus('Loading the original image and checking its format.', '');
    uploadTitle.textContent = 'Replace Image';
    uploadHint.textContent = 'Choose another image or drop it here';

    try {
      var dimensions = await loadOriginalPreview(nextFile, activeId, signal);
      if (activeId !== requestId) return;
      if (!dimensions.width || !dimensions.height ||
          dimensions.width > 10000 || dimensions.height > 10000) {
        throw new Error('This image is too large to preview safely.');
      }
      fileName.textContent = nextFile.name;
      fileDetails.textContent = formatSize(nextFile.size) + ' · ' +
        dimensions.width + ' × ' + dimensions.height;
      fileInfo.hidden = false;
      comparisonWrap.hidden = false;
      comparison.classList.add('is-loading');
      comparison.style.setProperty('--upscale-split', split + '%');
      comparison.setAttribute('aria-valuenow', String(split));
      originalLayer.style.width = '100%';

      setProgress('Generating your AI-enhanced preview…');
      setStatus('The preview is being enhanced automatically with AI.', '');
      var response = await postFile('/api/tools/upscale-image', nextFile, signal);
      if (activeId !== requestId) return;
      if (response.headers.get('content-type') !== 'image/png') {
        throw new Error('The AI processor returned an unexpected output format.');
      }
      var outputWidth = Number(response.headers.get('X-Output-Width'));
      var outputHeight = Number(response.headers.get('X-Output-Height'));
      var originalWidth = Number(response.headers.get('X-Original-Width'));
      var originalHeight = Number(response.headers.get('X-Original-Height'));
      if (outputWidth !== dimensions.width * 2 || outputHeight !== dimensions.height * 2 ||
          originalWidth !== dimensions.width || originalHeight !== dimensions.height) {
        throw new Error('The AI processor did not return an exact 2× result for the selected image.');
      }
      var responseFilename = response.headers.get('X-Output-Filename');
      if (!responseFilename || /[/\\]/.test(responseFilename) || !/\.png$/i.test(responseFilename)) {
        throw new Error('The enhanced image filename could not be verified.');
      }
      var blob = await response.blob();
      await verifyEnhancedBlob(blob, outputWidth, outputHeight);
      if (activeId !== requestId) return;

      enhancedBlob = blob;
      enhancedUrl = URL.createObjectURL(blob);
      outputFilename = responseFilename;
      comparison.dataset.outputWidth = String(outputWidth);
      comparison.dataset.outputHeight = String(outputHeight);
      enhancedImage.src = enhancedUrl;
      enhancedImage.hidden = false;
      enhancedLabel.hidden = false;
      divider.hidden = false;
      comparison.classList.remove('is-loading');
      comparison.setAttribute('aria-valuetext', 'Original ' + split + ' percent, Enhanced ' + (100 - split) + ' percent');
      upscaleButton.hidden = false;
      upscaleButton.disabled = false;
      retryButton.hidden = true;
      setStatus('AI-enhanced preview ready · ' + outputWidth + ' × ' + outputHeight + ' pixels.', 'success');
    } catch (error) {
      if (activeId !== requestId || error && error.name === 'AbortError') return;
      clearOutput();
      retryButton.hidden = false;
      setStatus(error && error.message ? error.message :
        'The image could not be enhanced. Try another supported image.', 'error');
    } finally {
      if (activeId === requestId) {
        setBusy(false);
        setProgress('');
      }
    }
  }

  function updateSplit(value) {
    split = Math.max(5, Math.min(95, Math.round(value)));
    comparison.style.setProperty('--upscale-split', split + '%');
    originalLayer.style.width = '100%';
    comparison.setAttribute('aria-valuenow', String(split));
    comparison.setAttribute(
      'aria-valuetext',
      'Original ' + split + ' percent, Enhanced ' + (100 - split) + ' percent'
    );
  }

  function splitFromPointer(event) {
    var bounds = comparison.getBoundingClientRect();
    if (!bounds.width) return;
    updateSplit((event.clientX - bounds.left) / bounds.width * 100);
  }

  async function prepareDownload() {
    if (processing || !enhancedBlob) return;
    var activeId = requestId;
    setBusy(true);
    setProgress('Verifying the final image…');
    setStatus('Checking the completed 2× output before download.', '');
    try {
      var width = Number(comparison.dataset.outputWidth);
      var height = Number(comparison.dataset.outputHeight);
      await verifyEnhancedBlob(enhancedBlob, width, height);
      if (activeId !== requestId) return;
      revokeObjectUrl(downloadUrl);
      downloadUrl = URL.createObjectURL(enhancedBlob);
      downloadButton.href = downloadUrl;
      downloadButton.download = outputFilename;
      downloadButton.hidden = false;
      finalDetails.textContent = width + ' × ' + height + ' pixels · PNG · ' + formatSize(enhancedBlob.size);
      finalPanel.hidden = false;
      setStatus('Your validated AI-enhanced image is ready to download.', 'success');
    } catch (error) {
      if (activeId !== requestId) return;
      setStatus(error && error.message ? error.message : 'The enhanced image could not be prepared.', 'error');
    } finally {
      if (activeId === requestId) setBusy(false);
      setProgress('');
    }
  }

  function triggerPicker() {
    fileInput.click();
  }

  uploadArea.addEventListener('click', function (event) {
    if (!event.target.closest('button')) triggerPicker();
  });
  uploadArea.addEventListener('keydown', function (event) {
    if (event.target !== uploadArea) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerPicker();
    }
  });
  uploadArea.addEventListener('dragenter', function (event) {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.types.indexOf('Files') !== -1) {
      uploadArea.classList.add('is-dragging');
    }
  });
  uploadArea.addEventListener('dragover', function (event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  uploadArea.addEventListener('dragleave', function (event) {
    if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove('is-dragging');
  });
  uploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadArea.classList.remove('is-dragging');
    if (event.dataTransfer && event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    var nextFile = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (nextFile) loadFile(nextFile);
  });

  comparison.addEventListener('pointerdown', function (event) {
    if (comparison.classList.contains('is-loading')) return;
    event.preventDefault();
    pointerId = event.pointerId;
    comparison.setPointerCapture(pointerId);
    splitFromPointer(event);
  });
  comparison.addEventListener('pointermove', function (event) {
    if (pointerId === event.pointerId) splitFromPointer(event);
  });
  function finishPointer(event) {
    if (pointerId !== event.pointerId) return;
    if (comparison.hasPointerCapture(pointerId)) comparison.releasePointerCapture(pointerId);
    pointerId = null;
  }
  comparison.addEventListener('pointerup', finishPointer);
  comparison.addEventListener('pointercancel', finishPointer);
  comparison.addEventListener('lostpointercapture', function () { pointerId = null; });
  comparison.addEventListener('keydown', function (event) {
    var next = split;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= 2;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += 2;
    else if (event.key === 'PageDown') next -= 10;
    else if (event.key === 'PageUp') next += 10;
    else if (event.key === 'Home') next = 5;
    else if (event.key === 'End') next = 95;
    else return;
    event.preventDefault();
    updateSplit(next);
  });

  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button || !root.contains(button)) return;
    var action = button.getAttribute('data-action');
    if (action === 'replace') triggerPicker();
    else if (action === 'upscale') prepareDownload();
    else if (action === 'retry' && file) loadFile(file);
  });

  window.addEventListener('pagehide', function () {
    if (controller) controller.abort();
    revokeObjectUrl(originalUrl);
    revokeObjectUrl(enhancedUrl);
    revokeObjectUrl(downloadUrl);
  });

  setBusy(false);
})();
