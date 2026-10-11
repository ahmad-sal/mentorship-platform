(function () {
  'use strict';

  var root = document.querySelector('.remove-background-page');
  if (!root) return;

  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var file = null;
  var requestId = 0;
  var controller = null;
  var originalUrl = null;
  var processedUrl = null;
  var downloadUrl = null;
  var processedBlob = null;
  var outputFilename = '';
  var width = 0;
  var height = 0;
  var comparisonPosition = 50;
  var mode = 'automatic';
  var brushMode = 'keep';
  var brushSize = 32;
  var strokes = [];
  var activeStroke = null;
  var pointerId = null;
  var finalizing = false;
  var originalBitmap = null;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var uploadTitle = root.querySelector('[data-upload-title]');
  var uploadHint = root.querySelector('[data-upload-hint]');
  var fileInfo = root.querySelector('[data-file-info]');
  var fileName = root.querySelector('[data-file-name]');
  var fileDetails = root.querySelector('[data-file-details]');
  var progress = root.querySelector('[data-progress]');
  var progressMessage = root.querySelector('[data-progress-message]');
  var editor = root.querySelector('[data-editor]');
  var modeHelp = root.querySelector('[data-mode-help]');
  var manualTab = root.querySelector('[data-mode="manual"]');
  var panels = Array.prototype.slice.call(root.querySelectorAll('[data-panel]'));
  var comparison = root.querySelector('[data-comparison]');
  var beforeLayer = root.querySelector('[data-before-layer]');
  var beforeImage = root.querySelector('[data-before-image]');
  var afterImage = root.querySelector('[data-after-image]');
  var afterLabel = root.querySelector('[data-after-label]');
  var divider = root.querySelector('[data-divider]');
  var canvasStage = root.querySelector('[data-canvas-stage]');
  var canvasWrap = root.querySelector('.remove-background-canvas-wrap');
  var resultCanvas = root.querySelector('[data-result-canvas]');
  var strokeCanvas = root.querySelector('[data-stroke-canvas]');
  var resultContext = resultCanvas.getContext('2d', { willReadFrequently: true });
  var strokeContext = strokeCanvas.getContext('2d');
  var brushSizeInput = root.querySelector('[data-brush-size]');
  var brushSizeLabel = root.querySelector('[data-brush-size-label]');
  var brushHint = root.querySelector('[data-brush-hint]');
  var undoButton = root.querySelector('[data-action="undo"]');
  var resetButton = root.querySelector('[data-action="reset"]');
  var finalizeButton = root.querySelector('[data-action="finalize"]');
  var finalPanel = root.querySelector('[data-final]');
  var finalDetails = root.querySelector('[data-final-details]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var status = root.querySelector('[data-status]');
  var statusMessage = root.querySelector('[data-status-message]');
  var retryButton = root.querySelector('[data-action="retry"]');

  function setStatus(message, kind) {
    statusMessage.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }

  function setProgress(message) {
    progress.hidden = !message;
    if (message) progressMessage.textContent = message;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    var size = bytes / 1024;
    var units = ['KB', 'MB', 'GB'];
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

  function validateBeforeUpload(nextFile) {
    if (!nextFile) return 'Choose an image file to continue.';
    if (!nextFile.size) return 'The selected image is empty.';
    if (nextFile.size > MAX_FILE_BYTES) return 'This image is larger than the 20 MB processing limit.';
    var extension = extensionOf(nextFile.name);
    if (extension === 'svg') {
      return 'SVG is a vector format and is not supported by this AI processor. Choose a raster image.';
    }
    if (extension === 'bmp' || extension === 'ico') {
      return 'BMP and ICO are not supported by the installed image processor. Choose PNG, JPEG, WebP, still GIF/TIFF, or AVIF.';
    }
    return '';
  }

  function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function clearFinal() {
    revokeUrl(downloadUrl);
    downloadUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.removeAttribute('download');
    downloadButton.hidden = true;
    finalPanel.hidden = true;
    finalizeButton.disabled = !processedBlob || finalizing;
  }

  function clearEditor() {
    revokeUrl(processedUrl);
    processedUrl = null;
    processedBlob = null;
    outputFilename = '';
    afterImage.removeAttribute('src');
    afterImage.hidden = true;
    afterLabel.hidden = true;
    comparison.classList.add('is-loading');
    comparison.hidden = false;
    editor.hidden = true;
    canvasStage.hidden = false;
    resultCanvas.width = 0;
    resultCanvas.height = 0;
    strokeCanvas.width = 0;
    strokeCanvas.height = 0;
    strokes = [];
    activeStroke = null;
    manualTab.disabled = true;
    width = 0;
    height = 0;
    if (originalBitmap) originalBitmap.close();
    originalBitmap = null;
    clearFinal();
  }

  function clearFailedResult() {
    revokeUrl(processedUrl);
    processedUrl = null;
    processedBlob = null;
    outputFilename = '';
    afterImage.removeAttribute('src');
    afterImage.hidden = true;
    afterLabel.hidden = true;
    comparison.classList.add('is-loading');
    comparison.hidden = false;
    resultCanvas.width = 0;
    resultCanvas.height = 0;
    strokeCanvas.width = 0;
    strokeCanvas.height = 0;
    strokes = [];
    activeStroke = null;
    if (originalBitmap) originalBitmap.close();
    originalBitmap = null;
    clearFinal();
    editor.hidden = false;
    setMode('automatic');
    manualTab.disabled = true;
  }

  function clearSelection() {
    requestId += 1;
    if (controller) controller.abort();
    controller = null;
    finalizing = false;
    clearEditor();
    revokeUrl(originalUrl);
    originalUrl = null;
    beforeImage.removeAttribute('src');
    file = null;
    fileInfo.hidden = true;
    uploadTitle.textContent = 'Select Image';
    uploadHint.textContent = 'Drop an image here or click to browse';
    retryButton.hidden = true;
    setProgress('');
    finalizeButton.disabled = true;
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
      function finish(error) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve({ width: image.naturalWidth, height: image.naturalHeight });
      }
      function onLoad() {
        finish();
      }
      function onError() {
        finish(new Error('This browser cannot preview the selected image format.'));
      }
      function onAbort() {
        var error = new Error('Image preview cancelled.');
        error.name = 'AbortError';
        finish(error);
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
      return await decodeImage(beforeImage, originalUrl, signal);
    } catch (browserError) {
      if (activeId !== requestId || signal.aborted) throw browserError;
      revokeUrl(originalUrl);
      originalUrl = null;
      beforeImage.removeAttribute('src');
      var previewResponse = await postFile('/api/tools/remove-background/preview', nextFile, signal);
      if (previewResponse.headers.get('content-type') !== 'image/png') {
        throw new Error('A safe preview could not be generated for this image.');
      }
      var previewBlob = await previewResponse.blob();
      originalUrl = URL.createObjectURL(previewBlob);
      return decodeImage(beforeImage, originalUrl, signal);
    }
  }

  async function verifyTransparentImage(blob, expectedWidth, expectedHeight) {
    if (!blob || !blob.size || blob.type !== 'image/png') {
      throw new Error('The processor did not return a valid PNG image.');
    }
    var bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (error) {
      throw new Error('The processed image could not be opened.');
    }
    var valid = bitmap.width === expectedWidth && bitmap.height === expectedHeight;
    bitmap.close();
    if (!valid) throw new Error('The processed image dimensions did not match the original.');
  }

  async function beginProcessing(nextFile) {
    if (!nextFile) return;
    clearSelection();
    var activeId = requestId;
    var validationError = validateBeforeUpload(nextFile);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    file = nextFile;
    controller = new AbortController();
    var signal = controller.signal;
    uploadArea.setAttribute('aria-busy', 'true');
    fileName.textContent = nextFile.name;
    fileDetails.textContent = formatSize(nextFile.size);
    fileInfo.hidden = false;
    uploadTitle.textContent = 'Replace Image';
    uploadHint.textContent = 'Choose another image or drop it here';
    setProgress('Detecting the subject and removing the background…');
    setStatus('Loading the original and automatically removing its background.', '');

    var previewPromise = null;
    try {
      previewPromise = loadOriginalPreview(nextFile, activeId, signal).then(function (dimensions) {
        if (activeId !== requestId) return dimensions;
        width = dimensions.width;
        height = dimensions.height;
        fileDetails.textContent = formatSize(nextFile.size) + ' · ' + width + ' × ' + height;
        editor.hidden = false;
        comparison.hidden = false;
        comparison.classList.add('is-loading');
        manualTab.disabled = true;
        setMode('automatic');
        setStatus('Original image loaded. AI background removal is in progress.', '');
        return dimensions;
      });
      var processingPromise = postFile('/api/tools/remove-background', nextFile, signal);
      var previewAndResponse = await Promise.all([previewPromise, processingPromise]);
      var originalDimensions = previewAndResponse[0];
      var response = previewAndResponse[1];
      if (activeId !== requestId) return;

      var outputWidth = Number(response.headers.get('X-Output-Width'));
      var outputHeight = Number(response.headers.get('X-Output-Height'));
      var originalWidth = Number(response.headers.get('X-Original-Width'));
      var originalHeight = Number(response.headers.get('X-Original-Height'));
      var responseFilename = response.headers.get('X-Output-Filename');
      if (response.headers.get('content-type') !== 'image/png' ||
          response.headers.get('X-Output-Has-Alpha') !== 'true') {
        throw new Error('The processor did not return a transparent PNG.');
      }
      if (!Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) ||
          outputWidth !== originalWidth || outputHeight !== originalHeight ||
          originalWidth !== originalDimensions.width || originalHeight !== originalDimensions.height) {
        throw new Error('The processed image dimensions could not be verified against the original.');
      }
      if (!responseFilename || /[/\\]/.test(responseFilename) || !/\.png$/i.test(responseFilename)) {
        throw new Error('The output filename could not be verified.');
      }

      var blob = await response.blob();
      await verifyTransparentImage(blob, outputWidth, outputHeight);
      if (activeId !== requestId) return;
      width = outputWidth;
      height = outputHeight;
      processedBlob = blob;
      outputFilename = responseFilename;
      processedUrl = URL.createObjectURL(blob);
      afterImage.src = processedUrl;
      afterImage.hidden = false;
      afterLabel.hidden = false;
      comparison.classList.remove('is-loading');
      comparison.hidden = false;
      comparison.style.setProperty('--remove-background-split', comparisonPosition + '%');
      comparison.setAttribute('aria-valuenow', String(comparisonPosition));
      comparison.setAttribute('aria-valuetext', 'Original ' + comparisonPosition +
        ' percent, background removed ' + (100 - comparisonPosition) + ' percent');

      fileName.textContent = nextFile.name;
      fileDetails.textContent = formatSize(nextFile.size) + ' · ' + width + ' × ' + height +
        ' · ' + response.headers.get('X-Original-Format').toUpperCase();
      fileInfo.hidden = false;
      editor.hidden = false;
      manualTab.disabled = false;
      retryButton.hidden = true;
      finalizeButton.disabled = false;
      setStatus('Background removed automatically · transparent PNG · ' + width + ' × ' + height + '.', 'success');
      setMode('automatic');
    } catch (error) {
      if (activeId !== requestId || error && error.name === 'AbortError') return;
      if (!beforeImage.complete || !beforeImage.naturalWidth) {
        try {
          if (previewPromise) await previewPromise;
        } catch (previewError) {
          if (controller) controller.abort();
        }
      }
      if (activeId !== requestId) return;
      if (beforeImage.complete && beforeImage.naturalWidth) clearFailedResult();
      else clearEditor();
      retryButton.hidden = false;
      setStatus(error && error.message ? error.message :
        'The background could not be removed. Try another supported image.', 'error');
    } finally {
      if (activeId === requestId) {
        uploadArea.setAttribute('aria-busy', 'false');
        setProgress('');
      }
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    root.querySelectorAll('[data-mode]').forEach(function (tab) {
      var selected = tab.getAttribute('data-mode') === mode;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== mode;
    });
    modeHelp.textContent = mode === 'manual'
      ? 'Paint the mask with Keep Area or Remove Area'
      : 'AI-selected transparent result';
    if (mode === 'manual') initializeManualCanvas();
  }

  async function initializeManualCanvas() {
    if (!processedBlob || !width || !height) return;
    var sourceBlob = processedBlob;
    var sourceWidth = width;
    var sourceHeight = height;
    try {
      var bitmap = await createImageBitmap(sourceBlob);
      if (processedBlob !== sourceBlob || mode !== 'manual') {
        bitmap.close();
        return;
      }
      if (bitmap.width !== sourceWidth || bitmap.height !== sourceHeight) {
        bitmap.close();
        throw new Error('The manual editing preview could not be initialized.');
      }
      if (originalBitmap) originalBitmap.close();
      originalBitmap = bitmap;
      resultCanvas.width = width;
      resultCanvas.height = height;
      strokeCanvas.width = width;
      strokeCanvas.height = height;
      fitManualCanvas();
      redrawManualImage();
    } catch (error) {
      setStatus(error && error.message ? error.message : 'The manual editor could not be opened.', 'error');
      setMode('automatic');
    }
  }

  function traceStroke(context, stroke) {
    if (!stroke.points.length) return;
    context.beginPath();
    context.lineWidth = stroke.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    if (stroke.points.length === 1) {
      context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      for (var index = 1; index < stroke.points.length; index += 1) {
        context.lineTo(stroke.points[index].x, stroke.points[index].y);
      }
      context.stroke();
    }
  }

  function paintStrokeLayer(stroke) {
    strokeContext.clearRect(0, 0, width, height);
    strokeContext.globalCompositeOperation = 'source-over';
    strokeContext.fillStyle = '#fff';
    strokeContext.strokeStyle = '#fff';
    traceStroke(strokeContext, stroke);
    if (stroke.mode === 'keep') {
      strokeContext.globalCompositeOperation = 'source-in';
      strokeContext.drawImage(beforeImage, 0, 0, width, height);
      strokeContext.globalCompositeOperation = 'source-over';
      resultContext.drawImage(strokeCanvas, 0, 0);
    } else {
      resultContext.save();
      resultContext.globalCompositeOperation = 'destination-out';
      resultContext.drawImage(strokeCanvas, 0, 0);
      resultContext.restore();
    }
  }

  function drawStrokeOverlay(stroke, alpha) {
    strokeContext.save();
    strokeContext.globalCompositeOperation = 'source-over';
    strokeContext.globalAlpha = alpha;
    strokeContext.fillStyle = stroke.mode === 'keep' ? '#35b779' : '#e45a5a';
    strokeContext.strokeStyle = stroke.mode === 'keep' ? '#35b779' : '#e45a5a';
    traceStroke(strokeContext, stroke);
    strokeContext.restore();
  }

  function redrawManualImage() {
    if (!processedBlob || !width || !height || !originalBitmap) return;
    resultContext.clearRect(0, 0, width, height);
    resultContext.globalCompositeOperation = 'source-over';
    resultContext.drawImage(originalBitmap, 0, 0, width, height);
    strokes.forEach(paintStrokeLayer);
    strokeContext.clearRect(0, 0, width, height);
    strokes.forEach(function (stroke) { drawStrokeOverlay(stroke, 0.43); });
    if (activeStroke) drawStrokeOverlay(activeStroke, 0.55);
    undoButton.disabled = strokes.length === 0;
    resetButton.disabled = strokes.length === 0;
    clearFinal();
  }

  function fitManualCanvas() {
    if (!width || !height) return;
    var availableWidth = Math.max(1, Math.min(canvasStage.clientWidth - 24, 860));
    var availableHeight = Math.max(1, Math.min(window.innerHeight * 0.58, 660));
    var scale = Math.min(availableWidth / width, availableHeight / height);
    canvasWrap.style.width = Math.max(1, Math.round(width * scale)) + 'px';
  }

  function updateBrushStatus() {
    brushSize = Number(brushSizeInput.value);
    brushSizeLabel.textContent = brushSize + ' px';
    var action = brushMode === 'keep' ? 'Keep Area' : 'Remove Area';
    brushHint.textContent = action + ' is active. Drag across image areas that should ' +
      (brushMode === 'keep' ? 'remain visible.' : 'become transparent.');
  }

  function updateComparison(value) {
    comparisonPosition = Math.max(0, Math.min(100, Math.round(value)));
    comparison.style.setProperty('--remove-background-split', comparisonPosition + '%');
    comparison.setAttribute('aria-valuenow', String(comparisonPosition));
    comparison.setAttribute('aria-valuetext', 'Original ' + comparisonPosition +
      ' percent, background removed ' + (100 - comparisonPosition) + ' percent');
  }

  function comparisonFromPointer(event) {
    var bounds = comparison.getBoundingClientRect();
    if (!bounds.width) return;
    updateComparison((event.clientX - bounds.left) / bounds.width * 100);
  }

  function canvasPoint(event) {
    var bounds = strokeCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: Math.max(0, Math.min(width, (event.clientX - bounds.left) * width / bounds.width)),
      y: Math.max(0, Math.min(height, (event.clientY - bounds.top) * height / bounds.height))
    };
  }

  function paintActiveStroke() {
    strokeContext.clearRect(0, 0, width, height);
    strokes.forEach(function (stroke) { drawStrokeOverlay(stroke, 0.43); });
    if (activeStroke) drawStrokeOverlay(activeStroke, 0.55);
  }

  function finishStroke() {
    if (!activeStroke) return;
    strokes.push(activeStroke);
    activeStroke = null;
    pointerId = null;
    redrawManualImage();
  }

  async function finalizeOutput() {
    if (finalizing || !processedBlob) return;
    var activeRequestId = requestId;
    finalizing = true;
    finalizeButton.disabled = true;
    finalizeButton.setAttribute('aria-busy', 'true');
    setProgress('Preparing and validating the transparent PNG…');
    setStatus('Applying the latest mask corrections and checking the output.', '');
    try {
      var outputBlob;
      if (mode === 'manual') {
        outputBlob = await new Promise(function (resolve, reject) {
          resultCanvas.toBlob(function (blob) {
            if (!blob) reject(new Error('The transparent image could not be exported.'));
            else resolve(blob);
          }, 'image/png');
        });
      } else {
        outputBlob = processedBlob;
      }
      if (activeRequestId !== requestId) return;
      await verifyTransparentImage(outputBlob, width, height);
      if (activeRequestId !== requestId) return;
      revokeUrl(downloadUrl);
      downloadUrl = URL.createObjectURL(outputBlob);
      downloadButton.href = downloadUrl;
      downloadButton.download = outputFilename;
      downloadButton.hidden = false;
      finalDetails.textContent = width + ' × ' + height + ' pixels · transparent PNG · ' + formatSize(outputBlob.size);
      finalPanel.hidden = false;
      setStatus('Your background-removed image is validated and ready to download.', 'success');
    } catch (error) {
      if (activeRequestId === requestId) {
        setStatus(error && error.message ? error.message : 'The transparent image could not be prepared.', 'error');
      }
    } finally {
      if (activeRequestId === requestId) {
        finalizing = false;
        finalizeButton.removeAttribute('aria-busy');
        finalizeButton.disabled = !processedBlob;
        setProgress('');
      }
    }
  }

  uploadArea.addEventListener('click', function (event) {
    if (!event.target.closest('button')) fileInput.click();
  });
  uploadArea.addEventListener('keydown', function (event) {
    if (event.target !== uploadArea) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
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
    if (event.dataTransfer && event.dataTransfer.files.length) beginProcessing(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    var nextFile = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (nextFile) beginProcessing(nextFile);
  });

  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action], button[data-mode], button[data-brush-mode]');
    if (!button || !root.contains(button)) return;
    if (button.hasAttribute('data-mode')) {
      setMode(button.getAttribute('data-mode'));
      return;
    }
    if (button.hasAttribute('data-brush-mode')) {
      brushMode = button.getAttribute('data-brush-mode');
      root.querySelectorAll('[data-brush-mode]').forEach(function (actionButton) {
        var selected = actionButton === button;
        actionButton.classList.toggle('is-active', selected);
        actionButton.setAttribute('aria-pressed', String(selected));
      });
      updateBrushStatus();
      return;
    }
    var action = button.getAttribute('data-action');
    if (action === 'replace') fileInput.click();
    else if (action === 'finalize') finalizeOutput();
    else if (action === 'retry' && file) beginProcessing(file);
    else if (action === 'undo' && strokes.length) {
      strokes.pop();
      redrawManualImage();
      setStatus('The last brush stroke was undone.', '');
    } else if (action === 'reset' && strokes.length) {
      strokes = [];
      redrawManualImage();
      setStatus('Manual corrections were reset to the automatic result.', '');
    }
  });

  root.querySelectorAll('[data-mode]').forEach(function (tab) {
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var nextMode = mode === 'automatic' ? 'manual' : 'automatic';
      setMode(nextMode);
      root.querySelector('[data-mode="' + nextMode + '"]').focus();
    });
  });

  comparison.addEventListener('pointerdown', function (event) {
    if (comparison.classList.contains('is-loading')) return;
    event.preventDefault();
    pointerId = event.pointerId;
    comparison.setPointerCapture(pointerId);
    comparisonFromPointer(event);
  });
  comparison.addEventListener('pointermove', function (event) {
    if (pointerId === event.pointerId) comparisonFromPointer(event);
  });
  function finishComparisonPointer(event) {
    if (pointerId !== event.pointerId) return;
    if (comparison.hasPointerCapture(pointerId)) comparison.releasePointerCapture(pointerId);
    pointerId = null;
  }
  comparison.addEventListener('pointerup', finishComparisonPointer);
  comparison.addEventListener('pointercancel', finishComparisonPointer);
  comparison.addEventListener('keydown', function (event) {
    var next = comparisonPosition;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= 2;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += 2;
    else if (event.key === 'PageDown') next -= 10;
    else if (event.key === 'PageUp') next += 10;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    else return;
    event.preventDefault();
    updateComparison(next);
  });

  brushSizeInput.addEventListener('input', updateBrushStatus);
  window.addEventListener('resize', fitManualCanvas);
  strokeCanvas.addEventListener('pointerdown', function (event) {
    if (mode !== 'manual' || !processedBlob || finalizing) return;
    var point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    pointerId = event.pointerId;
    strokeCanvas.setPointerCapture(pointerId);
    activeStroke = { mode: brushMode, size: brushSize, points: [point] };
    paintActiveStroke();
  });
  strokeCanvas.addEventListener('pointermove', function (event) {
    if (pointerId !== event.pointerId || !activeStroke) return;
    var point = canvasPoint(event);
    if (!point) return;
    var previous = activeStroke.points[activeStroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) {
      activeStroke.points.push(point);
      paintActiveStroke();
    }
  });
  strokeCanvas.addEventListener('pointerup', function (event) {
    if (pointerId !== event.pointerId) return;
    if (strokeCanvas.hasPointerCapture(pointerId)) strokeCanvas.releasePointerCapture(pointerId);
    finishStroke();
  });
  strokeCanvas.addEventListener('pointercancel', function (event) {
    if (pointerId === event.pointerId) finishStroke();
  });
  strokeCanvas.addEventListener('lostpointercapture', function () {
    if (activeStroke) finishStroke();
  });

  brushMode = 'keep';
  updateBrushStatus();
  uploadArea.setAttribute('aria-disabled', 'false');
  finalizeButton.disabled = true;
  setMode('automatic');

  window.addEventListener('pagehide', function () {
    if (controller) controller.abort();
    revokeUrl(originalUrl);
    revokeUrl(processedUrl);
    revokeUrl(downloadUrl);
    if (originalBitmap) originalBitmap.close();
  });
})();
