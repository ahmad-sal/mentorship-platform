(function () {
  'use strict';

  var root = document.querySelector('.blur-face-page');
  if (!root) return;

  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var MAX_IMAGE_PIXELS = 10 * 1000 * 1000;
  var MAX_AREAS = 100;
  var file = null;
  var sourceBlob = null;
  var sourceImage = null;
  var sourceWidth = 0;
  var sourceHeight = 0;
  var sourceUrl = null;
  var detector = null;
  var detectionQueue = Promise.resolve();
  var requestId = 0;
  var controller = null;
  var busy = false;
  var detectionReady = false;
  var automaticAreas = [];
  var manualAreas = [];
  var nextAreaId = 0;
  var activePointer = null;
  var showOriginal = false;
  var finalUrl = null;
  var downloadUrl = null;
  var outputBlob = null;
  var outputFilename = '';

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
  var modeControls = root.querySelector('[data-mode-controls]');
  var detectionSummary = root.querySelector('[data-detection-summary]');
  var previewStage = root.querySelector('[data-preview-stage]');
  var previewCanvas = root.querySelector('[data-preview-canvas]');
  var regionLayer = root.querySelector('[data-region-layer]');
  var originalToggle = root.querySelector('[data-action="original"]');
  var addAreaButton = root.querySelector('[data-action="add-area"]');
  var blurButton = root.querySelector('[data-action="blur"]');
  var finalPanel = root.querySelector('[data-final]');
  var finalDetails = root.querySelector('[data-final-details]');
  var finalImage = root.querySelector('[data-final-image]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var status = root.querySelector('[data-status]');
  var statusMessage = root.querySelector('[data-status-message]');
  var previewContext = previewCanvas.getContext('2d');

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
    busy = value;
    modeControls.disabled = value || !detectionReady;
    addAreaButton.disabled = value || !detectionReady || manualAreas.length >= MAX_AREAS;
    blurButton.disabled = value || !detectionReady || !getAreas().length;
    originalToggle.disabled = value || !sourceImage;
    regionLayer.querySelectorAll('button').forEach(function (button) {
      button.disabled = value;
    });
    uploadArea.setAttribute('aria-busy', String(value));
    uploadArea.classList.toggle('is-busy', value);
  }

  function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function setFinalUnavailable() {
    revokeUrl(finalUrl);
    revokeUrl(downloadUrl);
    finalUrl = null;
    downloadUrl = null;
    outputBlob = null;
    outputFilename = '';
    finalImage.removeAttribute('src');
    finalPanel.hidden = true;
    downloadButton.removeAttribute('href');
    downloadButton.removeAttribute('download');
    downloadButton.hidden = true;
  }

  function clearImage() {
    requestId += 1;
    if (controller) controller.abort();
    controller = null;
    revokeUrl(sourceUrl);
    sourceUrl = null;
    sourceBlob = null;
    sourceImage = null;
    file = null;
    sourceWidth = 0;
    sourceHeight = 0;
    detectionReady = false;
    automaticAreas = [];
    manualAreas = [];
    nextAreaId = 0;
    showOriginal = false;
    setFinalUnavailable();
    previewCanvas.width = 0;
    previewCanvas.height = 0;
    regionLayer.replaceChildren();
    previewStage.hidden = true;
    editor.hidden = true;
    fileInfo.hidden = true;
    uploadTitle.textContent = 'Select Image';
    uploadHint.textContent = 'Drop an image here or click to browse';
    originalToggle.setAttribute('aria-pressed', 'false');
    originalToggle.textContent = 'Show Original';
    modeControls.querySelector('input[value="recommended"]').checked = true;
    setProgress('');
    setBusy(false);
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

  function validateFile(nextFile) {
    if (!nextFile) return 'Choose an image file to continue.';
    if (!nextFile.size) return 'The selected image is empty.';
    if (nextFile.size > MAX_FILE_BYTES) return 'This image is larger than the 20 MB processing limit.';
    return '';
  }

  async function prepareImage(nextFile, signal) {
    var form = new FormData();
    form.append('file', nextFile, nextFile.name);
    var response;
    try {
      response = await fetch('/api/tools/blur-face/prepare', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        signal: signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new Error('The image could not be prepared. Check your connection and try again.');
    }
    if (!response.ok) {
      var detail;
      try {
        detail = await response.json();
      } catch (error) {
        detail = null;
      }
      throw new Error(detail && detail.error ? detail.error : 'The image could not be prepared.');
    }
    if (!/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
      throw new Error('The image processor returned an unexpected preview format.');
    }
    var width = Number(response.headers.get('X-Original-Width'));
    var height = Number(response.headers.get('X-Original-Height'));
    var format = response.headers.get('X-Original-Format');
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS ||
        !format) {
      throw new Error('The image dimensions could not be verified.');
    }
    return { blob: await response.blob(), width: width, height: height, format: format };
  }

  function loadImage(blob, signal) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(blob);
      var settled = false;
      function cleanup() {
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener('abort', onAbort);
      }
      function onAbort() {
        if (settled) return;
        settled = true;
        cleanup();
        revokeUrl(url);
        var error = new Error('Image preparation cancelled.');
        error.name = 'AbortError';
        reject(error);
      }
      image.onload = function () {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ image: image, url: url });
      };
      image.onerror = function () {
        if (settled) return;
        settled = true;
        cleanup();
        revokeUrl(url);
        reject(new Error('This browser could not open the prepared image.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      else image.src = url;
    });
  }

  function ensureDetector() {
    if (detector) return Promise.resolve(detector);
    if (!window.FaceDetection) {
      return Promise.reject(new Error('The face-detection model could not be loaded. Refresh the page and try again.'));
    }
    var candidate = new window.FaceDetection({
      locateFile: function (name) {
        return '/vendor/mediapipe-face-detection/' + name;
      }
    });
    candidate.onResults(function (results) {
      candidate.latestResults = results;
    });
    return candidate.initialize().then(function () {
      detector = candidate;
      return detector;
    }).catch(function (error) {
      candidate.close();
      throw new Error('The face-detection model could not be initialized. Check that model files are available and try again.');
    });
  }

  function selectedMode() {
    var selected = modeControls.querySelector('input[name="blurFaceMode"]:checked');
    return selected ? selected.value : 'recommended';
  }

  function modeOptions(mode) {
    if (mode === 'low') return { model: 'short', minDetectionConfidence: 0.72 };
    if (mode === 'high') return { model: 'full', minDetectionConfidence: 0.35 };
    return { model: 'short', minDetectionConfidence: 0.5 };
  }

  function getDetections(results) {
    if (!results || !Array.isArray(results.detections)) {
      throw new Error('The face detector returned an invalid result.');
    }
    return results.detections.map(function (detection) {
      var box = detection && detection.boundingBox;
      if (!box || ![box.xCenter, box.yCenter, box.width, box.height].every(Number.isFinite)) return null;
      var left = Math.max(0, box.xCenter - box.width * 0.56);
      var right = Math.min(1, box.xCenter + box.width * 0.56);
      var top = Math.max(0, box.yCenter - box.height * 0.57);
      var bottom = Math.min(1, box.yCenter + box.height * 0.57);
      if (right <= left || bottom <= top) return null;
      return {
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        width: right - left,
        height: bottom - top,
        kind: 'automatic'
      };
    }).filter(Boolean);
  }

  function detectFaces(mode, activeId) {
    var task = detectionQueue.then(async function () {
      if (activeId !== requestId) return;
      setProgress('Loading the face-detection model…');
      var faceDetector = await ensureDetector();
      if (activeId !== requestId) return;
      faceDetector.setOptions(modeOptions(mode));
      faceDetector.latestResults = null;
      setProgress(mode === 'high'
        ? 'Searching for clear and smaller faces…'
        : mode === 'low' ? 'Searching carefully for high-confidence faces…' : 'Detecting faces…');
      await faceDetector.send({ image: sourceImage });
      if (activeId !== requestId) return;
      automaticAreas = getDetections(faceDetector.latestResults);
      detectionReady = true;
      renderRegions();
      renderPreview();
      if (automaticAreas.length) {
        detectionSummary.textContent = automaticAreas.length === 1
          ? '1 face detected automatically. Add or adjust blur areas if needed.'
          : automaticAreas.length + ' faces detected automatically. Add or adjust blur areas if needed.';
        setStatus('Faces detected. Review the preview and add any missed areas before processing.', 'success');
      } else {
        detectionSummary.textContent = 'No faces were detected automatically. Add a manual blur area over each face you want to blur.';
        setStatus('No faces detected automatically. You can still add manual blur areas.', '');
      }
      setProgress('');
      setBusy(false);
    });
    detectionQueue = task.catch(function () {});
    return task;
  }

  function getAreas() {
    return automaticAreas.concat(manualAreas);
  }

  function renderRegions() {
    regionLayer.replaceChildren();
    getAreas().forEach(function (area, index) {
      var oval = document.createElement('div');
      oval.className = 'blur-face-region ' + (area.kind === 'manual' ? 'is-manual' : 'is-automatic');
      oval.style.left = (area.x - area.width / 2) * 100 + '%';
      oval.style.top = (area.y - area.height / 2) * 100 + '%';
      oval.style.width = area.width * 100 + '%';
      oval.style.height = area.height * 100 + '%';
      if (area.kind === 'manual') {
        oval.dataset.areaId = String(area.id);
        oval.setAttribute('role', 'group');
        oval.setAttribute('aria-label', 'Manual blur area ' + (index - automaticAreas.length + 1));
        oval.tabIndex = 0;
        ['width', 'height'].forEach(function (dimension) {
          var handle = document.createElement('button');
          handle.type = 'button';
          handle.className = 'blur-face-resize-handle resize-' + dimension;
          handle.dataset.resize = dimension;
          handle.setAttribute('aria-label', 'Resize blur area ' + dimension);
          oval.appendChild(handle);
        });
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'blur-face-remove-area';
        remove.dataset.action = 'remove-area';
        remove.setAttribute('aria-label', 'Remove manual blur area');
        remove.textContent = '×';
        oval.appendChild(remove);
      } else {
        oval.setAttribute('aria-hidden', 'true');
      }
      regionLayer.appendChild(oval);
    });
    setBusy(busy);
  }

  function renderPreview() {
    if (!sourceImage || !sourceWidth || !sourceHeight) return;
    var scale = Math.min(1, 1500 / Math.max(sourceWidth, sourceHeight));
    var width = Math.max(1, Math.round(sourceWidth * scale));
    var height = Math.max(1, Math.round(sourceHeight * scale));
    previewCanvas.width = width;
    previewCanvas.height = height;
    previewCanvas.style.aspectRatio = sourceWidth + ' / ' + sourceHeight;
    previewContext.clearRect(0, 0, width, height);
    previewContext.drawImage(sourceImage, 0, 0, width, height);
    previewStage.hidden = false;
    if (showOriginal) return;
    var regions = getAreas();
    if (!regions.length) return;

    var blurredCanvas = document.createElement('canvas');
    var maskCanvas = document.createElement('canvas');
    blurredCanvas.width = maskCanvas.width = width;
    blurredCanvas.height = maskCanvas.height = height;
    var blurredContext = blurredCanvas.getContext('2d');
    var maskContext = maskCanvas.getContext('2d');
    var blurRadius = Math.max(8, Math.min(40, Math.max.apply(null, regions.map(function (area) {
      return Math.min(area.width * sourceWidth, area.height * sourceHeight);
    })) * 0.32)) * scale;
    blurredContext.filter = 'blur(' + Math.max(2, blurRadius) + 'px)';
    blurredContext.drawImage(sourceImage, 0, 0, width, height);
    blurredContext.filter = 'none';
    regions.forEach(function (area) {
      var centerX = area.x * width;
      var centerY = area.y * height;
      var radiusX = Math.max(1, area.width * width / 2);
      var radiusY = Math.max(1, area.height * height / 2);
      maskContext.save();
      maskContext.translate(centerX, centerY);
      maskContext.scale(radiusX, radiusY);
      var gradient = maskContext.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.86, '#fff');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      maskContext.fillStyle = gradient;
      maskContext.fillRect(-1, -1, 2, 2);
      maskContext.restore();
    });
    blurredContext.globalCompositeOperation = 'destination-in';
    blurredContext.drawImage(maskCanvas, 0, 0);
    blurredContext.globalCompositeOperation = 'source-over';
    previewContext.drawImage(blurredCanvas, 0, 0);
    blurredCanvas.width = 0;
    maskCanvas.width = 0;
  }

  function removeArea(areaId) {
    if (busy) return;
    manualAreas = manualAreas.filter(function (area) { return area.id !== areaId; });
    setFinalUnavailable();
    renderRegions();
    renderPreview();
    setStatus('Manual blur area removed.', '');
  }

  function addArea() {
    if (busy || !detectionReady || manualAreas.length >= MAX_AREAS) return;
    var offset = manualAreas.length % 5;
    manualAreas.push({
      id: ++nextAreaId,
      x: Math.max(0.15, Math.min(0.85, 0.5 + (offset - 2) * 0.035)),
      y: Math.max(0.18, Math.min(0.82, 0.42 + (offset % 3) * 0.045)),
      width: Math.min(0.2, Math.max(24 / sourceWidth, 0.14)),
      height: Math.min(0.3, Math.max(28 / sourceHeight, 0.22)),
      kind: 'manual'
    });
    boundArea(manualAreas[manualAreas.length - 1]);
    setFinalUnavailable();
    renderRegions();
    renderPreview();
    setStatus('Manual oval added. Drag it over a face and resize it to fit.', '');
  }

  function boundArea(area) {
    var minWidth = Math.min(0.95, 24 / sourceWidth);
    var minHeight = Math.min(0.95, 28 / sourceHeight);
    area.width = Math.max(minWidth, Math.min(1, area.width));
    area.height = Math.max(minHeight, Math.min(1, area.height));
    area.x = Math.max(area.width / 2, Math.min(1 - area.width / 2, area.x));
    area.y = Math.max(area.height / 2, Math.min(1 - area.height / 2, area.y));
  }

  function handlePointerDown(event) {
    var target = event.target.closest('.blur-face-region.is-manual');
    if (!target || busy) return;
    if (event.target.closest('[data-action="remove-area"]')) return;
    var areaId = Number(target.dataset.areaId);
    var area = manualAreas.find(function (candidate) { return candidate.id === areaId; });
    if (!area) return;
    var resize = event.target.closest('[data-resize]');
    var bounds = previewCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    event.preventDefault();
    activePointer = {
      pointerId: event.pointerId,
      areaId: areaId,
      action: resize ? resize.dataset.resize : 'move',
      startX: event.clientX,
      startY: event.clientY,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      bounds: bounds
    };
    previewStage.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    var area = manualAreas.find(function (candidate) { return candidate.id === activePointer.areaId; });
    if (!area) return;
    var deltaX = (event.clientX - activePointer.startX) / activePointer.bounds.width;
    var deltaY = (event.clientY - activePointer.startY) / activePointer.bounds.height;
    if (activePointer.action === 'move') {
      area.x = activePointer.x + deltaX;
      area.y = activePointer.y + deltaY;
    } else if (activePointer.action === 'width') {
      area.width = activePointer.width + deltaX * 2;
    } else if (activePointer.action === 'height') {
      area.height = activePointer.height + deltaY * 2;
    }
    boundArea(area);
    setFinalUnavailable();
    renderRegions();
    renderPreview();
  }

  function finishPointer(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    if (previewStage.hasPointerCapture(event.pointerId)) previewStage.releasePointerCapture(event.pointerId);
    activePointer = null;
    setStatus('Blur area updated. The final download will use this position and size.', '');
  }

  async function loadFile(nextFile) {
    if (!nextFile) return;
    clearImage();
    setStatus('', '');
    var validationError = validateFile(nextFile);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }
    file = nextFile;
    var activeId = requestId;
    controller = new AbortController();
    setBusy(true);
    setProgress('Checking and preparing the image…');
    setStatus('Preparing a safe, full-resolution image for local face detection.', '');
    uploadTitle.textContent = 'Replace Image';
    uploadHint.textContent = 'Choose another image or drop it here';
    try {
      var prepared = await prepareImage(nextFile, controller.signal);
      if (activeId !== requestId) return;
      var loaded = await loadImage(prepared.blob, controller.signal);
      if (activeId !== requestId) {
        revokeUrl(loaded.url);
        return;
      }
      if (loaded.image.naturalWidth !== prepared.width || loaded.image.naturalHeight !== prepared.height) {
        revokeUrl(loaded.url);
        throw new Error('The prepared image dimensions did not match the source image.');
      }
      sourceBlob = prepared.blob;
      sourceImage = loaded.image;
      sourceUrl = loaded.url;
      sourceWidth = prepared.width;
      sourceHeight = prepared.height;
      fileName.textContent = nextFile.name;
      fileDetails.textContent = formatSize(nextFile.size) + ' · ' + sourceWidth + ' × ' + sourceHeight +
        ' · ' + prepared.format.toUpperCase();
      fileInfo.hidden = false;
      editor.hidden = false;
      detectionSummary.textContent = 'Detecting faces automatically…';
      await detectFaces('recommended', activeId);
    } catch (error) {
      if (activeId !== requestId || error && error.name === 'AbortError') return;
      detectionReady = false;
      setBusy(false);
      setProgress('');
      setStatus(error && error.message ? error.message : 'The image could not be processed.', 'error');
    }
  }

  async function submitBlur() {
    if (busy || !detectionReady || !sourceBlob || !getAreas().length) return;
    var activeId = requestId;
    controller = new AbortController();
    var signal = controller.signal;
    setFinalUnavailable();
    setBusy(true);
    setProgress('Applying the blur to the selected face areas…');
    setStatus('Creating and validating the final full-resolution image.', '');
    var form = new FormData();
    var safeBaseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    form.append('file', sourceBlob, safeBaseName + '.png');
    form.append('regions', JSON.stringify(getAreas().map(function (area) {
      return { x: area.x, y: area.y, width: area.width, height: area.height };
    })));
    form.append('originalName', file.name);
    try {
      var response = await fetch('/api/tools/blur-face', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        signal: signal
      });
      if (!response.ok) {
        var detail;
        try {
          detail = await response.json();
        } catch (error) {
          detail = null;
        }
        throw new Error(detail && detail.error ? detail.error : 'The selected face areas could not be blurred.');
      }
      if (!/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
        throw new Error('The image processor returned an unexpected output format.');
      }
      var filename = response.headers.get('X-Output-Filename');
      if (!filename || /[/\\]/.test(filename) || !/\.png$/i.test(filename)) {
        throw new Error('The processed image filename could not be verified.');
      }
      var outputWidth = Number(response.headers.get('X-Output-Width'));
      var outputHeight = Number(response.headers.get('X-Output-Height'));
      if (outputWidth !== sourceWidth || outputHeight !== sourceHeight) {
        throw new Error('The processed image dimensions did not match the original.');
      }
      var blob = await response.blob();
      var bitmap;
      try {
        bitmap = await createImageBitmap(blob);
      } catch (error) {
        throw new Error('The processed image could not be opened.');
      }
      var valid = bitmap.width === sourceWidth && bitmap.height === sourceHeight;
      bitmap.close();
      if (!valid) throw new Error('The processed image dimensions could not be verified.');
      if (activeId !== requestId) return;
      var resultUrl = URL.createObjectURL(blob);
      var downloadHref = URL.createObjectURL(blob);
      finalImage.src = resultUrl;
      finalUrl = resultUrl;
      downloadUrl = downloadHref;
      outputBlob = blob;
      outputFilename = filename;
      downloadButton.href = downloadHref;
      downloadButton.download = outputFilename;
      downloadButton.hidden = false;
      finalDetails.textContent = outputWidth + ' × ' + outputHeight + ' pixels · PNG · ' + formatSize(blob.size);
      finalPanel.hidden = false;
      setStatus('Your image is ready. The download includes only the selected oval face regions.', 'success');
    } catch (error) {
      if (activeId !== requestId || error && error.name === 'AbortError') return;
      setStatus(error && error.message ? error.message : 'The selected face areas could not be blurred.', 'error');
    } finally {
      if (activeId === requestId) {
        setBusy(false);
        setProgress('');
      }
    }
  }

  uploadArea.addEventListener('click', function (event) {
    if (!event.target.closest('button')) fileInput.click();
  });
  uploadArea.addEventListener('dragenter', function (event) {
    event.preventDefault();
    uploadArea.classList.add('is-dragging');
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
  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button || !root.contains(button)) return;
    var action = button.dataset.action;
    if (action === 'select' || action === 'replace') fileInput.click();
    else if (action === 'add-area') addArea();
    else if (action === 'blur') submitBlur();
    else if (action === 'remove-area') removeArea(Number(button.closest('[data-area-id]').dataset.areaId));
    else if (action === 'original') {
      showOriginal = !showOriginal;
      originalToggle.setAttribute('aria-pressed', String(showOriginal));
      originalToggle.textContent = showOriginal ? 'Show Blur Preview' : 'Show Original';
      renderPreview();
    }
  });
  modeControls.addEventListener('change', function (event) {
    if (!event.target.matches('input[name="blurFaceMode"]') || !sourceImage || busy) return;
    requestId += 1;
    var activeId = requestId;
    setFinalUnavailable();
    detectionReady = false;
    automaticAreas = [];
    renderRegions();
    renderPreview();
    setBusy(true);
    setProgress('Updating face detection…');
    detectionSummary.textContent = 'Rerunning face detection with the selected sensitivity…';
    detectFaces(selectedMode(), activeId).catch(function (error) {
      if (activeId !== requestId) return;
      detectionReady = false;
      setBusy(false);
      setProgress('');
      detectionSummary.textContent = 'Face detection failed.';
      setStatus(error && error.message ? error.message : 'Face detection failed. Try another image.', 'error');
    });
  });
  regionLayer.addEventListener('keydown', function (event) {
    var target = event.target.closest('.blur-face-region.is-manual');
    if (!target) return;
    var area = manualAreas.find(function (candidate) { return candidate.id === Number(target.dataset.areaId); });
    if (!area) return;
    var step = event.shiftKey ? 0.02 : 0.005;
    var handle = event.target.closest('[data-resize]');
    if (event.key === 'ArrowLeft') {
      if (handle && handle.dataset.resize === 'width') area.width -= step * 2;
      else if (!handle) area.x -= step;
      else return;
    } else if (event.key === 'ArrowRight') {
      if (handle && handle.dataset.resize === 'width') area.width += step * 2;
      else if (!handle) area.x += step;
      else return;
    } else if (event.key === 'ArrowUp') {
      if (handle && handle.dataset.resize === 'height') area.height -= step * 2;
      else if (!handle) area.y -= step;
      else return;
    } else if (event.key === 'ArrowDown') {
      if (handle && handle.dataset.resize === 'height') area.height += step * 2;
      else if (!handle) area.y += step;
      else return;
    } else {
      return;
    }
    event.preventDefault();
    boundArea(area);
    setFinalUnavailable();
    renderRegions();
    renderPreview();
  });
  regionLayer.addEventListener('pointerdown', handlePointerDown);
  previewStage.addEventListener('pointermove', handlePointerMove);
  previewStage.addEventListener('pointerup', finishPointer);
  previewStage.addEventListener('pointercancel', finishPointer);
  previewStage.addEventListener('lostpointercapture', function () { activePointer = null; });
  window.addEventListener('resize', function () {
    if (sourceImage) renderRegions();
  });
  window.addEventListener('pagehide', function () {
    if (controller) controller.abort();
    revokeUrl(sourceUrl);
    revokeUrl(finalUrl);
    revokeUrl(downloadUrl);
    if (detector) detector.close();
  });
  setBusy(false);
})();
