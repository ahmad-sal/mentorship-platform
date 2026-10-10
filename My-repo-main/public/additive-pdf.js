import * as PDFJS from '/vendor/pdfjs.js';

(function () {
  'use strict';

  var root = document.querySelector('.additive-pdf-public-page');
  if (!root) return;

  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var MAX_PAGES = 250;
  var MAX_HISTORY = 12;
  var state = {
    file: null,
    bytes: null,
    pdf: null,
    ready: false,
    pages: [],
    pageIndex: 0,
    scale: 1,
    mode: 'select',
    shapeType: 'arrow',
    selectedId: null,
    dirty: false,
    saving: false,
    outputUrl: null,
    renderTask: null,
    history: [],
    redo: [],
    drawing: null,
    placement: null,
    propertyBefore: null,
    textEditBefore: null
  };

  var uploadPanel = root.querySelector('[data-upload-panel]');
  var uploadStatus = root.querySelector('[data-upload-status]');
  var editor = root.querySelector('[data-editor]');
  var fileInput = root.querySelector('[data-pdf-input]');
  var imageInput = root.querySelector('[data-image-input]');
  var editorStatus = root.querySelector('[data-editor-status]');
  var canvas = root.querySelector('[data-page-canvas]');
  var overlay = root.querySelector('[data-overlay]');
  var pageFrame = root.querySelector('[data-page-frame]');
  var canvasScroll = root.querySelector('[data-canvas-scroll]');
  var thumbnails = root.querySelector('[data-thumbnails]');
  var saveButton = root.querySelector('[data-save]');
  var downloadButton = root.querySelector('[data-download]');
  var zoomLabel = root.querySelector('[data-zoom-label]');
  var deleteButton = root.querySelector('[data-delete]');
  var properties = root.querySelector('[data-properties]');
  var textProperties = root.querySelector('[data-text-properties]');
  var drawingProperties = root.querySelector('[data-drawing-properties]');
  var shapeProperties = root.querySelector('[data-shape-properties]');
  var imageProperties = root.querySelector('[data-image-properties]');
  var propertyTitle = root.querySelector('[data-property-title]');
  var NS = 'http://www.w3.org/2000/svg';

  if (!window.PDFLib || !window.PDFLib.PDFDocument || !window.AdditivePdfEngine) {
    uploadStatus.textContent = 'The PDF editor could not be loaded. Refresh the page and try again.';
    uploadStatus.classList.add('is-error');
    return;
  }
  PDFJS.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs.worker.js';

  function setMessage(target, message, kind) {
    target.textContent = message || '';
    target.classList.toggle('is-error', kind === 'error');
    target.classList.toggle('is-success', kind === 'success');
  }

  function cleanupOutput() {
    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.hidden = true;
  }

  function updateButtons() {
    var loaded = Boolean(state.pdf && state.ready && !state.saving);
    saveButton.disabled = !loaded || (!state.dirty && Boolean(state.outputUrl));
    deleteButton.disabled = !state.selectedId || state.saving;
    root.querySelector('[data-undo]').disabled = state.history.length === 0 || state.saving;
    root.querySelector('[data-redo]').disabled = state.redo.length === 0 || state.saving;
    root.querySelector('[data-save]').setAttribute('aria-busy', String(state.saving));
  }

  function copyPages() {
    return JSON.parse(JSON.stringify(state.pages));
  }

  function remember(before) {
    state.history.push(before || copyPages());
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.redo = [];
    state.dirty = true;
    cleanupOutput();
    updateButtons();
    setMessage(editorStatus, 'Unsaved changes. Save Changes to generate the updated PDF.');
  }

  function changeMode(mode) {
    state.mode = mode;
    root.querySelectorAll('[data-tool]').forEach(function (button) {
      var active = button.getAttribute('data-tool') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (mode === 'draw') setMessage(editorStatus, 'Draw on the page with your pointer or touch screen. Each stroke can be selected and deleted.');
    else if (mode === 'shape') setMessage(editorStatus, 'Drag on the page to place the selected shape.');
    else if (mode === 'text') setMessage(editorStatus, 'Click the page to place a text box.');
    else setMessage(editorStatus, state.dirty ? 'Unsaved changes. Save Changes to generate the updated PDF.' : 'Select a tool, then click or drag on the page.');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function currentPage() {
    return state.pages[state.pageIndex];
  }

  function getObject(id) {
    var page = currentPage();
    return page && page.objects.find(function (object) { return object.id === id; });
  }

  function makeId() {
    return 'overlay-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function rgba(hex, opacity) {
    var value = String(hex || '#000000').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return 'transparent';
    return 'rgba(' + parseInt(value.slice(0, 2), 16) + ',' + parseInt(value.slice(2, 4), 16) + ',' +
      parseInt(value.slice(4, 6), 16) + ',' + clamp(Number(opacity), 0, 1) + ')';
  }

  function svgElement(name, attributes) {
    var element = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, attributes[key]); });
    return element;
  }

  function addResizeHandle(wrapper, object) {
    var handle = document.createElement('span');
    handle.className = 'additive-resize-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.dataset.resize = object.id;
    wrapper.appendChild(handle);
  }

  function setObjectBox(wrapper, object) {
    wrapper.style.left = (object.x * 100) + '%';
    wrapper.style.top = (object.y * 100) + '%';
    wrapper.style.width = (object.w * 100) + '%';
    wrapper.style.height = (object.h * 100) + '%';
  }

  function renderOverlay(skipProperties) {
    var page = currentPage();
    if (!page) return;
    overlay.replaceChildren();
    page.objects.forEach(function (object) {
      var wrapper = document.createElement('div');
      wrapper.className = 'additive-object additive-object-' + object.type +
        (object.id === state.selectedId ? ' is-selected' : '');
      wrapper.dataset.objectId = object.id;
      setObjectBox(wrapper, object);

      if (object.type === 'text') {
        var text = document.createElement('textarea');
        text.className = 'additive-text-object';
        text.value = object.text || '';
        text.setAttribute('aria-label', 'PDF text overlay');
        text.spellcheck = false;
        text.style.fontFamily = object.fontFamily === 'Times' ? '"Times New Roman", serif' :
          object.fontFamily === 'Courier' ? '"Courier New", monospace' : 'Arial, Helvetica, sans-serif';
        text.style.fontSize = (Number(object.fontSize) * 96 / 72 * state.scale) + 'px';
        text.style.fontWeight = object.bold ? '700' : '400';
        text.style.fontStyle = object.italic ? 'italic' : 'normal';
        text.style.textDecoration = object.underline ? 'underline' : 'none';
        text.style.textAlign = object.align || 'left';
        text.style.color = rgba(object.color, object.opacity);
        text.style.backgroundColor = rgba(object.backgroundColor || '#ffffff', object.backgroundOpacity);
        text.addEventListener('focus', function () { state.textEditBefore = copyPages(); });
        text.addEventListener('input', function () {
          object.text = text.value;
          state.dirty = true;
          cleanupOutput();
          updateButtons();
        });
        text.addEventListener('blur', function () {
          if (state.textEditBefore) {
            var before = state.textEditBefore;
            state.textEditBefore = null;
            var previous = before[state.pageIndex].objects.find(function (entry) { return entry.id === object.id; });
            if (previous && previous.text !== object.text) remember(before);
          }
        });
        wrapper.appendChild(text);
        var moveGrip = document.createElement('span');
        moveGrip.className = 'additive-text-move';
        moveGrip.textContent = 'Move';
        moveGrip.setAttribute('aria-hidden', 'true');
        wrapper.appendChild(moveGrip);
      } else if (object.type === 'image') {
        var image = document.createElement('img');
        image.className = 'additive-image-object';
        image.src = object.dataUrl;
        image.alt = 'Added image';
        image.draggable = false;
        wrapper.appendChild(image);
      } else {
        var svg = svgElement('svg', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', class: 'additive-vector-object' });
        var stroke = object.color || '#1769e0';
        var width = Math.max(1, Number(object.strokeWidth) || 3) * (96 / 72) * state.scale;
        var common = { fill: 'none', stroke: stroke, 'stroke-width': width, 'stroke-opacity': object.opacity === undefined ? 1 : object.opacity, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' };
        if (object.type === 'draw') {
          if (object.points && object.points.length) {
            var pathData = object.points.map(function (point, index) {
              return (index ? 'L ' : 'M ') + (point.x * 1000) + ' ' + (point.y * 1000);
            }).join(' ');
            svg.appendChild(svgElement('path', Object.assign({}, common, {
              d: pathData,
              'stroke-width': Math.max(14, width * 4),
              'pointer-events': 'stroke'
            })));
            svg.appendChild(svgElement('path', Object.assign({}, common, {
              d: pathData,
              'stroke-width': width
            })));
          }
        } else if (object.type === 'line' || object.type === 'arrow') {
          var x1 = object.reverseX ? 1000 : 0;
          var x2 = object.reverseX ? 0 : 1000;
          var y1 = object.reverseY ? 1000 : 0;
          var y2 = object.reverseY ? 0 : 1000;
          svg.appendChild(svgElement('line', Object.assign({}, common, { x1: x1, y1: y1, x2: x2, y2: y2, 'pointer-events': 'stroke' })));
          if (object.type === 'arrow') {
            var angle = Math.atan2(y2 - y1, x2 - x1);
            var arrowSize = 95;
            var leftX = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
            var leftY = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
            var rightX = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
            var rightY = y2 - arrowSize * Math.sin(angle + Math.PI / 6);
            svg.appendChild(svgElement('path', Object.assign({}, common, {
              d: 'M ' + leftX + ' ' + leftY + ' L ' + x2 + ' ' + y2 + ' L ' + rightX + ' ' + rightY
            })));
          }
        } else if (object.type === 'circle') {
          svg.appendChild(svgElement('ellipse', Object.assign({}, common, {
            cx: 500, cy: 500, rx: 470, ry: 470,
            fill: object.fillOpacity > 0 ? object.fillColor : 'none',
            'fill-opacity': object.fillOpacity || 0
          })));
        } else if (object.type === 'rectangle') {
          svg.appendChild(svgElement('rect', Object.assign({}, common, {
            x: 30, y: 30, width: 940, height: 940,
            fill: object.fillOpacity > 0 ? object.fillColor : 'none',
            'fill-opacity': object.fillOpacity || 0
          })));
        } else if (object.type === 'triangle') {
          svg.appendChild(svgElement('path', Object.assign({}, common, {
            d: 'M 500 30 L 970 970 L 30 970 Z',
            fill: object.fillOpacity > 0 ? object.fillColor : 'none',
            'fill-opacity': object.fillOpacity || 0
          })));
        }
        wrapper.appendChild(svg);
      }
      addResizeHandle(wrapper, object);
      overlay.appendChild(wrapper);
    });
    if (!skipProperties) updateProperties();
  }

  function updateProperties() {
    var object = state.selectedId ? getObject(state.selectedId) : null;
    properties.hidden = !object;
    deleteButton.disabled = !object || state.saving;
    if (!object) return;
    propertyTitle.textContent = object.type === 'draw' ? 'Pencil stroke' :
      object.type === 'text' ? 'Text properties' :
      object.type === 'image' ? 'Image' : object.type.charAt(0).toUpperCase() + object.type.slice(1) + ' properties';
    textProperties.hidden = object.type !== 'text';
    imageProperties.hidden = object.type !== 'image';
    drawingProperties.hidden = object.type !== 'draw';
    shapeProperties.hidden = !['line', 'arrow', 'circle', 'rectangle', 'triangle'].includes(object.type);
    shapeProperties.querySelectorAll('[data-shape-fill]').forEach(function (control) {
      control.hidden = object.type === 'line' || object.type === 'arrow';
    });
    properties.querySelectorAll('[data-prop]').forEach(function (control) {
      var key = control.getAttribute('data-prop');
      if (!(key in object)) return;
      if (control.type === 'checkbox') control.checked = Boolean(object[key]);
      else control.value = object[key];
    });
  }

  function makeThumbnail(index) {
    var button = document.createElement('button');
    button.className = 'additive-thumbnail' + (index === state.pageIndex ? ' is-active' : '');
    button.type = 'button';
    button.dataset.pageIndex = index;
    button.setAttribute('aria-label', 'Go to page ' + (index + 1));
    var canvasElement = document.createElement('canvas');
    canvasElement.className = 'additive-thumbnail-canvas';
    canvasElement.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.textContent = 'Page ' + (index + 1);
    button.append(canvasElement, label);
    button.addEventListener('click', function () { selectPage(index); });
    return { button: button, canvas: canvasElement };
  }

  async function renderThumbnails() {
    thumbnails.replaceChildren();
    root.querySelector('[data-page-count]').textContent = '(' + state.pages.length + ')';
    for (var index = 0; index < state.pages.length; index += 1) {
      var item = makeThumbnail(index);
      thumbnails.appendChild(item.button);
      try {
        var page = await state.pdf.getPage(index + 1);
        var base = page.getViewport({ scale: 1 });
        state.pages[index].width = base.width;
        state.pages[index].height = base.height;
        state.pages[index].transform = base.transform.slice();
        state.pages[index].rotation = page.rotate;
        var scale = Math.min(0.24, 144 / base.width, 178 / base.height);
        var viewport = page.getViewport({ scale: scale });
        item.canvas.width = Math.max(1, Math.floor(viewport.width));
        item.canvas.height = Math.max(1, Math.floor(viewport.height));
        var context = item.canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas rendering is unavailable.');
        await page.render({ canvasContext: context, viewport: viewport }).promise;
      } catch (error) {
        item.button.classList.add('has-render-error');
        var errorLabel = document.createElement('small');
        errorLabel.textContent = 'Preview unavailable';
        item.button.appendChild(errorLabel);
      }
    }
    var ready = await renderPage();
    state.ready = ready;
    updateButtons();
  }

  async function renderPage() {
    var pageInfo = currentPage();
    if (!pageInfo || !state.pdf) return false;
    if (state.renderTask) {
      try { state.renderTask.cancel(); } catch (error) { /* Render may already be complete. */ }
    }
    var pdfPage = await state.pdf.getPage(state.pageIndex + 1);
    var base = pdfPage.getViewport({ scale: 1 });
    pageInfo.width = base.width;
    pageInfo.height = base.height;
    pageInfo.transform = base.transform.slice();
    pageInfo.rotation = pdfPage.rotate;
    var viewport = pdfPage.getViewport({ scale: state.scale });
    var renderPixels = viewport.width * viewport.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16000000 / Math.max(1, renderPixels)));
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    overlay.style.width = viewport.width + 'px';
    overlay.style.height = viewport.height + 'px';
    pageFrame.style.width = viewport.width + 'px';
    pageFrame.style.height = viewport.height + 'px';
    var context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      setMessage(editorStatus, 'This browser cannot render the PDF page.', 'error');
      return;
    }
    state.renderTask = pdfPage.render({
      canvasContext: context,
      viewport: viewport,
      transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0]
    });
    try {
      await state.renderTask.promise;
    } catch (error) {
      if (error && error.name === 'RenderingCancelledException') return false;
      setMessage(editorStatus, 'This page could not be rendered. Try another page or reopen the PDF.', 'error');
      return false;
    }
    state.renderTask = null;
    zoomLabel.textContent = Math.round(state.scale * 100) + '%';
    root.querySelectorAll('.additive-thumbnail').forEach(function (thumbnail) {
      thumbnail.classList.toggle('is-active', Number(thumbnail.dataset.pageIndex) === state.pageIndex);
    });
    renderOverlay();
    return true;
  }

  function fitPage() {
    var page = currentPage();
    if (!page) return;
    var baseWidth = page.width;
    var baseHeight = page.height;
    var availableWidth = Math.max(240, canvasScroll.clientWidth - 56);
    var availableHeight = Math.max(280, canvasScroll.clientHeight - 56);
    state.scale = clamp(Math.min(availableWidth / baseWidth, availableHeight / baseHeight), 0.25, 2.5);
    renderPage();
  }

  function selectPage(index) {
    if (!state.pages[index] || index === state.pageIndex) return;
    state.pageIndex = index;
    state.selectedId = null;
    renderPage();
  }

  function updateDocumentUi() {
    uploadPanel.hidden = true;
    editor.hidden = false;
    root.querySelector('[data-document-name]').textContent = state.file.name;
    updateButtons();
  }

  async function openPdf(file) {
    if (!file) return;
    if (file.size <= 0) {
      setMessage(uploadStatus, 'This file is empty. Choose a valid PDF.', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage(uploadStatus, 'The PDF exceeds the 100 MB browser processing limit.', 'error');
      return;
    }
    var bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      setMessage(state.pdf ? editorStatus : uploadStatus, 'The selected PDF could not be read. Try selecting it again.', 'error');
      return;
    }
    if (bytes.length < 5 || String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 5))) !== '%PDF-') {
      setMessage(state.pdf ? editorStatus : uploadStatus, 'The selected file does not contain a valid PDF header.', 'error');
      return;
    }
    setMessage(state.pdf ? editorStatus : uploadStatus, 'Opening PDF and preparing page previews…');
    try {
      var task = PDFJS.getDocument({ data: bytes.slice() });
      var pdf = await task.promise;
      if (!pdf.numPages) throw new Error('The PDF does not contain any pages.');
      if (pdf.numPages > MAX_PAGES) {
        await pdf.destroy();
        throw new Error('This editor supports PDFs up to ' + MAX_PAGES + ' pages to protect browser memory.');
      }
      if (state.pdf) {
        try { await state.pdf.destroy(); } catch (error) { /* Previous document cleanup is best effort. */ }
      }
      cleanupOutput();
      state.file = file;
      state.bytes = bytes;
      state.pdf = pdf;
      state.ready = false;
      state.pages = Array.from({ length: pdf.numPages }, function () { return { objects: [] }; });
      state.pageIndex = 0;
      state.selectedId = null;
      state.dirty = false;
      state.history = [];
      state.redo = [];
      state.scale = 1;
      updateDocumentUi();
      setMessage(editorStatus, 'Document ready. Select a tool to add content.');
      await renderThumbnails();
      requestAnimationFrame(fitPage);
    } catch (error) {
      var message = error && error.name === 'PasswordException'
        ? 'This PDF is password-protected. Unlock it and select it again.'
        : error && error.message && /password/i.test(error.message)
          ? 'This PDF is password-protected and cannot be opened here.'
          : error && error.message && /supports PDFs/.test(error.message)
            ? error.message
            : 'This PDF is invalid, corrupted, or could not be opened. Try another PDF.';
      setMessage(state.pdf ? editorStatus : uploadStatus, message, 'error');
    }
  }

  function pagePoint(event) {
    var rect = overlay.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
      clientX: event.clientX,
      clientY: event.clientY,
      rect: rect
    };
  }

  function newObject(type, x, y, w, h) {
    return {
      id: makeId(),
      type: type,
      x: clamp(x, 0, Math.max(0, 1 - w)),
      y: clamp(y, 0, Math.max(0, 1 - h)),
      w: clamp(w, 0.025, 0.98),
      h: clamp(h, 0.025, 0.98),
      color: '#1769e0',
      opacity: 1,
      strokeWidth: 3
    };
  }

  function placeText(point) {
    var object = newObject('text', point.x, point.y, 0.34, 0.12);
    object.text = 'Type here';
    object.fontFamily = 'Helvetica';
    object.fontSize = 18;
    object.bold = false;
    object.italic = false;
    object.underline = false;
    object.align = 'left';
    object.color = '#172033';
    object.backgroundColor = '#ffffff';
    object.backgroundOpacity = 0;
    var before = copyPages();
    currentPage().objects.push(object);
    state.selectedId = object.id;
    changeMode('select');
    renderOverlay();
    remember(before);
    var text = overlay.querySelector('[data-object-id="' + object.id + '"] textarea');
    if (text) {
      text.focus();
      text.select();
    }
  }

  function placeImage(dataUrl, width, height) {
    var objectWidth = Math.min(0.38, Math.max(0.08, width / currentPage().width));
    var objectHeight = objectWidth * height / width * currentPage().width / currentPage().height;
    objectHeight = Math.min(0.5, Math.max(0.08, objectHeight));
    var object = newObject('image', 0.5 - objectWidth / 2, 0.5 - objectHeight / 2, objectWidth, objectHeight);
    object.dataUrl = dataUrl;
    object.aspect = width / height;
    object.opacity = 1;
    var before = copyPages();
    currentPage().objects.push(object);
    state.selectedId = object.id;
    changeMode('select');
    renderOverlay();
    remember(before);
  }

  function finishDragObject(object, wrapper, original, moved) {
    if (moved) {
      object.x = clamp(object.x, 0, 1 - object.w);
      object.y = clamp(object.y, 0, 1 - object.h);
      remember(original);
      renderOverlay();
    }
  }

  function startObjectDrag(event, wrapper, object, resize) {
    if (state.mode !== 'select' || event.button !== 0) return;
    var textArea = event.target.closest('textarea');
    if (textArea && !event.target.closest('.additive-text-move') && !resize) {
      state.selectedId = object.id;
      updateProperties();
      wrapper.classList.add('is-selected');
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    var before = copyPages();
    var rect = overlay.getBoundingClientRect();
    var startX = event.clientX;
    var startY = event.clientY;
    var start = { x: object.x, y: object.y, w: object.w, h: object.h };
    var moved = false;
    state.selectedId = object.id;
    updateProperties();
    wrapper.classList.add('is-selected');
    wrapper.setPointerCapture(event.pointerId);

    function move(moveEvent) {
      var dx = (moveEvent.clientX - startX) / rect.width;
      var dy = (moveEvent.clientY - startY) / rect.height;
      if (Math.abs(dx) + Math.abs(dy) > 0.002) moved = true;
      if (resize) {
        var nextWidth = clamp(start.w + dx, 0.025, 1 - start.x);
        var nextHeight = clamp(start.h + dy, 0.025, 1 - start.y);
        if (object.type === 'image') {
          var aspect = object.aspect || 1;
          var normalizedRatio = aspect * currentPage().height / currentPage().width;
          if (Math.abs(dx) >= Math.abs(dy)) nextHeight = nextWidth / normalizedRatio;
          else nextWidth = nextHeight * normalizedRatio;
          nextWidth = clamp(nextWidth, 0.025, 1 - start.x);
          nextHeight = clamp(nextHeight, 0.025, 1 - start.y);
        } else if (object.type === 'circle') {
          var circleRatio = currentPage().width / currentPage().height;
          if (Math.abs(dx) >= Math.abs(dy)) nextHeight = nextWidth * circleRatio;
          else nextWidth = nextHeight / circleRatio;
          nextWidth = clamp(nextWidth, 0.025, 1 - start.x);
          nextHeight = clamp(nextHeight, 0.025, 1 - start.y);
        }
        object.w = nextWidth;
        object.h = nextHeight;
        wrapper.style.width = (object.w * 100) + '%';
        wrapper.style.height = (object.h * 100) + '%';
      } else {
        object.x = clamp(start.x + dx, 0, 1 - object.w);
        object.y = clamp(start.y + dy, 0, 1 - object.h);
        wrapper.style.left = (object.x * 100) + '%';
        wrapper.style.top = (object.y * 100) + '%';
      }
    }
    function end() {
      wrapper.removeEventListener('pointermove', move);
      wrapper.removeEventListener('pointerup', end);
      wrapper.removeEventListener('pointercancel', end);
      finishDragObject(object, wrapper, before, moved);
    }
    wrapper.addEventListener('pointermove', move);
    wrapper.addEventListener('pointerup', end);
    wrapper.addEventListener('pointercancel', end);
  }

  function svgPreviewPath(points, color, width) {
    var preview = overlay.querySelector('.additive-interaction-preview');
    if (!preview) {
      preview = svgElement('svg', { class: 'additive-interaction-preview', 'aria-hidden': 'true' });
      overlay.appendChild(preview);
    }
    var rect = overlay.getBoundingClientRect();
    preview.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    preview.replaceChildren();
    var path = points.map(function (point, index) {
      return (index ? 'L ' : 'M ') + point.x + ' ' + point.y;
    }).join(' ');
    preview.appendChild(svgElement('path', { d: path, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function beginDrawing(event) {
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    var point = pagePoint(event);
    state.drawing = { before: copyPages(), points: [{ x: point.x, y: point.y }], screenPoints: [{ x: point.clientX - point.rect.left, y: point.clientY - point.rect.top }] };
    var object = selectedDrawing();
    svgPreviewPath(state.drawing.screenPoints, object ? object.color : '#1769e0', object ? object.strokeWidth * state.scale : 3);
    function move(moveEvent) {
      if (!state.drawing) return;
      var next = pagePoint(moveEvent);
      var last = state.drawing.points[state.drawing.points.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) < 0.002) return;
      state.drawing.points.push({ x: next.x, y: next.y });
      state.drawing.screenPoints.push({ x: next.clientX - next.rect.left, y: next.clientY - next.rect.top });
      var style = selectedDrawing();
      svgPreviewPath(state.drawing.screenPoints, style ? style.color : '#1769e0', style ? style.strokeWidth * state.scale : 3);
    }
    function end() {
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerup', end);
      overlay.removeEventListener('pointercancel', end);
      var drawing = state.drawing;
      state.drawing = null;
      var preview = overlay.querySelector('.additive-interaction-preview');
      if (preview) preview.remove();
      if (!drawing || drawing.points.length < 2) return;
      var xs = drawing.points.map(function (point) { return point.x; });
      var ys = drawing.points.map(function (point) { return point.y; });
      var x = Math.min.apply(null, xs);
      var y = Math.min.apply(null, ys);
      var w = Math.max(0.006, Math.max.apply(null, xs) - x);
      var h = Math.max(0.006, Math.max.apply(null, ys) - y);
      var style = selectedDrawing();
      var object = newObject('draw', x, y, w, h);
      object.points = drawing.points.map(function (point) { return { x: (point.x - x) / w, y: (point.y - y) / h }; });
      object.color = style ? style.color : '#1769e0';
      object.strokeWidth = style ? style.strokeWidth : 3;
      object.opacity = style ? style.opacity : 1;
      currentPage().objects.push(object);
      state.selectedId = object.id;
      renderOverlay();
      remember(drawing.before);
    }
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', end);
    overlay.addEventListener('pointercancel', end);
  }

  function selectedDrawing() {
    var selected = getObject(state.selectedId);
    if (selected && selected.type === 'draw') return selected;
    return {
      color: root.querySelector('[data-pencil-color]').value,
      strokeWidth: clamp(Number(root.querySelector('[data-pencil-width]').value) || 3, 1, 30),
      opacity: 1
    };
  }

  function beginShape(event) {
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    var start = pagePoint(event);
    var before = copyPages();
    var preview = svgElement('svg', { class: 'additive-interaction-preview', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    var previewShape = svgElement('path', { fill: 'none', stroke: '#1769e0', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' });
    preview.appendChild(previewShape);
    overlay.appendChild(preview);
    function update(ev) {
      var end = pagePoint(ev);
      var x1 = (start.x <= end.x ? 0 : 1000);
      var x2 = 1000 - x1;
      var y1 = (start.y <= end.y ? 0 : 1000);
      var y2 = 1000 - y1;
      var type = state.shapeType;
      var d = type === 'line' || type === 'arrow'
        ? 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2
        : type === 'circle'
          ? 'M 500 30 C 760 30 970 240 970 500 C 970 760 760 970 500 970 C 240 970 30 760 30 500 C 30 240 240 30 500 30 Z'
          : type === 'triangle' ? 'M 500 30 L 970 970 L 30 970 Z' : 'M 30 30 H 970 V 970 H 30 Z';
      previewShape.setAttribute('d', d);
    }
    update(event);
    function move(ev) { update(ev); }
    function end(ev) {
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerup', end);
      overlay.removeEventListener('pointercancel', end);
      var finish = pagePoint(ev);
      preview.remove();
      var tooSmall = ['line', 'arrow'].includes(state.shapeType)
        ? Math.hypot(finish.x - start.x, finish.y - start.y) < 0.02
        : Math.abs(finish.x - start.x) < 0.015 || Math.abs(finish.y - start.y) < 0.015;
      if (tooSmall) {
        setMessage(editorStatus, 'Drag a little farther to give the shape its size.');
        return;
      }
        var shapeWidth = Math.abs(finish.x - start.x);
        var shapeHeight = Math.abs(finish.y - start.y);
        if (state.shapeType === 'circle') {
          var circleRatio = currentPage().width / currentPage().height;
          var circleSize = Math.min(shapeWidth, shapeHeight / circleRatio);
          shapeWidth = circleSize;
          shapeHeight = circleSize * circleRatio;
        }
        var object = newObject(state.shapeType, Math.min(start.x, finish.x), Math.min(start.y, finish.y),
          shapeWidth, shapeHeight);
      object.reverseX = finish.x < start.x;
      object.reverseY = finish.y < start.y;
      object.fillColor = '#dbeafe';
      object.fillOpacity = ['circle', 'rectangle', 'triangle'].includes(object.type) ? 0.25 : 0;
      currentPage().objects.push(object);
      state.selectedId = object.id;
      changeMode('select');
      renderOverlay();
      remember(before);
    }
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', end);
    overlay.addEventListener('pointercancel', end);
  }

  function deleteSelected() {
    var object = getObject(state.selectedId);
    if (!object) return;
    var before = copyPages();
    currentPage().objects = currentPage().objects.filter(function (entry) { return entry.id !== state.selectedId; });
    state.selectedId = null;
    renderOverlay();
    remember(before);
  }

  function undo() {
    if (!state.history.length) return;
    state.redo.push(copyPages());
    state.pages = state.history.pop();
    state.selectedId = null;
    state.dirty = true;
    cleanupOutput();
    renderOverlay();
    updateButtons();
  }

  function redo() {
    if (!state.redo.length) return;
    state.history.push(copyPages());
    state.pages = state.redo.pop();
    state.selectedId = null;
    state.dirty = true;
    cleanupOutput();
    renderOverlay();
    updateButtons();
  }

  function updateProperty(object, control) {
    var key = control.getAttribute('data-prop');
    var value = control.type === 'checkbox' ? control.checked :
      control.type === 'number' || control.type === 'range' ? Number(control.value) : control.value;
    if (key === 'fontSize') value = clamp(value, 6, 144);
    if (key === 'strokeWidth') value = clamp(value, 1, 30);
    object[key] = value;
  }

  async function addImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage(editorStatus, 'Choose a PNG, JPEG, or WebP image smaller than 5 MB.', 'error');
      return;
    }
    try {
      var bitmap = await createImageBitmap(file);
      if (bitmap.width > 6000 || bitmap.height > 6000 || bitmap.width * bitmap.height > 20000000) {
        bitmap.close();
        throw new Error('Images must be no larger than 20 megapixels.');
      }
      var imageCanvas = document.createElement('canvas');
      imageCanvas.width = bitmap.width;
      imageCanvas.height = bitmap.height;
      var context = imageCanvas.getContext('2d');
      if (!context) throw new Error('This browser cannot process the selected image.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      var dataUrl = imageCanvas.toDataURL('image/png');
      if (dataUrl.length > 8 * 1024 * 1024) throw new Error('This image is too large after processing. Choose a smaller image.');
      placeImage(dataUrl, imageCanvas.width, imageCanvas.height);
      imageCanvas.width = 0;
      imageCanvas.height = 0;
      setMessage(editorStatus, 'Image added. Drag to move it or use its corner handle to resize.');
    } catch (error) {
      setMessage(editorStatus, error.message || 'This image could not be opened.', 'error');
    }
  }

  async function savePdf() {
    if (!state.pdf || !state.bytes || state.saving) return;
    state.saving = true;
    updateButtons();
    setMessage(editorStatus, 'Generating the edited PDF…');
    try {
      var output = await window.AdditivePdfEngine.applyChanges(state.bytes, state.pages, window.PDFLib);
      var check = await PDFJS.getDocument({ data: output.slice() }).promise;
      if (check.numPages !== state.pages.length) throw new Error('The generated PDF did not preserve the original page count.');
      await check.destroy();
      cleanupOutput();
      state.outputUrl = URL.createObjectURL(new Blob([output], { type: 'application/pdf' }));
      downloadButton.href = state.outputUrl;
      var stem = state.file.name.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100);
      downloadButton.download = 'edited-' + (stem || 'document') + '.pdf';
      downloadButton.hidden = false;
      state.dirty = false;
      setMessage(editorStatus, 'Changes saved. Your edited PDF is ready to download.', 'success');
    } catch (error) {
      setMessage(editorStatus, error && error.message && /page count|valid color|coordinate system|standard PDF font/.test(error.message)
        ? error.message
        : 'The edited PDF could not be generated. Your original document and edits are still available; try again.', 'error');
    } finally {
      state.saving = false;
      updateButtons();
    }
  }

  root.querySelector('[data-select-pdf]').addEventListener('click', function () { fileInput.click(); });
  root.querySelector('[data-replace-pdf]').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (file) openPdf(file);
    fileInput.value = '';
  });
  uploadPanel.addEventListener('dragover', function (event) {
    event.preventDefault();
    uploadPanel.classList.add('is-dragging');
  });
  uploadPanel.addEventListener('dragleave', function (event) {
    if (!uploadPanel.contains(event.relatedTarget)) uploadPanel.classList.remove('is-dragging');
  });
  uploadPanel.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadPanel.classList.remove('is-dragging');
    var file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) openPdf(file);
  });
  uploadPanel.addEventListener('click', function (event) {
    if (event.target !== fileInput && !event.target.closest('button')) fileInput.click();
  });
  uploadPanel.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  root.querySelector('[data-add-text]').addEventListener('click', function () {
    if (!state.pdf) return;
    changeMode('text');
  });
  root.querySelector('[data-add-image]').addEventListener('click', function () { if (state.pdf) imageInput.click(); });
  imageInput.addEventListener('change', function () {
    var file = imageInput.files && imageInput.files[0];
    if (file) addImage(file);
    imageInput.value = '';
  });
  root.querySelectorAll('[data-tool]').forEach(function (button) {
    button.addEventListener('click', function () { changeMode(button.getAttribute('data-tool')); });
  });
  root.querySelector('[data-shape-type]').addEventListener('change', function (event) {
    state.shapeType = event.target.value;
    changeMode('shape');
  });
  root.querySelector('[data-delete]').addEventListener('click', deleteSelected);
  root.querySelector('[data-undo]').addEventListener('click', undo);
  root.querySelector('[data-redo]').addEventListener('click', redo);
  root.querySelector('[data-save]').addEventListener('click', savePdf);
  root.querySelector('[data-zoom-in]').addEventListener('click', function () {
    state.scale = clamp(state.scale * 1.2, 0.25, 3);
    renderPage();
  });
  root.querySelector('[data-zoom-out]').addEventListener('click', function () {
    state.scale = clamp(state.scale / 1.2, 0.25, 3);
    renderPage();
  });
  root.querySelector('[data-fit]').addEventListener('click', fitPage);

  properties.addEventListener('pointerdown', function () { state.propertyBefore = copyPages(); });
  properties.addEventListener('focusin', function () {
    if (!state.propertyBefore) state.propertyBefore = copyPages();
  });
  properties.addEventListener('change', function (event) {
    var control = event.target.closest('[data-prop]');
    var object = state.selectedId && getObject(state.selectedId);
    if (!control || !object) return;
    var before = state.propertyBefore || copyPages();
    updateProperty(object, control);
    renderOverlay(true);
    remember(before);
    state.propertyBefore = null;
  });
  properties.addEventListener('input', function (event) {
    var control = event.target.closest('[data-prop]');
    var object = state.selectedId && getObject(state.selectedId);
    if (!control || !object || (control.type !== 'range' && control.type !== 'number')) return;
    updateProperty(object, control);
    state.dirty = true;
    cleanupOutput();
    renderOverlay(true);
    updateButtons();
  });

  overlay.addEventListener('pointerdown', function (event) {
    if (!state.pdf) return;
    if (state.mode === 'draw') return beginDrawing(event);
    if (state.mode === 'shape') return beginShape(event);
    if (state.mode === 'text') {
      if (event.target.closest('[data-object-id]')) {
        state.selectedId = event.target.closest('[data-object-id]').dataset.objectId;
        renderOverlay();
      } else placeText(pagePoint(event));
      return;
    }
    var wrapper = event.target.closest('[data-object-id]');
    if (wrapper) {
      var object = getObject(wrapper.dataset.objectId);
      if (!object) return;
      var resize = event.target.closest('[data-resize]');
      startObjectDrag(event, wrapper, object, Boolean(resize));
    } else {
      state.selectedId = null;
      renderOverlay();
      changeMode('select');
    }
  });

  root.addEventListener('keydown', function (event) {
    if ((event.key === 'Delete' || event.key === 'Backspace') &&
      !event.target.matches('textarea, input, select, [contenteditable="true"]') && state.selectedId) {
      event.preventDefault();
      deleteSelected();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    }
  });

  window.addEventListener('resize', function () {
    if (state.pdf) fitPage();
  });
  window.addEventListener('beforeunload', function () {
    cleanupOutput();
    if (state.pdf) state.pdf.destroy();
  });

  updateButtons();
})();
