import * as PDFJS from '/vendor/pdfjs.js';
import { createQpdfRunner } from '/vendor/qpdf-run/src/index.js';

(function () {
  'use strict';

  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var runnerPromise = null;
  var queue = Promise.resolve();
  var panelElements = Array.from(document.querySelectorAll('[data-panel]'));
  if (!panelElements.length) return;

  PDFJS.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs.worker.js';

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB'];
    var value = bytes / 1024;
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return value.toFixed(value < 10 ? 1 : 0) + ' ' + units[unit];
  }

  function status(panel, message, kind) {
    panel.status.textContent = message || '';
    panel.status.classList.toggle('is-error', kind === 'error');
    panel.status.classList.toggle('is-success', kind === 'success');
  }

  function clearOutput(panel) {
    if (panel.state.outputUrl) URL.revokeObjectURL(panel.state.outputUrl);
    panel.state.outputUrl = null;
    panel.download.removeAttribute('href');
    panel.download.removeAttribute('download');
    panel.download.hidden = true;
  }

  function setBusy(panel, busy, label) {
    panel.state.processing = busy;
    panel.progress.hidden = !busy;
    panel.progressLabel.textContent = label || 'Processing PDF locally…';
    panel.fileInput.disabled = busy;
    panel.selectButton.disabled = busy;
    panel.removeButton.disabled = busy;
    panel.uploadArea.setAttribute('aria-disabled', String(busy));
    panel.uploadArea.tabIndex = busy ? -1 : 0;
    panel.submit.disabled = busy || !canSubmit(panel);
    panel.submit.setAttribute('aria-busy', String(busy));
    panel.submitLabel.textContent = busy
      ? (panel.mode === 'protect' ? 'Protecting…' : 'Unlocking…')
      : (panel.mode === 'protect' ? 'Protect PDF' : 'Unlock PDF');
    panel.passwordFields.querySelectorAll('input, button').forEach(function (control) {
      control.disabled = busy;
    });
  }

  function canSubmit(panel) {
    var state = panel.state;
    if (!state.file || !state.valid || state.processing) return false;
    if (panel.mode === 'protect') {
      var password = panel.password.value;
      var confirmation = panel.confirmPassword.value;
      if (!password || password !== confirmation) return false;
      return new TextEncoder().encode(password).length <= 127;
    }
    return !state.requiresPassword || Boolean(panel.password.value);
  }

  function updateSubmit(panel) {
    panel.submit.disabled = !canSubmit(panel);
  }

  function updatePasswordMatch(panel) {
    if (panel.mode !== 'protect') return;
    var password = panel.password.value;
    var confirmation = panel.confirmPassword.value;
    if (!confirmation) {
      panel.matchStatus.textContent = '';
      panel.matchStatus.classList.remove('is-match', 'is-mismatch');
      updateSubmit(panel);
      return;
    }
    var matches = Boolean(password) && password === confirmation;
    panel.matchStatus.textContent = matches ? 'Passwords match' : 'Passwords do not match';
    panel.matchStatus.classList.toggle('is-match', matches);
    panel.matchStatus.classList.toggle('is-mismatch', !matches);
    updateSubmit(panel);
  }

  function invalidate(panel, clearMessage) {
    clearOutput(panel);
    if (clearMessage) status(panel, '');
  }

  function pdfErrorMessage(error) {
    if (error && error.name === 'PasswordException') return 'This PDF requires an opening password.';
    return 'This file is not a valid, readable PDF. Choose another PDF and try again.';
  }

  async function readPdf(file) {
    if (!file || !file.size) throw new Error('This file is empty. Select a valid PDF.');
    if (file.size > MAX_FILE_BYTES) throw new Error('This PDF exceeds the 100 MB browser processing limit.');
    var bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 5 || String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 5))) !== '%PDF-') {
      throw new Error('The selected file does not contain a valid PDF header.');
    }
    return bytes;
  }

  async function inspectPdf(bytes, password) {
    var task = PDFJS.getDocument({ data: bytes.slice(), password: password || undefined });
    try {
      var documentProxy = await task.promise;
      var pageCount = documentProxy.numPages;
      if (!pageCount) throw new Error('The PDF does not contain any pages.');
      await documentProxy.destroy();
      return pageCount;
    } catch (error) {
      try { await task.destroy(); } catch (cleanupError) { /* The loading task may already be closed. */ }
      throw error;
    }
  }

  async function getRunner() {
    if (!runnerPromise) {
      runnerPromise = createQpdfRunner({
        workerUrl: '/vendor/qpdf-run/src/worker.js',
        qpdfJsUrl: '/vendor/qpdf-run/vendor/qpdf/lib/qpdf.js',
        wasmUrl: '/vendor/qpdf-run/vendor/qpdf/lib/qpdf.wasm',
        timeoutMs: 180000
      }).catch(function (error) {
        runnerPromise = null;
        throw error;
      });
    }
    return runnerPromise;
  }

  function runQpdf(bytes, args, outputs) {
    var task = queue.then(async function () {
      var runner = await getRunner();
      return runner.run({
        inputs: { 'source.pdf': bytes },
        args: args,
        outputs: outputs || []
      });
    });
    queue = task.catch(function () {});
    return task;
  }

  function hasEncryptionEntry(bytes) {
    function lastIndexOf(token, from) {
      var start = Math.min(from, bytes.length - token.length);
      for (var index = start; index >= 0; index -= 1) {
        var matched = true;
        for (var offset = 0; offset < token.length; offset += 1) {
          if (bytes[index + offset] !== token.charCodeAt(offset)) {
            matched = false;
            break;
          }
        }
        if (matched) return index;
      }
      return -1;
    }

    function indexOf(token, from) {
      for (var index = Math.max(0, from); index <= bytes.length - token.length; index += 1) {
        var matched = true;
        for (var offset = 0; offset < token.length; offset += 1) {
          if (bytes[index + offset] !== token.charCodeAt(offset)) {
            matched = false;
            break;
          }
        }
        if (matched) return index;
      }
      return -1;
    }

    var trailer = lastIndexOf('trailer', bytes.length);
    var startXref = lastIndexOf('startxref', bytes.length);
    var marker = indexOf('/Encrypt', trailer >= 0 ? trailer : 0);
    if (trailer >= 0 && marker >= trailer && (startXref < 0 || marker < startXref)) return true;

    var xrefType = lastIndexOf('/Type /XRef', startXref >= 0 ? startXref : bytes.length);
    var stream = xrefType >= 0 ? indexOf('stream', xrefType) : -1;
    marker = xrefType >= 0 ? indexOf('/Encrypt', xrefType) : -1;
    return xrefType >= 0 && marker > xrefType && stream > marker;
  }

  async function isEncrypted(bytes) {
    try {
      var result = await runQpdf(bytes, ['source.pdf', 'probe.pdf'], ['probe.pdf']);
      return hasEncryptionEntry(result.outputs['probe.pdf']);
    } catch (error) {
      throw new Error('The local PDF security engine could not inspect this document. It may be damaged, unsupported, or exceed this browser’s available memory.');
    }
  }

  function showFile(panel, file) {
    panel.fileName.textContent = file.name;
    panel.fileMeta.textContent = 'PDF document · ' + formatBytes(file.size);
    panel.fileInfo.hidden = false;
    panel.uploadArea.hidden = true;
    panel.passwordFields.hidden = panel.mode === 'protect' ? !panel.state.valid : !panel.state.requiresPassword;
  }

  function clearPanel(panel, message) {
    panel.state.version += 1;
    panel.state.file = null;
    panel.state.bytes = null;
    panel.state.valid = false;
    panel.state.encrypted = false;
    panel.state.requiresPassword = false;
    panel.fileInput.value = '';
    panel.fileInput.disabled = false;
    panel.selectButton.disabled = false;
    panel.removeButton.disabled = false;
    panel.uploadArea.hidden = false;
    panel.uploadArea.tabIndex = 0;
    panel.uploadArea.setAttribute('aria-disabled', 'false');
    panel.fileInfo.hidden = true;
    panel.passwordFields.hidden = true;
    panel.password.value = '';
    panel.password.type = 'password';
    panel.togglePassword.textContent = 'Show';
    panel.togglePassword.setAttribute('aria-pressed', 'false');
    panel.togglePassword.setAttribute('aria-label', panel.mode === 'protect' ? 'Show password' : 'Show current PDF password');
    if (panel.confirmPassword) {
      panel.confirmPassword.value = '';
      panel.confirmPassword.type = 'password';
      panel.toggleConfirm.textContent = 'Show';
      panel.toggleConfirm.setAttribute('aria-label', 'Show confirmation password');
      panel.toggleConfirm.setAttribute('aria-pressed', 'false');
    }
    if (panel.matchStatus) {
      panel.matchStatus.textContent = '';
      panel.matchStatus.classList.remove('is-match', 'is-mismatch');
    }
    clearOutput(panel);
    panel.progress.hidden = true;
    panel.submit.disabled = true;
    panel.submitLabel.textContent = panel.mode === 'protect' ? 'Protect PDF' : 'Unlock PDF';
    status(panel, message || '');
  }

  async function selectFile(panel, file) {
    if (!file || panel.state.processing) return;
    var version = panel.state.version + 1;
    clearPanel(panel, '');
    panel.state.version = version;
    panel.state.file = file;
    showFile(panel, file);
    status(panel, 'Checking the PDF locally…');
    try {
      var bytes = await readPdf(file);
      var pages;
      var passwordRequired = false;
      try {
        pages = await inspectPdf(bytes);
      } catch (error) {
        if (error && error.name === 'PasswordException' && panel.mode === 'unlock') {
          passwordRequired = true;
        } else if (error && error.name === 'PasswordException') {
          throw new Error('This PDF is already password-protected. Unlock it with the current password before protecting it again.');
        } else {
          throw new Error(pdfErrorMessage(error));
        }
      }
      var encrypted = passwordRequired ? true : await isEncrypted(bytes);
      if (panel.state.version !== version) return;
      if (panel.mode === 'protect' && encrypted) {
        throw new Error('This PDF already has encryption. Unlock it with the existing password before protecting it again.');
      }
      panel.state.bytes = bytes;
      panel.state.valid = true;
      panel.state.encrypted = encrypted;
      panel.state.requiresPassword = passwordRequired;
      panel.passwordFields.hidden = panel.mode === 'protect' ? false : !passwordRequired;
      if (panel.mode === 'unlock') {
        if (passwordRequired) {
          status(panel, 'This PDF requires its current opening password to continue.');
        } else if (encrypted) {
          status(panel, 'The PDF opens without a password. Its supported protection can be removed.');
        } else {
          status(panel, 'No opening password was found. You can still create a verified, unprotected PDF copy.');
        }
      } else {
        status(panel, 'PDF ready. Choose and confirm a password to protect it.');
      }
      updateSubmit(panel);
    } catch (error) {
      if (panel.state.version !== version) return;
      panel.state.valid = false;
      panel.state.bytes = null;
      panel.passwordFields.hidden = true;
      status(panel, error && error.message ? error.message : 'The PDF could not be validated.', 'error');
      updateSubmit(panel);
    }
  }

  function filenameFor(file, prefix) {
    var stem = file.name.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 90);
    return prefix + '-' + (stem || 'document') + '.pdf';
  }

  function saveDownload(panel, bytes, prefix) {
    clearOutput(panel);
    panel.state.outputUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    panel.download.href = panel.state.outputUrl;
    panel.download.download = filenameFor(panel.state.file, prefix);
    panel.download.hidden = false;
  }

  async function verifyPdf(bytes, expectedPages, password) {
    if (bytes.length < 8 || String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 5))) !== '%PDF-') {
      throw new Error('The generated file is not a valid PDF.');
    }
    var pages = await inspectPdf(bytes, password);
    if (pages !== expectedPages) throw new Error('The generated PDF did not preserve the original page count.');
  }

  function randomOwnerPassword() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  async function protect(panel) {
    if (!canSubmit(panel)) return;
    invalidate(panel, false);
    var password = panel.password.value;
    var confirmation = panel.confirmPassword.value;
    if (!password || password !== confirmation || new TextEncoder().encode(password).length > 127) {
      status(panel, 'Enter a password of up to 127 UTF-8 bytes and confirm it exactly.', 'error');
      updateSubmit(panel);
      return;
    }
    var bytes = panel.state.bytes;
    var expectedPages;
    panel.passwordFields.querySelectorAll('input, button').forEach(function (control) { control.disabled = true; });
    setBusy(panel, true, 'Applying AES-256 protection locally…');
    status(panel, 'Encrypting and verifying the protected PDF…');
    try {
      expectedPages = await inspectPdf(bytes);
      if (await isEncrypted(bytes)) {
        throw new Error('This PDF already has encryption. Unlock it with the existing password before protecting it again.');
      }
      var output = await runQpdf(bytes, [
        '--encrypt', password, randomOwnerPassword(), '256',
        '--', 'source.pdf', 'protected.pdf'
      ], ['protected.pdf']);
      var protectedBytes = output.outputs['protected.pdf'];
      if (!protectedBytes || !hasEncryptionEntry(protectedBytes)) {
        throw new Error('The encryption engine did not produce a password-protected PDF.');
      }
      var passwordRequired = false;
      try {
        await inspectPdf(protectedBytes);
      } catch (error) {
        if (error && error.name === 'PasswordException') passwordRequired = true;
        else throw error;
      }
      if (!passwordRequired) throw new Error('The generated PDF did not require an opening password.');
      await verifyPdf(protectedBytes, expectedPages, password);
      saveDownload(panel, protectedBytes, 'protected');
      panel.password.value = '';
      panel.confirmPassword.value = '';
      updatePasswordMatch(panel);
      status(panel, 'PDF protected with AES-256. The password was verified and the original pages were preserved.', 'success');
    } catch (error) {
      var message = error && error.message && /already has encryption|127 UTF-8|page count|valid PDF|did not require|did not produce/.test(error.message)
        ? error.message
        : 'The PDF could not be protected. It may be damaged, unsupported, or exceed this browser’s available memory.';
      status(panel, message, 'error');
    } finally {
      setBusy(panel, false);
      updatePasswordMatch(panel);
      updateSubmit(panel);
    }
  }

  async function unlock(panel) {
    if (!canSubmit(panel)) return;
    invalidate(panel, false);
    var password = panel.password.value;
    var bytes = panel.state.bytes;
    var expectedPages;
    setBusy(panel, true, 'Removing supported PDF protection locally…');
    status(panel, 'Checking the current password and processing the PDF…');
    try {
      try {
        expectedPages = await inspectPdf(bytes, password);
      } catch (error) {
        if (error && error.name === 'PasswordException') {
          throw new Error(panel.state.requiresPassword
            ? (password ? 'Incorrect password. Please try again.' : 'Enter the current PDF password to continue.')
            : 'This PDF requires its current opening password. Enter it and try again.');
        }
        throw new Error(pdfErrorMessage(error));
      }
      var output = await runQpdf(bytes, [
        '--password=' + password,
        '--decrypt', 'source.pdf', 'unlocked.pdf'
      ], ['unlocked.pdf']);
      var unlockedBytes = output.outputs['unlocked.pdf'];
      if (!unlockedBytes || await isEncrypted(unlockedBytes)) {
        throw new Error('The PDF engine could not remove the supported encryption from this document.');
      }
      await verifyPdf(unlockedBytes, expectedPages);
      saveDownload(panel, unlockedBytes, 'unlocked');
      panel.password.value = '';
      status(panel, panel.state.encrypted
        ? 'PDF protection was removed and the unprotected output was verified.'
        : 'The source had no opening password. A verified unprotected PDF copy is ready.', 'success');
    } catch (error) {
      status(panel, error && error.message && /Incorrect password|current PDF password|supported encryption|unprotected PDF|valid, readable PDF/.test(error.message)
        ? error.message
        : 'The PDF could not be unlocked. Check the password and confirm that this encryption format is supported.', 'error');
    } finally {
      setBusy(panel, false);
      updateSubmit(panel);
    }
  }

  function initializePanel(element) {
    var mode = element.dataset.panel;
    var panel = {
      mode: mode,
      state: { file: null, bytes: null, valid: false, encrypted: false, requiresPassword: false, processing: false, outputUrl: null, version: 0 },
      uploadArea: element.querySelector('[data-upload-area]'),
      fileInput: element.querySelector('[data-file-input]'),
      selectButton: element.querySelector('[data-select-file]'),
      fileInfo: element.querySelector('[data-file-info]'),
      fileName: element.querySelector('[data-file-name]'),
      fileMeta: element.querySelector('[data-file-meta]'),
      removeButton: element.querySelector('[data-remove-file]'),
      passwordFields: element.querySelector('[data-password-fields]'),
      password: element.querySelector('[data-password]'),
      confirmPassword: element.querySelector('[data-confirm-password]'),
      togglePassword: element.querySelector('[data-toggle-password]'),
      toggleConfirm: element.querySelector('[data-toggle-confirm]'),
      matchStatus: element.querySelector('[data-match-status]'),
      submit: element.querySelector('[data-submit]'),
      submitLabel: element.querySelector('[data-submit-label]'),
      download: element.querySelector('[data-download]'),
      progress: element.querySelector('[data-progress]'),
      progressLabel: element.querySelector('[data-progress-label]'),
      status: element.querySelector('[data-status]')
    };

    panel.selectButton.addEventListener('click', function () { panel.fileInput.click(); });
    panel.fileInput.addEventListener('change', function () {
      var file = panel.fileInput.files && panel.fileInput.files[0];
      if (file) selectFile(panel, file);
      panel.fileInput.value = '';
    });
    panel.uploadArea.addEventListener('click', function (event) {
      if (!event.target.closest('button') && !panel.state.processing) panel.fileInput.click();
    });
    panel.uploadArea.addEventListener('keydown', function (event) {
      if (event.target === panel.uploadArea && (event.key === 'Enter' || event.key === ' ') && !panel.state.processing) {
        event.preventDefault();
        panel.fileInput.click();
      }
    });
    panel.uploadArea.addEventListener('dragover', function (event) {
      event.preventDefault();
      panel.uploadArea.classList.add('is-dragging');
    });
    panel.uploadArea.addEventListener('dragleave', function (event) {
      if (!panel.uploadArea.contains(event.relatedTarget)) panel.uploadArea.classList.remove('is-dragging');
    });
    panel.uploadArea.addEventListener('drop', function (event) {
      event.preventDefault();
      panel.uploadArea.classList.remove('is-dragging');
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) selectFile(panel, file);
    });
    panel.removeButton.addEventListener('click', function () { clearPanel(panel, 'Select a PDF file to get started.'); });
    panel.password.addEventListener('input', function () {
      invalidate(panel, true);
      if (panel.mode === 'protect') updatePasswordMatch(panel);
      updateSubmit(panel);
    });
    if (panel.confirmPassword) {
      panel.confirmPassword.addEventListener('input', function () {
        invalidate(panel, true);
        updatePasswordMatch(panel);
      });
    }
    var togglePassword = panel.togglePassword;
    togglePassword.addEventListener('click', function () {
      var visible = panel.password.type === 'password';
      panel.password.type = visible ? 'text' : 'password';
      togglePassword.textContent = visible ? 'Hide' : 'Show';
      togglePassword.setAttribute('aria-label', visible
        ? (mode === 'protect' ? 'Hide password' : 'Hide current PDF password')
        : (mode === 'protect' ? 'Show password' : 'Show current PDF password'));
      togglePassword.setAttribute('aria-pressed', String(visible));
    });
    if (panel.confirmPassword) {
      var toggleConfirm = panel.toggleConfirm;
      toggleConfirm.addEventListener('click', function () {
        var visible = panel.confirmPassword.type === 'password';
        panel.confirmPassword.type = visible ? 'text' : 'password';
        toggleConfirm.textContent = visible ? 'Hide' : 'Show';
        toggleConfirm.setAttribute('aria-label', visible ? 'Hide confirmation password' : 'Show confirmation password');
        toggleConfirm.setAttribute('aria-pressed', String(visible));
      });
    }
    panel.submit.addEventListener('click', function () {
      if (mode === 'protect') protect(panel);
      else unlock(panel);
    });
    return panel;
  }

  var panels = panelElements.map(initializePanel);
  window.addEventListener('beforeunload', function () {
    panels.forEach(clearOutput);
    if (runnerPromise) runnerPromise.then(function (runner) { return runner.destroy(); }).catch(function () {});
  });
})();
