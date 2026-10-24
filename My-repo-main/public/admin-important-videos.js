(function () {
  'use strict';

  const form = document.getElementById('videoForm');
  const list = document.getElementById('adminVideoList');
  const listStatus = document.getElementById('adminListStatus');
  const message = document.getElementById('adminMessage');
  const thumbnailInput = document.getElementById('thumbnailFile');
  const videoInput = document.getElementById('videoFile');
  const thumbnailPreview = document.getElementById('thumbnailPreview');
  const thumbnailCurrent = document.getElementById('thumbnailCurrent');
  const videoCurrent = document.getElementById('videoCurrent');
  const videoSelection = document.getElementById('videoSelection');
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
    info.append(element('p', '', `/${record.slug}`));
    const badge = element('span', `iv-status-badge iv-status-badge--${record.status}`, record.status === 'published' ? 'Published' : 'Draft');
    badge.setAttribute('aria-label', `Publication status: ${badge.textContent}`);
    info.append(badge);
    top.append(info);

    const assets = element('p', 'iv-admin-assets',
      `Thumbnail: ${record.thumbnail_url ? 'Uploaded' : 'Not uploaded'} · Video: ${record.video_url ? 'Uploaded' : 'Not uploaded'}`);
    const updated = element('p', 'iv-admin-updated', `Last updated: ${formatDate(record.updated_at)}`);
    const actions = document.createElement('div');
    actions.className = 'iv-admin-record-actions';
    const edit = element('button', 'btn btn-secondary btn-sm', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => loadRecordIntoForm(record));
    const toggle = element('button', 'btn btn-secondary btn-sm', record.status === 'published' ? 'Unpublish' : 'Publish');
    toggle.type = 'button';
    toggle.disabled = record.status !== 'published' && (!record.thumbnail_url || !record.video_url);
    toggle.title = toggle.disabled ? 'Upload both media files before publishing.' : '';
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
      const videos = result.videos || [];
      listStatus.textContent = `${videos.length} ${videos.length === 1 ? 'record' : 'records'}`;
      if (!videos.length) list.append(element('p', 'iv-admin-empty', 'No video records found.'));
      else videos.forEach(record => list.append(renderRecord(record)));
    } catch (error) {
      listStatus.textContent = 'Records could not be loaded.';
      list.append(element('p', 'iv-admin-empty iv-admin-error', error.message));
    }
  }

  function clearForm() {
    form.reset();
    document.getElementById('recordId').value = '';
    document.getElementById('formHeading').textContent = 'New video';
    document.getElementById('videoOrder').value = '0';
    selectedRecord = null;
    thumbnailInput.value = '';
    videoInput.value = '';
    thumbnailCurrent.replaceChildren();
    videoCurrent.replaceChildren();
    videoSelection.textContent = '';
    clearPreviewUrl();
    showMessage('', '');
    slugEdited = false;
  }

  function showCurrentMedia(container, record, kind) {
    container.replaceChildren();
    const url = kind === 'thumbnail' ? record.thumbnail_url : record.video_url;
    if (!url) {
      container.append(element('span', 'iv-missing-media', `${kind === 'thumbnail' ? 'Thumbnail' : 'Video'}: Not uploaded`));
      return;
    }
    const link = element('a', 'iv-media-link', `${kind === 'thumbnail' ? 'Thumbnail' : 'Video'} currently uploaded`);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.append(link);
  }

  function loadRecordIntoForm(record) {
    clearForm();
    selectedRecord = record;
    document.getElementById('recordId').value = record.id;
    document.getElementById('formHeading').textContent = 'Edit video';
    form.elements.title.value = record.title || '';
    form.elements.slug.value = record.slug || '';
    form.elements.category.value = record.category || '';
    form.elements.description.value = record.description || '';
    form.elements.details.value = record.details || '';
    form.elements.status.value = record.status || 'draft';
    form.elements.display_order.value = String(record.display_order ?? 0);
    showCurrentMedia(thumbnailCurrent, record, 'thumbnail');
    showCurrentMedia(videoCurrent, record, 'video');
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
      showMessage(`“${result.video.title}” is now ${status}.`, 'success');
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
      showMessage(`Video deleted.${warning}`, result.cleanupWarnings && result.cleanupWarnings.length ? 'warning' : 'success');
      if (selectedRecord && selectedRecord.id === record.id) clearForm();
      await loadVideos();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function validateFiles() {
    const thumbnail = thumbnailInput.files[0];
    const video = videoInput.files[0];
    if (thumbnail && (thumbnail.size > 8 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(thumbnail.type))) {
      throw new Error('Choose a JPEG, PNG, or WebP thumbnail that is 8 MB or smaller.');
    }
    if (video && (video.size > 200 * 1024 * 1024 || video.type !== 'video/mp4')) {
      throw new Error('Choose an MP4 video that is 200 MB or smaller.');
    }
    if (form.elements.status.value === 'published') {
      if (!form.elements.title.value.trim()) throw new Error('Enter a title before publishing.');
      if (!thumbnail && !(selectedRecord && selectedRecord.thumbnail_url)) throw new Error('Upload a thumbnail before publishing.');
      if (!video && !(selectedRecord && selectedRecord.video_url)) throw new Error('Upload a video before publishing.');
    }
  }

  function saveForm(event) {
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
    const request = new XMLHttpRequest();
    request.open(id ? 'PUT' : 'POST', id
      ? `/api/admin/important-videos/${encodeURIComponent(id)}`
      : '/api/admin/important-videos');
    request.withCredentials = true;
    request.setRequestHeader('Accept', 'application/json');
    const progressWrap = document.getElementById('uploadProgressWrap');
    const progress = document.getElementById('uploadProgress');
    const progressLabel = document.getElementById('uploadProgressLabel');
    const saveButton = document.getElementById('saveVideoButton');
    saving = true;
    saveButton.disabled = true;
    progressWrap.hidden = false;
    progress.value = 0;
    progressLabel.textContent = 'Uploading and saving…';
    showMessage('Saving video and uploading selected media…', 'info');

    request.upload.addEventListener('progress', function (uploadEvent) {
      if (!uploadEvent.lengthComputable) return;
      const percentage = Math.round(uploadEvent.loaded / uploadEvent.total * 100);
      progress.value = percentage;
      progressLabel.textContent = percentage < 100 ? `Uploading… ${percentage}%` : 'Saving record…';
    });
    request.addEventListener('load', async function () {
      saving = false;
      saveButton.disabled = false;
      progressWrap.hidden = true;
      let result = {};
      try {
        result = JSON.parse(request.responseText || '{}');
      } catch (error) {
        showMessage('The server returned an unreadable response. Refresh the records to confirm the save status.', 'error');
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        const cleanup = result.cleanupWarnings && result.cleanupWarnings.length ? ` ${result.cleanupWarnings.join(' ')}` : '';
        showMessage((result.error || `Save failed (HTTP ${request.status}).`) + cleanup, 'error');
        return;
      }
      const warnings = result.cleanupWarnings && result.cleanupWarnings.length ? ` ${result.cleanupWarnings.join(' ')}` : '';
      clearForm();
      showMessage(`“${result.video.title}” saved successfully.${warnings}`, warnings ? 'warning' : 'success');
      await loadVideos();
    });
    request.addEventListener('error', function () {
      saving = false;
      saveButton.disabled = false;
      progressWrap.hidden = true;
      showMessage('The upload connection failed. Refresh the records to confirm whether the save completed.', 'error');
    });
    request.send(data);
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
