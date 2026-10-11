(function () {
  'use strict';

  var root = document.querySelector('.compress-image-page');
  if (!root) return;

  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var file = null;
  var imageInfo = null;
  var busy = false;
  var outputUrl = null;
  var sourceUrl = null;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var uploadTitle = root.querySelector('[data-upload-title]');
  var uploadHint = root.querySelector('[data-upload-hint]');
  var fileInfo = root.querySelector('[data-file-info]');
  var fileName = root.querySelector('[data-file-name]');
  var fileSize = root.querySelector('[data-file-size]');
  var imageDetails = root.querySelector('[data-image-details]');
  var sourcePreview = root.querySelector('[data-source-preview]');
  var sourceImage = root.querySelector('[data-source-image]');
  var sourceCaption = root.querySelector('[data-source-caption]');
  var levelSection = root.querySelector('[data-level-section]');
  var privacyNote = root.querySelector('[data-privacy-note]');
  var compressionInputs = Array.prototype.slice.call(root.querySelectorAll('input[name="imageCompressionLevel"]'));
  var compressButton = root.querySelector('[data-action="compress"]');
  var compressLabel = root.querySelector('[data-compress-label]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var results = root.querySelector('[data-results]');
  var resultTitle = root.querySelector('[data-result-title]');
  var resultDetail = root.querySelector('[data-result-detail]');
  var resultPreview = root.querySelector('[data-result-preview]');
  var resultImage = root.querySelector('[data-result-image]');
  var resultCaption = root.querySelector('[data-result-caption]');
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
    compressLabel.textContent = busy ? 'Compressing…' : 'Compress Image';
  }

  function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function invalidateResult() {
    revokeUrl(outputUrl);
    outputUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.removeAttribute('download');
    downloadButton.hidden = true;
    resultImage.removeAttribute('src');
    resultImage.hidden = false;
    resultPreview.hidden = true;
    results.hidden = true;
  }

  function clearSelection() {
    invalidateResult();
    revokeUrl(sourceUrl);
    sourceUrl = null;
    sourceImage.removeAttribute('src');
    sourceImage.hidden = false;
    sourcePreview.hidden = true;
    file = null;
    imageInfo = null;
    fileInfo.hidden = true;
    levelSection.hidden = true;
    privacyNote.hidden = true;
    compressionInputs.forEach(function (input) { input.checked = false; });
    uploadTitle.textContent = 'Select Image File';
    uploadHint.textContent = 'Drop an image here or click to browse';
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

  function formatLabel(info) {
    return info.label + ' · ' + info.width + ' × ' + info.height +
      (info.pages > 1 ? ' · ' + info.pages + (info.animated ? ' frames (animated)' : ' pages') : '');
  }

  function basicFileError(nextFile) {
    if (!nextFile) return 'Choose an image file to continue.';
    if (!nextFile.size) return 'The selected image is empty.';
    if (nextFile.size > MAX_FILE_BYTES) return 'This image is larger than the 20 MB processing limit.';
    return '';
  }

  async function postFile(url, nextFile, level) {
    var form = new FormData();
    form.append('file', nextFile, nextFile.name);
    if (level) form.append('level', level);
    var response;
    try {
      response = await fetch(url, { method: 'POST', body: form, credentials: 'same-origin' });
    } catch (error) {
      throw new Error('Could not reach the image processor. Check your connection and try again.');
    }
    if (!response.ok) {
      var detail;
      try {
        detail = await response.json();
      } catch (error) {
        detail = null;
      }
      throw new Error(detail && detail.error ? detail.error : 'The image could not be processed. Try again.');
    }
    return response;
  }

  async function loadImage(nextFile) {
    if (busy || !nextFile) return;
    clearSelection();
    var validationError = basicFileError(nextFile);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    busy = true;
    updateControls();
    setProgress('Checking the image format and dimensions…');
    setStatus('Validating the image with the supported image engine.', '');
    try {
      var response = await postFile('/api/tools/compress-image/inspect', nextFile);
      imageInfo = await response.json();
      file = nextFile;
      fileName.textContent = nextFile.name;
      fileSize.textContent = formatSize(nextFile.size);
      imageDetails.textContent = formatLabel(imageInfo);
      fileInfo.hidden = false;
      levelSection.hidden = false;
      privacyNote.hidden = false;
      uploadTitle.textContent = 'Replace Image File';
      uploadHint.textContent = 'Choose another image or drop it here';

      var previewBlob = imageInfo.format === 'svg' ? null : nextFile;
      if (imageInfo.format === 'svg') {
        setProgress('Preparing a safe vector preview…');
        try {
          var previewResponse = await postFile('/api/tools/compress-image/preview', nextFile);
          if (previewResponse.headers.get('Content-Type') !== 'image/svg+xml') {
            throw new Error('The SVG preview format could not be verified.');
          }
          previewBlob = await previewResponse.blob();
        } catch (error) {
          previewBlob = null;
        }
      }

      if (previewBlob && imageInfo.previewSafe) {
        sourceUrl = URL.createObjectURL(previewBlob);
        sourceCaption.textContent = imageInfo.animated ?
          'Animated preview · ' + imageInfo.pages + ' frames' :
          imageInfo.format === 'svg' ? 'Safe vector preview · SVG format retained' : 'Original image preview';
        sourcePreview.hidden = false;
        sourceImage.addEventListener('error', function onPreviewError() {
          sourceImage.removeEventListener('error', onPreviewError);
          if (sourceImage.src !== sourceUrl) return;
          sourceImage.hidden = true;
          sourceCaption.textContent = 'This browser cannot preview this image format.';
        });
        sourceImage.src = sourceUrl;
      } else {
        sourceImage.hidden = true;
        sourceCaption.textContent = imageInfo.format === 'svg' ?
          'A safe preview is unavailable; the validated vector file remains available for compression.' :
          'This image format cannot be previewed in the browser.';
        sourcePreview.hidden = false;
      }
      setStatus('Image ready. Select one compression level to continue.', 'success');
    } catch (error) {
      clearSelection();
      setStatus(error && error.message ? error.message :
        'This file could not be validated as a supported image.', 'error');
    } finally {
      busy = false;
      setProgress('');
      updateControls();
    }
  }

  function showResults(compressedSize, info) {
    if (!file || !Number.isFinite(compressedSize) || compressedSize <= 0) {
      throw new Error('The original and compressed file sizes could not be measured.');
    }
    var savedBytes = file.size - compressedSize;
    var percentSaved = savedBytes / file.size * 100;
    var hasSavings = savedBytes > 0;
    var isLarger = savedBytes < 0;
    var chartValue = Math.max(0, Math.min(100, percentSaved));

    originalSizeLabel.textContent = formatSize(file.size);
    compressedSizeLabel.textContent = formatSize(compressedSize);
    resultCaption.textContent = 'Processed ' + formatLabel(info) + ' · Actual output format: ' + info.label + '.';
    if (hasSavings) {
      var savingsText = formatPercent(percentSaved);
      resultTitle.textContent = 'Your image is now ' + savingsText + ' smaller!';
      resultDetail.textContent = 'You saved ' + formatSize(savedBytes) + ' of the original file size.';
      donutValue.textContent = savingsText;
      donutLabel.textContent = 'saved';
      differenceLabel.textContent = 'Saved ' + formatSize(savedBytes);
      donut.setAttribute('aria-label', savingsText + ' of the original file size was saved.');
    } else if (isLarger) {
      var largerText = formatPercent(Math.abs(percentSaved));
      resultTitle.textContent = 'No size reduction was achieved.';
      resultDetail.textContent = 'The processed candidate is ' + largerText +
        ' larger. The original is retained as the preferred file; no larger download is offered.';
      donutValue.textContent = '-' + largerText;
      donutLabel.textContent = 'larger';
      differenceLabel.textContent = 'Output is ' + formatSize(Math.abs(savedBytes)) + ' larger';
      donut.setAttribute('aria-label', 'No file size was saved. The output is ' + largerText + ' larger.');
    } else {
      resultTitle.textContent = 'No size reduction was achieved.';
      resultDetail.textContent = 'The processed image is the same size as the original. The original remains preferred.';
      donutValue.textContent = '0%';
      donutLabel.textContent = 'saved';
      differenceLabel.textContent = 'No size change';
      donut.setAttribute('aria-label', 'No change in file size.');
    }
    donutSaved.style.strokeDasharray = chartValue.toFixed(3) + ' 100';
    results.hidden = false;
    return hasSavings;
  }

  async function compressSelectedFile() {
    if (busy) return;
    var level = selectedLevel();
    if (!file || !level) {
      setStatus('Choose an image and select one compression level before continuing.', 'error');
      return;
    }

    busy = true;
    invalidateResult();
    updateControls();
    setStatus('The image is being compressed by this site’s image processor. It is not stored.', '');
    setProgress('Compressing and verifying the image…');
    try {
      var response = await postFile('/api/tools/compress-image', file, level);
      var mime = response.headers.get('Content-Type');
      if (!imageInfo || mime !== imageInfo.mime) {
        throw new Error('The compression engine returned an unexpected image format.');
      }
      var outputInfo = {
        label: response.headers.get('X-Output-Format'),
        width: Number(response.headers.get('X-Output-Width')),
        height: Number(response.headers.get('X-Output-Height')),
        pages: Number(response.headers.get('X-Output-Pages')),
        animated: imageInfo.animated
      };
      if (outputInfo.label !== imageInfo.label ||
          outputInfo.width !== imageInfo.width ||
          outputInfo.height !== imageInfo.height ||
          outputInfo.pages !== imageInfo.pages) {
        throw new Error('The output did not preserve the original format, dimensions, or animation.');
      }
      var blob = await response.blob();
      if (!blob.size || blob.type !== imageInfo.mime) {
        throw new Error('The compressed image could not be verified for download.');
      }
      var nextUrl = URL.createObjectURL(blob);
      var hasSavings;
      try {
        hasSavings = showResults(blob.size, outputInfo);
      } catch (error) {
        URL.revokeObjectURL(nextUrl);
        throw error;
      }
      outputUrl = nextUrl;
      resultImage.addEventListener('error', function onResultPreviewError() {
        resultImage.removeEventListener('error', onResultPreviewError);
        if (resultImage.src !== outputUrl) return;
        resultImage.hidden = true;
        resultCaption.textContent = 'Processed file is valid, but this browser cannot preview this image format.';
      });
      resultImage.src = outputUrl;
      resultPreview.hidden = false;
      if (hasSavings) {
        var filename = response.headers.get('X-Output-Filename');
        if (!filename || /[/\\]/.test(filename)) throw new Error('The output filename could not be verified.');
        downloadButton.href = outputUrl;
        downloadButton.download = filename.replace(/^(.+?)(\.[^.]+)$/, '$1-compressed$2');
        downloadButton.hidden = false;
        setStatus('Compression is complete. The result reflects the actual image sizes.', 'success');
      } else {
        setStatus('The image was processed, but compression did not reduce its size. Keep the original.', '');
      }
    } catch (error) {
      invalidateResult();
      setStatus(error && error.message ? error.message :
        'The image could not be compressed. Check the file and try again.', 'error');
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
    if (!busy && event.dataTransfer && event.dataTransfer.files.length) loadImage(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    var nextFile = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (nextFile) loadImage(nextFile);
  });
  compressionInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked) {
        invalidateResult();
        setStatus('Compression level changed. Compress the image again to update the result.', '');
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
    revokeUrl(sourceUrl);
  });

  updateControls();
})();
