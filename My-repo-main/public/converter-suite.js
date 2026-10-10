(function () {
  'use strict';

  var documentFormats = {
    pdf: { label: 'PDF', extensions: ['.pdf'], mime: 'application/pdf', limit: 30 * 1024 * 1024 },
    word: { label: 'Word', extensions: ['.docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', limit: 30 * 1024 * 1024 },
    powerpoint: { label: 'PowerPoint', extensions: ['.pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', limit: 30 * 1024 * 1024 },
    excel: { label: 'Excel', extensions: ['.xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: 30 * 1024 * 1024 }
  };
  var imageFormats = {
    jpeg: { label: 'JPEG', extension: '.jpeg', mime: 'image/jpeg', limit: 20 * 1024 * 1024 },
    jpg: { label: 'JPG', extension: '.jpg', mime: 'image/jpeg', limit: 20 * 1024 * 1024 },
    png: { label: 'PNG', extension: '.png', mime: 'image/png', limit: 20 * 1024 * 1024 },
    webp: { label: 'WebP', extension: '.webp', mime: 'image/webp', limit: 20 * 1024 * 1024 }
  };

  document.querySelectorAll('[data-converter]').forEach(function (panel) {
    var kind = panel.getAttribute('data-converter');
    var formats = kind === 'image' ? imageFormats : documentFormats;
    var file = null;
    var outputUrl = null;
    var busy = false;
    var requestController = null;
    var fromSelect = panel.querySelector('[data-format="from"]');
    var toSelect = panel.querySelector('[data-format="to"]');
    var fileInput = panel.querySelector('[data-file]');
    var upload = panel.querySelector('[data-upload]');
    var uploadTitle = panel.querySelector('[data-upload-title]');
    var uploadHint = panel.querySelector('[data-upload-hint]');
    var uploadTypes = panel.querySelector('[data-upload-types]');
    var fileInfo = panel.querySelector('[data-file-info]');
    var fileType = panel.querySelector('[data-file-type]');
    var fileName = panel.querySelector('[data-file-name]');
    var fileSize = panel.querySelector('[data-file-size]');
    var removeButton = panel.querySelector('[data-remove]');
    var convertButton = panel.querySelector('[data-convert]');
    var convertLabel = panel.querySelector('[data-convert-label]');
    var spinner = panel.querySelector('.converter-spinner');
    var downloadButton = panel.querySelector('[data-download]');
    var selectionLabel = panel.querySelector('[data-selection]');
    var status = panel.querySelector('[data-status]');

    function sourceConfig() {
      return formats[fromSelect.value];
    }

    function targetConfig() {
      return formats[toSelect.value];
    }

    function setStatus(message, state) {
      status.textContent = message;
      status.classList.toggle('is-error', state === 'error');
      status.classList.toggle('is-success', state === 'success');
    }

    function invalidateResult() {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = null;
      downloadButton.removeAttribute('href');
      downloadButton.hidden = true;
    }

    function updateFormats() {
      var from = sourceConfig();
      var to = targetConfig();
      selectionLabel.textContent = from.label + '  →  ' + to.label;
      fileInput.accept = from.extensions
        ? from.extensions.join(',') + ',' + from.mime
        : from.extension + ',' + from.mime;
      uploadTypes.textContent = from.extensions
        ? from.extensions.join(', ').toUpperCase() + ' · up to 30 MB'
        : from.extension.toUpperCase() + ' · up to 20 MB';
      uploadTitle.textContent = file ? 'Replace your file' : 'Select a ' + from.label + (kind === 'image' ? ' image' : ' file');
      uploadHint.textContent = file ? 'Choose another file or drop it here' : 'Drop your file here or browse';
      fileType.textContent = from.label;
      updateControls();
    }

    function updateControls() {
      var available = !busy && Boolean(file);
      upload.setAttribute('aria-disabled', String(busy));
      fromSelect.disabled = busy;
      toSelect.disabled = busy;
      fileInput.disabled = busy;
      removeButton.disabled = busy || !file;
      convertButton.disabled = !available;
      convertButton.setAttribute('aria-busy', String(busy));
      convertLabel.textContent = busy ? 'Converting…' : 'Convert';
      spinner.hidden = !busy;
      fileInfo.hidden = !file;
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      var units = ['KB', 'MB'];
      var size = bytes / 1024;
      var index = 0;
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
      }
      return size.toFixed(size >= 10 ? 1 : 2) + ' ' + units[index];
    }

    function localValidationError(selectedFile) {
      if (!selectedFile || !selectedFile.name) return 'Choose a file to continue.';
      if (!selectedFile.size) return 'The selected file is empty.';
      if (selectedFile.size > sourceConfig().limit) {
        return 'This file is larger than the ' + (kind === 'image' ? '20 MB' : '30 MB') + ' limit.';
      }
      var extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));
      if (sourceConfig().extensions) {
        if (sourceConfig().extensions.indexOf(extension) === -1) {
          return 'Choose a ' + sourceConfig().label + ' file for the selected source format.';
        }
      } else if (extension !== sourceConfig().extension) {
        return 'Choose a ' + sourceConfig().label + ' file with the ' + sourceConfig().extension + ' extension.';
      }
      return '';
    }

    async function inspectFile(selectedFile) {
      if (busy || !selectedFile) return;
      clearFile(false);
      var validationError = localValidationError(selectedFile);
      if (validationError) {
        setStatus(validationError, 'error');
        return;
      }

      busy = true;
      file = selectedFile;
      fileName.textContent = selectedFile.name;
      fileSize.textContent = formatSize(selectedFile.size);
      updateControls();
      setStatus('Checking the file structure…');
      requestController = new AbortController();

      try {
        var formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('from', fromSelect.value);
        formData.append('to', toSelect.value);
        var response = await fetch('/api/tools/converter-suite/' + kind + '/inspect', {
          method: 'POST',
          body: formData,
          signal: requestController.signal
        });
        var result = await readJsonResponse(response);
        if (!response.ok) throw new Error(result.error || 'This file could not be validated.');
        setStatus(result.message || 'File checked. Ready to convert.', 'success');
      } catch (error) {
        if (error.name !== 'AbortError') {
          file = null;
          setStatus(error.message || 'This file could not be validated.', 'error');
        }
      } finally {
        requestController = null;
        busy = false;
        updateControls();
      }
    }

    async function convert() {
      if (busy || !file) {
        setStatus('Choose a file before converting.', 'error');
        return;
      }
      invalidateResult();
      busy = true;
      updateControls();
      setStatus('Processing your file. This may take a moment.');
      requestController = new AbortController();
      try {
        var formData = new FormData();
        formData.append('file', file);
        formData.append('from', fromSelect.value);
        formData.append('to', toSelect.value);
        var response = await fetch('/api/tools/converter-suite/' + kind, {
          method: 'POST',
          body: formData,
          signal: requestController.signal
        });
        if (!response.ok) {
          var error = await readJsonResponse(response);
          throw new Error(error.error || 'The conversion could not be completed.');
        }
        var bytes = await response.arrayBuffer();
        if (!bytes.byteLength) throw new Error('The converter returned an empty output file.');
        outputUrl = URL.createObjectURL(new Blob([bytes], { type: response.headers.get('Content-Type') || 'application/octet-stream' }));
        downloadButton.href = outputUrl;
        downloadButton.download = response.headers.get('X-Output-Filename') || makeOutputName(file.name, toSelect.value);
        downloadButton.hidden = false;
        setStatus('Conversion complete. Your file is ready to download.', 'success');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setStatus(error.message || 'The conversion failed. Your original file is still selected.', 'error');
        }
      } finally {
        requestController = null;
        busy = false;
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

    function makeOutputName(inputName, target) {
      var extension = formats[target].extension ||
        { pdf: '.pdf', word: '.docx', powerpoint: '.pptx', excel: '.xlsx' }[target];
      var base = String(inputName || 'converted-file').replace(/\.[^.]+$/, '');
      return base + extension;
    }

    function clearFile(showMessage) {
      invalidateResult();
      if (requestController) requestController.abort();
      requestController = null;
      file = null;
      fileInput.value = '';
      fileName.textContent = '';
      fileSize.textContent = '';
      updateFormats();
      if (showMessage) setStatus('File removed. Choose a file to begin again.');
    }

    fromSelect.addEventListener('change', function () {
      clearFile(false);
      setStatus('Source format changed. Select a matching file.');
    });
    toSelect.addEventListener('change', function () {
      invalidateResult();
      updateFormats();
      setStatus(file ? 'Destination changed. Convert again to create a new output.' : 'Choose a file to begin.');
    });
    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files.length) return;
      if (fileInput.files.length !== 1) {
        clearFile(false);
        setStatus('Choose one file per conversion.', 'error');
        return;
      }
      inspectFile(fileInput.files[0]);
    });
    removeButton.addEventListener('click', function () { clearFile(true); });
    convertButton.addEventListener('click', convert);

    upload.addEventListener('keydown', function (event) {
      if ((event.key === 'Enter' || event.key === ' ') && !busy) {
        event.preventDefault();
        fileInput.click();
      }
    });
    ['dragenter', 'dragover'].forEach(function (eventName) {
      upload.addEventListener(eventName, function (event) {
        event.preventDefault();
        if (!busy) upload.classList.add('is-dragging');
      });
    });
    ['dragleave', 'dragend'].forEach(function (eventName) {
      upload.addEventListener(eventName, function (event) {
        event.preventDefault();
        upload.classList.remove('is-dragging');
      });
    });
    upload.addEventListener('drop', function (event) {
      event.preventDefault();
      upload.classList.remove('is-dragging');
      if (busy) return;
      var dropped = event.dataTransfer && event.dataTransfer.files;
      if (!dropped || !dropped.length) return;
      if (dropped.length !== 1) {
        clearFile(false);
        setStatus('Drop one file per conversion.', 'error');
        return;
      }
      inspectFile(dropped[0]);
    });
    window.addEventListener('pagehide', invalidateResult);

    updateFormats();
    updateControls();
  });
})();
