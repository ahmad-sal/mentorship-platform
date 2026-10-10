(function () {
  'use strict';

  var root = document.querySelector('.merge-pdf-page');
  if (!root || !window.MergePdfEngine) return;

  var MAX_FILES = 20;
  var MAX_TOTAL_BYTES = 100 * 1024 * 1024;
  var files = [];
  var busy = false;
  var mergedObjectUrl = null;
  var nextFileId = 1;

  var uploadArea = root.querySelector('[data-upload-area]');
  var fileInput = root.querySelector('[data-file-input]');
  var emptyState = root.querySelector('[data-empty-state]');
  var fileSection = root.querySelector('[data-file-section]');
  var fileList = root.querySelector('[data-file-list]');
  var fileCount = root.querySelector('[data-file-count]');
  var mergeButton = root.querySelector('[data-action="merge"]');
  var mergeLabel = root.querySelector('[data-merge-label]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var status = root.querySelector('[data-merge-status]');
  var statusMessage = root.querySelector('[data-status-message]');
  var progressWrap = root.querySelector('[data-progress-wrap]');
  var progressMessage = root.querySelector('[data-progress-message]');

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB'];
    var size = bytes / 1024;
    var index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return size.toFixed(size >= 10 ? 0 : 1) + ' ' + units[index];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function pdfIcon() {
    return '<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M6 2.75h13l7 7V31a2.25 2.25 0 0 1-2.25 2.25h-15.5A2.25 2.25 0 0 1 6 31V5a2.25 2.25 0 0 1 2.25-2.25Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M19 3v7h7M9.5 18.5h13M9.5 22.5h13M9.5 26.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M10 14.5h5.2a1.8 1.8 0 0 1 0 3.6H10v-3.6Z" fill="currentColor"/>' +
      '</svg>';
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

  function updateControls() {
    var hasFiles = files.length > 0;
    fileSection.hidden = !hasFiles;
    emptyState.hidden = hasFiles;
    mergeButton.hidden = files.length < 2;
    mergeButton.disabled = busy || files.length < 2;
    uploadArea.setAttribute('aria-disabled', String(busy));
    fileInput.disabled = busy;
    var addButton = root.querySelector('[data-action="add-more"]');
    if (addButton) addButton.disabled = busy;

    root.querySelectorAll('[data-file-action]').forEach(function (button) {
      button.disabled = busy;
    });
  }

  function renderFiles() {
    fileCount.textContent = String(files.length);
    fileList.innerHTML = files.map(function (item, index) {
      var safeName = escapeHtml(item.file.name);
      return '<li class="merge-file-row" data-file-id="' + item.id + '">' +
        '<span class="merge-file-order" aria-label="Merge order ' + (index + 1) + '">' + (index + 1) + '</span>' +
        '<span class="merge-file-icon">' + pdfIcon() + '</span>' +
        '<span class="merge-file-details"><strong title="' + safeName + '">' + safeName + '</strong><small>' + formatSize(item.file.size) + '</small></span>' +
        '<div class="merge-file-controls">' +
          '<button class="merge-order-button" type="button" data-file-action="up" data-file-id="' + item.id + '" aria-label="Move ' + safeName + ' up" title="Move up"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="merge-order-button" type="button" data-file-action="down" data-file-id="' + item.id + '" aria-label="Move ' + safeName + ' down" title="Move down"' + (index === files.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="merge-remove-button" type="button" data-file-action="remove" data-file-id="' + item.id + '" aria-label="Remove ' + safeName + '" title="Remove file">×</button>' +
        '</div>' +
      '</li>';
    }).join('');
    updateControls();
  }

  function invalidateOutput() {
    if (mergedObjectUrl) URL.revokeObjectURL(mergedObjectUrl);
    mergedObjectUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.hidden = true;
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified, file.type].join('::');
  }

  async function hasPdfSignature(file) {
    var bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 1024)).arrayBuffer());
    for (var index = 0; index <= bytes.length - 5; index += 1) {
      if (bytes[index] === 37 && bytes[index + 1] === 80 && bytes[index + 2] === 68 &&
        bytes[index + 3] === 70 && bytes[index + 4] === 45) return true;
    }
    return false;
  }

  function validateFileType(file) {
    var type = String(file.type || '').toLowerCase();
    var hasPdfName = /\.pdf$/i.test(file.name);
    if (type && type !== 'application/pdf' && type !== 'application/octet-stream') {
      return 'is not a PDF file.';
    }
    if (!hasPdfName && type !== 'application/pdf') return 'does not have a PDF file type.';
    if (file.size === 0) return 'is empty.';
    return '';
  }

  async function addFiles(selectedFiles) {
    if (busy || !selectedFiles || !selectedFiles.length) return;
    var incoming = Array.prototype.slice.call(selectedFiles);
    var accepted = [];
    var errors = [];
    var duplicates = 0;
    busy = true;
    updateControls();
    setProgress('Checking selected files…');
    setStatus('Validating PDF files before adding them.', '');

    for (var index = 0; index < incoming.length; index += 1) {
      var file = incoming[index];
      var typeError = validateFileType(file);
      if (typeError) {
        errors.push('"' + file.name + '" ' + typeError);
        continue;
      }
      if (file.size > MAX_TOTAL_BYTES) {
        errors.push('"' + file.name + '" is larger than the 100 MB total size limit.');
        continue;
      }
      if (files.concat(accepted).some(function (item) { return item.key === fileKey(file); })) {
        duplicates += 1;
        continue;
      }
      if (files.length + accepted.length >= MAX_FILES) {
        errors.push('You can select up to ' + MAX_FILES + ' files at a time.');
        continue;
      }
      var currentSize = files.reduce(function (total, item) { return total + item.file.size; }, 0) +
        accepted.reduce(function (total, item) { return total + item.file.size; }, 0);
      if (currentSize + file.size > MAX_TOTAL_BYTES) {
        errors.push('"' + file.name + '" would put the selection over the 100 MB combined size limit.');
        continue;
      }
      try {
        if (!await hasPdfSignature(file)) {
          errors.push('"' + file.name + '" does not contain a valid PDF file header.');
          continue;
        }
        await window.MergePdfEngine.validatePdfFile(file);
      } catch (error) {
        errors.push(error && error.message ? error.message : 'Could not inspect "' + file.name + '". Try selecting it again.');
        continue;
      }
      accepted.push({ id: nextFileId++, key: fileKey(file), file: file });
    }

    if (accepted.length) {
      invalidateOutput();
      files = files.concat(accepted);
      renderFiles();
    }
    busy = false;
    setProgress('');
    updateControls();

    if (errors.length) {
      setStatus(errors.join(' '), 'error');
    } else if (accepted.length) {
      setStatus('Added ' + accepted.length + ' PDF ' + (accepted.length === 1 ? 'file.' : 'files.') +
        (files.length === 1 ? ' Select at least one more PDF to merge.' : '') +
        (duplicates ? ' Skipped ' + duplicates + ' duplicate selection' + (duplicates === 1 ? '.' : 's.') : ''), 'success');
    } else if (duplicates) {
      setStatus('Those files are already selected; duplicate selections were skipped.', '');
    }
  }

  function triggerPicker() {
    if (!busy) fileInput.click();
  }

  function reorderFile(id, direction) {
    var index = files.findIndex(function (item) { return item.id === Number(id); });
    var nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= files.length) return;
    invalidateOutput();
    var moved = files.splice(index, 1)[0];
    files.splice(nextIndex, 0, moved);
    renderFiles();
    setStatus('Merge order updated. Merge again to create a PDF in this order.', '');
  }

  function progressText(progress) {
    if (progress.stage === 'reading') {
      return 'Reading document ' + progress.fileIndex + ' of ' + progress.totalFiles + ': ' + progress.fileName;
    }
    if (progress.stage === 'copying') {
      return 'Copying page ' + progress.pageIndex + ' of ' + progress.filePages + ' from document ' +
        progress.fileIndex + ' of ' + progress.totalFiles + '…';
    }
    if (progress.stage === 'saving') return 'Building the merged PDF…';
    return '';
  }

  async function mergeFiles() {
    if (busy) return;
    if (files.length < 2) {
      setStatus('Select at least two PDF files to merge.', 'error');
      return;
    }

    busy = true;
    mergeLabel.textContent = 'Merging…';
    mergeButton.setAttribute('aria-busy', 'true');
    updateControls();
    setStatus('Your files are being combined locally in this browser.', '');
    setProgress('Preparing your documents…');

    try {
      var bytes = await window.MergePdfEngine.mergePdfs(files.map(function (item) { return item.file; }), function (progress) {
        var message = progressText(progress);
        if (message) setProgress(message);
      });
      var newObjectUrl;
      try {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        if (!blob.size) throw new Error('empty output');
        newObjectUrl = URL.createObjectURL(blob);
      } catch (error) {
        throw new Error('The merged PDF was generated, but this browser could not prepare it for download. Try a smaller set of files.');
      }
      invalidateOutput();
      mergedObjectUrl = newObjectUrl;
      downloadButton.href = mergedObjectUrl;
      downloadButton.hidden = false;
      setStatus('Your PDF is ready to download. ' + files.length + ' documents were combined in the order shown.', 'success');
    } catch (error) {
      setStatus(error && error.message ? error.message : 'The PDFs could not be merged. Check the files and try again.', 'error');
    } finally {
      busy = false;
      mergeLabel.textContent = 'Merge PDF';
      mergeButton.removeAttribute('aria-busy');
      setProgress('');
      updateControls();
    }
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
    if (!busy && event.dataTransfer) addFiles(event.dataTransfer.files);
  });

  fileInput.addEventListener('change', function () {
    var selectedFiles = fileInput.files;
    addFiles(selectedFiles);
    fileInput.value = '';
  });

  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action], button[data-file-action]');
    if (!button || !root.contains(button)) return;
    var action = button.getAttribute('data-action');
    if (action === 'add-more') triggerPicker();
    else if (action === 'merge') mergeFiles();
    else {
      var fileAction = button.getAttribute('data-file-action');
      if (!fileAction || busy) return;
      var itemIndex = files.findIndex(function (item) {
        return item.id === Number(button.getAttribute('data-file-id'));
      });
      if (itemIndex < 0) return;
      if (fileAction === 'remove') {
        invalidateOutput();
        files.splice(itemIndex, 1);
        renderFiles();
        setStatus(files.length ? 'File removed. Merge again to update the result.' : 'No files selected yet.', '');
      } else if (fileAction === 'up') reorderFile(button.getAttribute('data-file-id'), -1);
      else if (fileAction === 'down') reorderFile(button.getAttribute('data-file-id'), 1);
    }
  });

  window.addEventListener('pagehide', function () {
    if (mergedObjectUrl) URL.revokeObjectURL(mergedObjectUrl);
  });

  renderFiles();
})();
