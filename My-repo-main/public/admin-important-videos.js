(function () {
  'use strict';

  const form = document.getElementById('videoForm');
  const list = document.getElementById('adminVideoList');
  const listStatus = document.getElementById('adminListStatus');
  const message = document.getElementById('adminMessage');
  const thumbnailInput = document.getElementById('thumbnailFile');
  const videoInput = document.getElementById('videoFile');
  const fileInput = document.getElementById('updateFile');
  const typeInput = document.getElementById('updateType');
  const thumbnailPreview = document.getElementById('thumbnailPreview');
  const thumbnailCurrent = document.getElementById('thumbnailCurrent');
  const videoCurrent = document.getElementById('videoCurrent');
  const fileCurrent = document.getElementById('fileCurrent');
  const videoSelection = document.getElementById('videoSelection');
  const fileSelection = document.getElementById('fileSelection');
  const fileOnlyFields = Array.from(document.querySelectorAll('.file-only'));
  const videoOnlyFields = Array.from(document.querySelectorAll('.video-only'));
  let selectedRecord = null;
  let previewObjectUrl = null;
  let saving = false;

  function showMessage(text, kind) {
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.kind = kind || '';
  }

  async function requestJson(url, options) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { Accept: 'application/json', ...(options && options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `The request failed (HTTP ${response.status}).`);
    return result;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text || '';
    return node;
  }

  function clearPreviewUrl() {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    thumbnailPreview.removeAttribute('src');
    thumbnailPreview.hidden = true;
  }

  function formatDate(value) {
    if (!value) return 'Not updated';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not updated' : date.toLocaleString();
  }

  function renderRecord(record) {
    const isFile = record.content_type === 'file';
    const card = document.createElement('article');
    card.className = 'iv-admin-record';
    const top = document.createElement('div');
    top.className = 'iv-admin-record-top';
    if (record.thumbnail_url) {
      const image = document.createElement('img');
      image.className = 'iv-admin-record-thumb';
      image.src = record.thumbnail_url;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', function () {
        const placeholder = element('div', 'iv-admin-record-thumb iv-admin-thumb-missing', 'Thumbnail unavailable');
        image.replaceWith(placeholder);
      }, { once: true });
      top.append(image);
    } else {
      top.append(element('div', 'iv-admin-record-thumb iv-admin-thumb-missing', 'No thumbnail'));
    }
    const info = document.createElement('div');
    info.className = 'iv-admin-record-info';
    info.append(element('h3', '', record.title));
    info.append(element('span', 'iv-status-badge iv-type-badge', isFile ? 'File Update' : 'Video Update'));
    info.append(element('p', '', isFile ? (record.original_filename || 'File not uploaded') : `/${record.slug}`));
    if (record.description) info.append(element('p', 'iv-admin-description', record.description));
    const badge = element('span', `iv-status-badge iv-status-badge--${record.status}`, record.status === 'published' ? 'Published' : 'Draft');
    badge.setAttribute('aria-label', `Publication status: ${badge.textContent}`);
    info.append(badge);
    top.append(info);

    const assets = element('p', 'iv-admin-assets', isFile
      ? `Thumbnail: ${record.thumbnail_url ? 'Uploaded' : 'Optional · not uploaded'} · File: ${record.file_url ? 'Uploaded' : 'Not uploaded'}`
      : `Thumbnail: ${record.thumbnail_url ? 'Uploaded' : 'Not uploaded'} · Video: ${record.video_url ? 'Uploaded' : 'Not uploaded'}`);
    const updated = element('p', 'iv-admin-updated',
      `Uploaded: ${formatDate(isFile ? record.file_uploaded_at : record.created_at)} · Last updated: ${formatDate(record.updated_at)}`);
    const actions = document.createElement('div');
    actions.className = 'iv-admin-record-actions';
    const edit = element('button', 'btn btn-secondary btn-sm', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => loadRecordIntoForm(record));
    const toggle = element('button', 'btn btn-secondary btn-sm', record.status === 'published' ? 'Unpublish' : 'Publish');
    toggle.type = 'button';
    toggle.disabled = record.status !== 'published' && (isFile ? !record.file_url : (!record.thumbnail_url || !record.video_url));
    toggle.title = toggle.disabled ? 'Upload the required update media before publishing.' : '';
    toggle.addEventListener('click', () => changeStatus(record, record.status === 'published' ? 'draft' : 'published'));
    const remove = element('button', 'btn btn-danger btn-sm', 'Delete');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteRecord(record));
    actions.append(edit, toggle, remove);
    card.append(top, assets, updated, actions);
    return card;
  }

  async function loadVideos() {
    listStatus.textContent = 'Loading records…';
    list.replaceChildren();
    try {
      const result = await requestJson('/api/admin/important-videos');
      const videos = result.updates || result.videos || [];
      listStatus.textContent = `${videos.length} ${videos.length === 1 ? 'record' : 'records'}`;
      if (!videos.length) list.append(element('p', 'iv-admin-empty', 'No update records found.'));
      else videos.forEach(record => list.append(renderRecord(record)));
    } catch (error) {
      listStatus.textContent = 'Records could not be loaded.';
      list.append(element('p', 'iv-admin-empty iv-admin-error', error.message));
    }
  }

  function clearForm() {
    form.reset();
    document.getElementById('recordId').value = '';
    document.getElementById('formHeading').textContent = 'New Updates';
    document.getElementById('videoOrder').value = '0';
    typeInput.disabled = false;
    typeInput.value = 'video';
    selectedRecord = null;
    thumbnailInput.value = '';
    videoInput.value = '';
    fileInput.value = '';
    thumbnailCurrent.replaceChildren();
    videoCurrent.replaceChildren();
    fileCurrent.replaceChildren();
    videoSelection.textContent = '';
    fileSelection.textContent = '';
    clearPreviewUrl();
    showMessage('', '');
    slugEdited = false;
    syncUpdateType();
  }

  function showCurrentMedia(container, record, kind) {
    container.replaceChildren();
    const url = kind === 'thumbnail' ? record.thumbnail_url
      : kind === 'video' ? record.video_url : record.file_url;
    if (!url) {
      container.append(element('span', 'iv-missing-media', `${kind === 'thumbnail' ? 'Thumbnail' : kind === 'video' ? 'Video' : 'File'}: Not uploaded`));
      return;
    }
    const link = element('a', 'iv-media-link', kind === 'thumbnail' ? 'Thumbnail currently uploaded'
      : kind === 'video' ? 'Video currently uploaded' : `${record.original_filename || 'Update file'} currently uploaded`);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.append(link);
  }

  function loadRecordIntoForm(record) {
    clearForm();
    selectedRecord = record;
    typeInput.value = record.content_type === 'file' ? 'file' : 'video';
    typeInput.disabled = true;
    document.getElementById('recordId').value = record.id;
    document.getElementById('formHeading').textContent = 'Edit Update';
    form.elements.title.value = record.title || '';
    form.elements.slug.value = record.slug || '';
    form.elements.category.value = record.category || '';
    form.elements.description.value = record.description || '';
    form.elements.details.value = record.details || '';
    form.elements.status.value = record.status || 'draft';
    form.elements.display_order.value = String(record.display_order ?? 0);
    syncUpdateType();
    showCurrentMedia(thumbnailCurrent, record, 'thumbnail');
    showCurrentMedia(videoCurrent, record, 'video');
    showCurrentMedia(fileCurrent, record, 'file');
    showMessage(`Editing “${record.title}”. Empty file inputs keep the saved media.`, 'info');
    document.getElementById('formHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function changeStatus(record, status) {
    try {
      const result = await requestJson(`/api/admin/important-videos/${encodeURIComponent(record.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      showMessage(`“${(result.update || result.video).title}” is now ${status}.`, 'success');
      await loadVideos();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function deleteRecord(record) {
    if (!window.confirm(`Delete “${record.title}” and its stored media? This cannot be undone.`)) return;
    try {
      const result = await requestJson(`/api/admin/important-videos/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      const warning = result.cleanupWarnings && result.cleanupWarnings.length ? ` ${result.cleanupWarnings.join(' ')}` : '';
      showMessage(`Update deleted.${warning}`, result.cleanupWarnings && result.cleanupWarnings.length ? 'warning' : 'success');
      if (selectedRecord && selectedRecord.id === record.id) clearForm();
      await loadVideos();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function validateFiles() {
    const thumbnail = thumbnailInput.files[0];
    const video = videoInput.files[0];
    const file = fileInput.files[0];
    const isFile = typeInput.value === 'file';
    if (thumbnail && (thumbnail.size > 8 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(thumbnail.type))) {
      throw new Error('Choose a JPEG, PNG, or WebP thumbnail that is 8 MB or smaller.');
    }
    if (!isFile && video && (video.size > 200 * 1024 * 1024 || video.type !== 'video/mp4')) {
      throw new Error('Choose an MP4 video that is 200 MB or smaller.');
    }
    if (isFile && file && (file.size > 50 * 1024 * 1024 || !/\.(pdf|docx?|pptx?|xlsx?|zip|txt|jpe?g|png|webp)$/i.test(file.name))) {
      throw new Error('Choose a supported document, ZIP, text, or image file that is 50 MiB or smaller.');
    }
    if (form.elements.status.value === 'published') {
      if (!form.elements.title.value.trim()) throw new Error('Enter a title before publishing.');
      if (isFile) {
        if (!file && !(selectedRecord && selectedRecord.file_url)) throw new Error('Upload a file before publishing.');
      } else {
        if (!thumbnail && !(selectedRecord && selectedRecord.thumbnail_url)) throw new Error('Upload a thumbnail before publishing.');
        if (!video && !(selectedRecord && selectedRecord.video_url)) throw new Error('Upload a video before publishing.');
      }
    }
  }

  function syncUpdateType() {
    const isFile = typeInput.value === 'file';
    fileOnlyFields.forEach((field) => { field.hidden = !isFile; });
    videoOnlyFields.forEach((field) => { field.hidden = isFile; });
    videoInput.disabled = isFile;
    fileInput.disabled = !isFile;
    if (isFile) {
      videoInput.value = '';
      videoSelection.textContent = '';
    } else {
      fileInput.value = '';
      fileSelection.textContent = '';
    }
    document.getElementById('formHeading').textContent = selectedRecord
      ? 'Edit Update'
      : isFile ? 'New File Update' : 'New Video Update';
    document.getElementById('saveVideoButton').textContent = 'Save Update';
  }

  async function uploadFileWithTus(file, progress, progressLabel) {
    if (!window.tus || typeof window.tus.Upload !== 'function') {
      throw new Error('The resumable upload client did not load. Refresh the page and try again.');
    }
    const session = await requestJson('/api/admin/important-updates/upload-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_filename: file.name,
        file_mime_type: file.type,
        file_size: file.size
      })
    });

    return new Promise((resolve, reject) => {
      const upload = new window.tus.Upload(file, {
        endpoint: session.endpoint,
        headers: { 'x-signature': session.token },
        metadata: {
          bucketName: session.bucket,
          objectName: session.path,
          contentType: file.type,
          cacheControl: '3600'
        },
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        onError(error) {
          const detail = String(error && error.message || 'Storage rejected the upload.')
            .replace(/https?:\/\/\S+/gi, '[storage endpoint]')
            .replace(/\b(api[_-]?key|api[_-]?secret|signature|token|authorization)\b([=:]\s*|%3D)[^\s&]+/gi, '$1=[redacted]')
            .slice(0, 400);
          reject(new Error(`Supabase resumable upload failed: ${detail}`));
        },
        onProgress(bytesUploaded, bytesTotal) {
          const percentage = bytesTotal ? Math.round(bytesUploaded / bytesTotal * 100) : 0;
          const uploadedMiB = (bytesUploaded / (1024 * 1024)).toFixed(1);
          const totalMiB = (bytesTotal / (1024 * 1024)).toFixed(1);
          progress.value = percentage;
          progressLabel.textContent = `Uploading original file… ${percentage}% (${uploadedMiB} of ${totalMiB} MiB)`;
        },
        onSuccess() {
          resolve({
            path: session.path,
            originalFilename: file.name,
            mimeType: file.type,
            size: file.size
          });
        }
      });
      upload.start();
    });
  }

  function sendUpdateForm(data, id) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(id ? 'PUT' : 'POST', id
        ? `/api/admin/important-videos/${encodeURIComponent(id)}`
        : '/api/admin/important-videos');
      request.withCredentials = true;
      request.setRequestHeader('Accept', 'application/json');
      request.upload.addEventListener('progress', function (uploadEvent) {
        if (!uploadEvent.lengthComputable) return;
        const percentage = Math.round(uploadEvent.loaded / uploadEvent.total * 100);
        document.getElementById('uploadProgress').value = percentage;
        document.getElementById('uploadProgressLabel').textContent =
          percentage < 100 ? `Uploading other selected media… ${percentage}%` : 'Saving update record…';
      });
      request.addEventListener('load', function () {
        let result;
        try {
          result = JSON.parse(request.responseText || '{}');
        } catch (error) {
          reject(new Error('The server returned an unreadable response. Refresh the records to confirm the save status.'));
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          const cleanup = result.cleanupWarnings && result.cleanupWarnings.length ? ` ${result.cleanupWarnings.join(' ')}` : '';
          reject(new Error((result.error || `Save failed (HTTP ${request.status}).`) + cleanup));
          return;
        }
        resolve(result);
      });
      request.addEventListener('error', function () {
        reject(new Error('The save connection failed. Refresh the records to confirm whether the save completed.'));
      });
      request.send(data);
    });
  }

  async function saveForm(event) {
    event.preventDefault();
    if (saving) return;
    try {
      validateFiles();
    } catch (error) {
      showMessage(error.message, 'error');
      return;
    }

    const id = document.getElementById('recordId').value;
    const data = new FormData(form);
    data.set('content_type', typeInput.value);
    const selectedFile = typeInput.value === 'file' ? fileInput.files[0] : null;
    data.delete('file');
    const progressWrap = document.getElementById('uploadProgressWrap');
    const progress = document.getElementById('uploadProgress');
    const progressLabel = document.getElementById('uploadProgressLabel');
    const saveButton = document.getElementById('saveVideoButton');
    saving = true;
    saveButton.disabled = true;
    progressWrap.hidden = false;
    progress.value = 0;
    progressLabel.textContent = 'Preparing upload…';
    showMessage(selectedFile ? 'Uploading the original file to private Supabase Storage…' : 'Saving update…', 'info');

    try {
      if (selectedFile) {
        const uploadedFile = await uploadFileWithTus(selectedFile, progress, progressLabel);
        data.set('file_storage_path', uploadedFile.path);
        data.set('file_original_filename', uploadedFile.originalFilename);
        data.set('file_mime_type', uploadedFile.mimeType);
        data.set('file_size', String(uploadedFile.size));
      }
      if (progress.value < 100) progress.value = 100;
      progressLabel.textContent = 'Verifying file and saving update record…';
      const result = await sendUpdateForm(data, id);
      const warnings = result.cleanupWarnings && result.cleanupWarnings.length ? ` ${result.cleanupWarnings.join(' ')}` : '';
      clearForm();
      showMessage(`“${(result.update || result.video).title}” saved successfully.${warnings}`, warnings ? 'warning' : 'success');
      await loadVideos();
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      saving = false;
      saveButton.disabled = false;
      progressWrap.hidden = true;
    }
  }

  let slugEdited = false;
  document.getElementById('videoSlug').addEventListener('input', () => { slugEdited = true; });
  document.getElementById('videoTitle').addEventListener('input', function () {
    if (document.getElementById('recordId').value) return;
    if (!slugEdited) {
      document.getElementById('videoSlug').value = this.value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120)
        .replace(/-+$/g, '');
    }
  });
  thumbnailInput.addEventListener('change', function () {
    clearPreviewUrl();
    const file = this.files[0];
    if (!file) return;
    previewObjectUrl = URL.createObjectURL(file);
    thumbnailPreview.src = previewObjectUrl;
    thumbnailPreview.hidden = false;
  });
  videoInput.addEventListener('change', function () {
    const file = this.files[0];
    videoSelection.textContent = file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB (not saved yet)` : '';
  });
  fileInput.addEventListener('change', function () {
    const file = this.files[0];
    fileSelection.textContent = file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB (not saved yet)` : '';
  });
  typeInput.addEventListener('change', syncUpdateType);
  form.addEventListener('submit', saveForm);
  document.getElementById('newVideoButton').addEventListener('click', () => {
    clearForm();
    slugEdited = false;
    document.getElementById('videoTitle').focus();
  });
  document.getElementById('cancelEditButton').addEventListener('click', () => {
    clearForm();
    slugEdited = false;
  });
  document.getElementById('refreshVideosButton').addEventListener('click', loadVideos);
  document.getElementById('logoutButton').addEventListener('click', async function () {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.assign('/admin/login');
    } catch (error) {
      showMessage('Could not log out. Please try again.', 'error');
    }
  });
  window.addEventListener('beforeunload', clearPreviewUrl);
  loadVideos();
})();
