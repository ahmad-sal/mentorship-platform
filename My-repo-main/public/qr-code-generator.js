(function () {
  'use strict';

  var root = document.querySelector('.qr-code-generator-page');
  if (!root) return;

  var MAX_SHARE_BYTES = 20 * 1024 * 1024;
  var MAX_LOGO_BYTES = 2 * 1024 * 1024;
  var MAX_TEXT_LENGTH = 2500;
  var qrInstance = null;
  var previewRevision = 0;
  var previewUrl = null;
  var logoDataUrl = '';
  var logoSource = '';
  var selectedType = '';
  var qrData = '';
  var qrName = '';
  var currentFile = null;
  var hostedFileUrl = '';
  var isUploading = false;
  var options = {
    template: 'professional',
    frame: 'none',
    frameColor: '#2563eb',
    labelColor: '#172033',
    bodyShape: 'square',
    bodyColor: '#111827',
    outerShape: 'square',
    outerColor: '#111827',
    innerShape: 'square',
    innerColor: '#111827',
    backgroundMode: 'solid',
    backgroundColor: '#ffffff',
    gradientStart: '#ffffff',
    gradientEnd: '#dbeafe',
    gradientDirection: 'vertical',
    logoSize: 16
  };

  var typeStep = root.querySelector('[data-type-step]');
  var inputStep = root.querySelector('[data-input-step]');
  var inputForm = root.querySelector('[data-input-form]');
  var inputStatus = root.querySelector('[data-form-status]');
  var customizeButton = root.querySelector('[data-action="customize"]');
  var categoryTitle = root.querySelector('[data-category-title]');
  var categoryDescription = root.querySelector('[data-category-description]');
  var categoryIcon = root.querySelector('[data-category-icon]');
  var formPanels = {
    url: root.querySelector('[data-form-url]'),
    text: root.querySelector('[data-form-text]'),
    whatsapp: root.querySelector('[data-form-whatsapp]'),
    file: root.querySelector('[data-form-file]')
  };
  var urlInput = root.querySelector('#qrWebsiteUrl');
  var textInput = root.querySelector('#qrText');
  var countrySearch = root.querySelector('#qrCountrySearch');
  var countryInput = root.querySelector('[data-country-code]');
  var phoneInput = root.querySelector('#qrPhone');
  var whatsappMessage = root.querySelector('#qrWhatsappMessage');
  var nameInput = root.querySelector('#qrCodeName');
  var fileInput = root.querySelector('[data-file-input]');
  var fileDrop = root.querySelector('[data-file-drop]');
  var filePrompt = root.querySelector('[data-file-prompt]');
  var fileAccept = root.querySelector('[data-file-accept]');
  var hostedUrlText = root.querySelector('[data-hosted-url]');
  var customizer = root.querySelector('[data-customizer]');
  var templateGrid = root.querySelector('[data-template-grid]');
  var frameGrid = root.querySelector('[data-frame-grid]');
  var bodyGrid = root.querySelector('[data-body-grid]');
  var outerGrid = root.querySelector('[data-outer-grid]');
  var innerGrid = root.querySelector('[data-inner-grid]');
  var logoGrid = root.querySelector('[data-logo-grid]');
  var previewFrame = root.querySelector('[data-preview-frame]');
  var previewOutput = root.querySelector('[data-preview-output]');
  var previewStatus = root.querySelector('[data-preview-status]');
  var downloadButton = root.querySelector('[data-action="download"]');
  var solidColors = root.querySelector('[data-solid-colors]');
  var solidCustom = root.querySelector('[data-solid-custom]');
  var gradientControls = root.querySelector('[data-gradient-controls]');
  var contrastWarning = root.querySelector('[data-contrast-warning]');
  var logoSizeControl = root.querySelector('[data-logo-size-control]');
  var logoSizeOutput = root.querySelector('[data-logo-size-value]');
  var removeLogoButton = root.querySelector('[data-action="remove-logo"]');

  var categories = {
    url: { title: 'URL / Link', description: 'Create a QR code that opens a website.', icon: '↗' },
    pdf: { title: 'PDF', description: 'Upload a PDF and create a QR code to its publicly hosted file.', icon: '▤', accept: '.pdf,application/pdf', label: 'PDF file', extensions: ['pdf'] },
    image: { title: 'Image', description: 'Upload an image and create a QR code that opens it.', icon: '▧', accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp', label: 'PNG, JPG/JPEG, or WebP image', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
    text: { title: 'Text', description: 'Encode plain text, contact information, or a short message.', icon: '≡' },
    audio: { title: 'Audio', description: 'Upload an audio file and create a QR code to its public URL.', icon: '♫', accept: '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4', label: 'MP3, WAV, or M4A audio', extensions: ['mp3', 'wav', 'm4a'] },
    whatsapp: { title: 'WhatsApp', description: 'Create a QR code that opens a chat with an optional pre-filled message.', icon: '◉' }
  };

  var templates = [
    { id: 'professional', name: 'Simple Professional', color: '#172033', body: 'square', outer: 'square', inner: 'square', frame: 'none', background: '#ffffff' },
    { id: 'business', name: 'Modern Business', color: '#155eef', body: 'rounded', outer: 'extra-rounded', inner: 'rounded', frame: 'rounded', background: '#ffffff' },
    { id: 'shopping', name: 'Shopping / Add to Cart', color: '#ad3d23', body: 'classy', outer: 'square', inner: 'dot', frame: 'banner', background: '#fff8f0', symbol: '🛍️' },
    { id: 'cafe', name: 'Coffee Shop / Cafe', color: '#63412d', body: 'dots', outer: 'dot', inner: 'dot', frame: 'badge', background: '#fbf3e9', symbol: '☕' },
    { id: 'mobile', name: 'Mobile Device / App', color: '#5b49ce', body: 'extra-rounded', outer: 'extra-rounded', inner: 'rounded', frame: 'rounded', background: '#f7f5ff', symbol: '▯' },
    { id: 'social', name: 'Social Media', color: '#c13584', body: 'rounded', outer: 'dot', inner: 'dot', frame: 'speech', background: '#fff4fa', symbol: '◎' },
    { id: 'flag', name: 'Flag-Inspired', color: '#075e3d', body: 'square', outer: 'square', inner: 'square', frame: 'border', background: '#ffffff', gradient: ['#ffffff', '#e2f3e9'], symbol: '✦' },
    { id: 'heart', name: 'Heart / Romantic', color: '#c2255c', body: 'classy-rounded', outer: 'extra-rounded', inner: 'dot', frame: 'label', background: '#fff5f8', symbol: '♥' },
    { id: 'eid', name: 'Eid Celebration', color: '#087568', body: 'dots', outer: 'extra-rounded', inner: 'dot', frame: 'badge', background: '#f1fbf7', symbol: '☾' },
    { id: 'birthday', name: 'Happy Birthday', color: '#6b48c8', body: 'classy', outer: 'rounded', inner: 'rounded', frame: 'banner', background: '#fff9e9', symbol: '✦' }
  ];
  var frames = [
    { id: 'none', name: 'No Frame', icon: '▦' },
    { id: 'border', name: 'Simple Border', icon: '□' },
    { id: 'rounded', name: 'Rounded Rectangle', icon: '▢' },
    { id: 'square', name: 'Square Border', icon: '▣' },
    { id: 'label', name: 'Label Below', icon: '▤' },
    { id: 'banner', name: 'Name Banner', icon: '▰' },
    { id: 'speech', name: 'Speech-Bubble Label', icon: '▱' },
    { id: 'badge', name: 'Rounded Badge Frame', icon: '⬭' }
  ];
  var bodyShapes = [
    { id: 'square', name: 'Square', type: 'square' },
    { id: 'dots', name: 'Small Dots', type: 'dots' },
    { id: 'classy', name: 'Classy Modules', type: 'classy' },
    { id: 'extra-rounded', name: 'Extra-Rounded Dots', type: 'extra-rounded' },
    { id: 'rounded', name: 'Rounded Modules', type: 'rounded' },
    { id: 'classy-rounded', name: 'Classy Rounded Modules', type: 'classy-rounded' }
  ];
  var outerShapes = [
    { id: 'square', name: 'Square', type: 'square' },
    { id: 'extra-rounded', name: 'Rounded Square', type: 'extra-rounded' },
    { id: 'dot', name: 'Circle', type: 'dot' },
    { id: 'rounded', name: 'Rounded', type: 'rounded' },
    { id: 'classy', name: 'Leaf Style', type: 'classy' }
  ];
  var innerShapes = [
    { id: 'square', name: 'Square', type: 'square' },
    { id: 'dot', name: 'Circle', type: 'dot' },
    { id: 'rounded', name: 'Rounded', type: 'rounded' },
    { id: 'extra-rounded', name: 'Soft Rounded', type: 'extra-rounded' }
  ];

  function setFormStatus(message, isError, persistError) {
    inputStatus.textContent = message;
    inputStatus.classList.toggle('is-error', Boolean(isError));
    if (isError && persistError) inputStatus.dataset.persistentError = 'true';
    else delete inputStatus.dataset.persistentError;
  }

  function getExtension(name) {
    var match = String(name || '').match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function sanitizeFilename(name) {
    var cleaned = String(name || '')
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return (cleaned || 'qr-code') + '.png';
  }

  function imageBlobFromSvg(svgBlob) {
    var svgUrl = URL.createObjectURL(svgBlob);
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(svgUrl);
        var canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        var context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) {
            reject(new Error('The QR code PNG could not be exported.'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      };
      image.onerror = function () {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('The customized QR code SVG could not be decoded.'));
      };
      image.src = svgUrl;
    });
  }

  function qrByteString(value) {
    return Array.from(new TextEncoder().encode(value), function (byte) {
      return String.fromCharCode(byte);
    }).join('');
  }

  function selectedFormIsValid() {
    if (!selectedType) return false;
    if (selectedType === 'url') return isValidUrl(urlInput.value);
    if (selectedType === 'text') return Boolean(textInput.value.trim()) && textInput.value.length <= MAX_TEXT_LENGTH;
    if (selectedType === 'whatsapp') return Boolean(getValidPhone());
    if (['pdf', 'image', 'audio'].includes(selectedType)) return Boolean(hostedFileUrl) && !isUploading;
    return false;
  }

  function isValidUrl(value) {
    try {
      var parsed = new URL(String(value || '').trim());
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function updateFormValidity() {
    if (!selectedType) {
      customizeButton.disabled = true;
      return;
    }
    var valid = selectedFormIsValid();
    customizeButton.disabled = !valid || isUploading;
    if (selectedType === 'url' && urlInput.value.trim() && !isValidUrl(urlInput.value)) {
      setFormStatus('Enter a complete URL beginning with https:// or http://.', true);
    } else if (selectedType === 'text' && textInput.value.length > MAX_TEXT_LENGTH) {
      setFormStatus('Text exceeds the 2,500 character limit. Shorten it to fit QR capacity.', true);
    } else if (selectedType === 'whatsapp' && phoneInput.value.trim() && !getValidPhone()) {
      setFormStatus('Enter a valid phone number for the selected country.', true);
    } else if (!isUploading && inputStatus.dataset.persistentError !== 'true') {
      setFormStatus('', false);
    }
    if (selectedType === 'text') {
      root.querySelector('[data-text-count]').textContent =
        textInput.value.length + ' / ' + MAX_TEXT_LENGTH + ' characters. Actual QR capacity depends on the content and error correction.';
    }
  }

  function getValidPhone() {
    if (!window.libphonenumber || !phoneInput.value.trim()) return null;
    try {
      var parsed = window.libphonenumber.parsePhoneNumberFromString(
        phoneInput.value.trim(),
        countryInput.value || 'PK'
      );
      return parsed && parsed.isValid() ? parsed.number : null;
    } catch (error) {
      return null;
    }
  }

  async function populateCountries() {
    var response = await fetch('/api/tools/qr-code-generator/countries', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('The country dialing-code list could not be loaded.');
    var countries = await response.json();
    var names = new Intl.DisplayNames(['en'], { type: 'region' });
    var sorted = countries.map(function (code) {
      return {
        code: code,
        name: names.of(code) || code,
        callingCode: window.libphonenumber.getCountryCallingCode(code)
      };
    }).sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });
    var datalist = root.querySelector('#qrCountryOptions');
    sorted.forEach(function (country) {
      var option = document.createElement('option');
      option.value = flagForCountry(country.code) + ' ' + country.name + ' (+' + country.callingCode + ')';
      option.dataset.country = country.code;
      datalist.appendChild(option);
    });
    var pakistan = sorted.find(function (country) { return country.code === 'PK'; });
    if (pakistan) {
      countrySearch.value = flagForCountry('PK') + ' ' + pakistan.name + ' (+' + pakistan.callingCode + ')';
      countryInput.value = 'PK';
    }
  }

  function flagForCountry(code) {
    return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (letter) {
      return 127397 + letter.charCodeAt(0);
    }));
  }

  function categoryFor(type) {
    return categories[type];
  }

  function openType(type) {
    if (!categories[type]) return;
    selectedType = type;
    currentFile = null;
    hostedFileUrl = '';
    isUploading = false;
    hostedUrlText.hidden = true;
    filePrompt.textContent = 'Select or drop a file here';
    fileInput.value = '';
    Object.keys(formPanels).forEach(function (key) {
      formPanels[key].hidden = key !== type && !(key === 'file' && ['pdf', 'image', 'audio'].includes(type));
    });
    if (['pdf', 'image', 'audio'].includes(type)) {
      formPanels.file.hidden = false;
      var category = categoryFor(type);
      fileInput.accept = category.accept;
      root.querySelector('[data-file-label]').innerHTML = category.label + ' <span aria-hidden="true">*</span>';
      fileAccept.textContent = category.label + ' · Up to 20 MB';
      root.querySelector('[data-file-icon]').textContent = category.icon;
    }
    var category = categoryFor(type);
    categoryTitle.textContent = category.title;
    categoryDescription.textContent = category.description;
    categoryIcon.textContent = category.icon;
    typeStep.hidden = true;
    inputStep.hidden = false;
    setFormStatus('', false);
    updateFormValidity();
    (type === 'url' ? urlInput : type === 'text' ? textInput : type === 'whatsapp' ? countrySearch : type === 'pdf' || type === 'image' || type === 'audio' ? fileInput : urlInput).focus();
  }

  function contentForSelectedType() {
    if (selectedType === 'url') {
      return { data: urlInput.value.trim() };
    }
    if (selectedType === 'text') return { data: textInput.value };
    if (selectedType === 'whatsapp') {
      var phone = getValidPhone();
      if (!phone) throw new Error('Enter a valid phone number for the selected country.');
      var whatsAppUrl = 'https://wa.me/' + phone.slice(1);
      var message = whatsappMessage.value;
      if (message) whatsAppUrl += '?text=' + encodeURIComponent(message);
      return { data: whatsAppUrl };
    }
    if (['pdf', 'image', 'audio'].includes(selectedType)) {
      if (!hostedFileUrl) throw new Error('Upload the file and verify its public URL before customizing the QR code.');
      return { data: hostedFileUrl };
    }
    throw new Error('Choose one of the available QR code types.');
  }

  function renderChoiceGrid(container, choices, type) {
    container.innerHTML = choices.map(function (choice) {
      var selected = type === 'template' ? options.template === choice.id :
        type === 'frame' ? options.frame === choice.id :
        type === 'body' ? options.bodyShape === choice.id :
        type === 'outer' ? options.outerShape === choice.id :
        options.innerShape === choice.id;
      var swatch = type === 'template'
        ? '<span class="qr-code-template-swatch" style="--template-color:' + choice.color + ';--template-bg:' + (choice.background || '#fff') + '"><i></i><i></i><i></i><i></i><b>' + (choice.symbol || '') + '</b></span>'
        : '<span class="qr-code-shape-sample qr-shape-' + choice.id + '" aria-hidden="true"></span>';
      var label = type === 'template' ? choice.name : type === 'frame' ? choice.name : choice.name;
      var group = type + ' choice';
      return '<button type="button" class="' +
        (type === 'template' ? 'qr-code-template-option' :
          type === 'frame' ? 'qr-code-frame-option' : 'qr-code-shape-option') +
        (selected ? ' is-selected' : '') + '" data-choice-group="' + group +
        '" data-choice="' + choice.id + '" aria-pressed="' + String(selected) +
        '" aria-label="' + label.replace(/"/g, '&quot;') + '">' +
        swatch + '<span>' + label + '</span></button>';
    }).join('');
  }

  function setChoice(group, id) {
    if (group === 'template') {
      var template = templates.find(function (item) { return item.id === id; });
      if (!template) return;
      options.template = template.id;
      options.bodyShape = template.body;
      options.outerShape = template.outer;
      options.innerShape = template.inner;
      options.bodyColor = template.color;
      options.outerColor = template.color;
      options.innerColor = template.color;
      options.frame = template.frame;
      options.backgroundMode = template.gradient ? 'gradient' : 'solid';
      options.backgroundColor = template.background || '#ffffff';
      options.gradientStart = template.gradient ? template.gradient[0] : template.background;
      options.gradientEnd = template.gradient ? template.gradient[1] : template.background;
      options.frameColor = template.color;
      options.labelColor = '#172033';
      setLogo('');
      updateControlsFromState();
      renderAllChoices();
      scheduleRender();
      return;
    }
    if (group === 'frame') options.frame = id;
    else if (group === 'body') options.bodyShape = id;
    else if (group === 'outer') options.outerShape = id;
    else if (group === 'inner') options.innerShape = id;
    options.template = '';
    renderAllChoices();
    scheduleRender();
  }

  function renderAllChoices() {
    renderChoiceGrid(templateGrid, templates, 'template');
    renderChoiceGrid(frameGrid, frames, 'frame');
    renderChoiceGrid(bodyGrid, bodyShapes, 'body');
    renderChoiceGrid(outerGrid, outerShapes, 'outer');
    renderChoiceGrid(innerGrid, innerShapes, 'inner');
  }

  function setLogo(logo) {
    logoSource = logo || '';
    logoDataUrl = logoSource.startsWith('data:') ? logoSource : '';
    logoGrid.querySelectorAll('[data-logo]').forEach(function (button) {
      button.classList.toggle('is-selected', button.dataset.logo === logoSource);
      button.setAttribute('aria-pressed', String(button.dataset.logo === logoSource));
    });
    removeLogoButton.disabled = !logoSource;
    logoSizeControl.hidden = !logoSource;
  }

  async function builtInLogoData(brand) {
    var response = await fetch('/vendor/qr-brand-logos/' + encodeURIComponent(brand) + '.svg', {
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error('The selected brand logo could not be loaded.');
    var svg = await response.text();
    var iconColors = {
      youtube: '#ff0033',
      whatsapp: '#25d366',
      facebook: '#1877f2',
      instagram: '#c13584',
      x: '#111111',
      google: '#4285f4'
    };
    var coloredSvg = svg.replace('<svg ', '<svg style="color:' + iconColors[brand] + '" ');
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(coloredSvg)));
  }

  async function createLogoTile(source) {
    var image = new Image();
    image.src = source;
    await new Promise(function (resolve, reject) {
      image.onload = resolve;
      image.onerror = function () { reject(new Error('The selected logo could not be opened.')); };
    });
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.roundRect(0, 0, 256, 256, 36);
    context.fill();
    var margin = 38;
    var scale = Math.min((256 - margin * 2) / image.naturalWidth, (256 - margin * 2) / image.naturalHeight);
    var width = image.naturalWidth * scale;
    var height = image.naturalHeight * scale;
    context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  }

  function frameColorAndLabel() {
    return {
      color: options.frameColor,
      labelColor: options.labelColor,
      label: qrName
    };
  }

  function toSvgNode(documentRef, name, attrs) {
    var node = documentRef.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach(function (key) {
      node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }

  function safeText(documentRef, value) {
    return documentRef.createTextNode(String(value || ''));
  }

  function appendFrameLabel(documentRef, svg) {
    var config = frameColorAndLabel();
    if (options.frame === 'label' && config.label) {
      var label = toSvgNode(documentRef, 'text', {
        x: 512, y: 886, 'text-anchor': 'middle', 'font-family': 'Arial,sans-serif',
        'font-size': 40, 'font-weight': 700, fill: config.labelColor
      });
      label.appendChild(safeText(documentRef, config.label));
      svg.appendChild(label);
    } else if (options.frame === 'banner' && config.label) {
      svg.appendChild(toSvgNode(documentRef, 'rect', {
        x: 154, y: 864, width: 716, height: 92, rx: 24, fill: config.color
      }));
      var banner = toSvgNode(documentRef, 'text', {
        x: 512, y: 922, 'text-anchor': 'middle', 'font-family': 'Arial,sans-serif',
        'font-size': 38, 'font-weight': 700, fill: '#ffffff'
      });
      banner.appendChild(safeText(documentRef, config.label));
      svg.appendChild(banner);
    } else if (options.frame === 'speech' && config.label) {
      svg.appendChild(toSvgNode(documentRef, 'path', {
        d: 'M190 856h644a28 28 0 0 1 28 28v54a28 28 0 0 1-28 28H530l-30 34-30-34H190a28 28 0 0 1-28-28v-54a28 28 0 0 1 28-28Z',
        fill: config.color
      }));
      var speech = toSvgNode(documentRef, 'text', {
        x: 512, y: 916, 'text-anchor': 'middle', 'font-family': 'Arial,sans-serif',
        'font-size': 36, 'font-weight': 700, fill: '#ffffff'
      });
      speech.appendChild(safeText(documentRef, config.label));
      svg.appendChild(speech);
    }
    if (options.frame === 'badge') {
      svg.appendChild(toSvgNode(documentRef, 'rect', {
        x: 66, y: 16, width: 892, height: 992, rx: 82,
        fill: 'none', stroke: config.color, 'stroke-width': 12
      }));
      if (config.label) {
        var badge = toSvgNode(documentRef, 'text', {
          x: 512, y: 936, 'text-anchor': 'middle', 'font-family': 'Arial,sans-serif',
          'font-size': 34, 'font-weight': 700, fill: config.labelColor
        });
        badge.appendChild(safeText(documentRef, config.label));
        svg.appendChild(badge);
      }
    }
  }

  function appendTemplateAccent(documentRef, svg) {
    var template = templates.find(function (item) { return item.id === options.template; });
    if (!template || !template.symbol) return;
    var accent = toSvgNode(documentRef, 'text', {
      x: 512, y: 48, 'text-anchor': 'middle', 'font-family': 'Arial,sans-serif',
      'font-size': 30, 'font-weight': 700, fill: template.color
    });
    accent.appendChild(safeText(documentRef, template.symbol));
    svg.appendChild(accent);
  }

  function createGradient(documentRef, svg) {
    if (options.backgroundMode !== 'gradient') return;
    var defs = toSvgNode(documentRef, 'defs', {});
    var horizontal = options.gradientDirection === 'horizontal';
    var diagonal = options.gradientDirection === 'diagonal';
    var gradient = toSvgNode(documentRef, 'linearGradient', {
      id: 'qr-background-gradient',
      x1: '0%', y1: '0%', x2: horizontal || diagonal ? '100%' : '0%',
      y2: horizontal ? '0%' : '100%'
    });
    gradient.appendChild(toSvgNode(documentRef, 'stop', { offset: '0%', 'stop-color': options.gradientStart }));
    gradient.appendChild(toSvgNode(documentRef, 'stop', { offset: '100%', 'stop-color': options.gradientEnd }));
    defs.appendChild(gradient);
    svg.appendChild(defs);
  }

  function contrastRatio(hexOne, hexTwo) {
    function luminance(hex) {
      var values = hex.replace('#', '').match(/.{2}/g).map(function (part) {
        var value = parseInt(part, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    }
    var first = luminance(hexOne);
    var second = luminance(hexTwo);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function updateContrastWarning() {
    var backgrounds = options.backgroundMode === 'gradient'
      ? [options.gradientStart, options.gradientEnd]
      : [options.backgroundMode === 'transparent' ? '#ffffff' : options.backgroundColor];
    var ratio = Math.min.apply(null, backgrounds.map(function (color) {
      return Math.min(
        contrastRatio(options.bodyColor, color),
        contrastRatio(options.outerColor, color),
        contrastRatio(options.innerColor, color)
      );
    }));
    var warning = ratio < 3;
    contrastWarning.hidden = !warning;
    contrastWarning.textContent = warning
      ? 'Low QR contrast (' + ratio.toFixed(1) + ':1). Choose a darker foreground and a lighter background to improve scanning.'
      : '';
  }

  function frameName() {
    var frame = frames.find(function (item) { return item.id === options.frame; });
    return frame ? frame.name : 'No Frame';
  }

  async function generatePreview() {
    if (!qrData || !window.QRCodeStyling) return;
    var revision = ++previewRevision;
    downloadButton.hidden = true;
    downloadButton.removeAttribute('href');
    previewStatus.textContent = 'Updating QR code preview…';
    previewStatus.classList.remove('is-error');
    updateContrastWarning();
    try {
      var image = '';
      if (logoSource) {
        image = logoSource.startsWith('data:')
          ? logoSource
          : await builtInLogoData(logoSource);
        image = await createLogoTile(image);
      }
      if (revision !== previewRevision) return;

      var background = options.backgroundMode === 'transparent' ? 'transparent' :
        options.backgroundMode === 'gradient' ? 'transparent' : options.backgroundColor;
      var gradient = options.backgroundMode === 'gradient'
        ? {
            type: 'linear',
            rotation: options.gradientDirection === 'horizontal' ? Math.PI / 2 :
              options.gradientDirection === 'diagonal' ? Math.PI / 4 : 0,
            colorStops: [
              { offset: 0, color: options.gradientStart },
              { offset: 1, color: options.gradientEnd }
            ]
          }
        : undefined;
      qrInstance = new window.QRCodeStyling({
        type: 'svg',
        width: 768,
        height: 768,
        margin: 28,
        data: qrByteString(qrData),
        image: image || undefined,
        qrOptions: {
          errorCorrectionLevel: image ? 'H' : 'Q'
        },
        imageOptions: {
          hideBackgroundDots: true,
          imageSize: Number(options.logoSize) / 100,
          margin: 6,
          crossOrigin: 'anonymous',
          saveAsBlob: true
        },
        dotsOptions: {
          type: options.bodyShape,
          color: options.bodyColor
        },
        cornersSquareOptions: {
          type: options.outerShape,
          color: options.outerColor
        },
        cornersDotOptions: {
          type: options.innerShape,
          color: options.innerColor
        },
        backgroundOptions: {
          color: background,
          gradient: gradient
        }
      });
      var qrBlob = await qrInstance.getRawData('svg');
      if (!(qrBlob instanceof Blob) || qrBlob.type !== 'image/svg+xml') {
        throw new Error('The QR renderer did not create a valid SVG.');
      }
      var qrText = await qrBlob.text();
      var parser = new DOMParser();
      var parsed = parser.parseFromString(qrText, 'image/svg+xml');
      var qrRoot = parsed.documentElement;
      if (parsed.querySelector('parsererror') || qrRoot.localName !== 'svg') {
        throw new Error('The QR renderer returned an invalid image.');
      }
      var documentRef = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg');
      var svg = documentRef.documentElement;
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('width', '1024');
      svg.setAttribute('height', '1024');
      svg.setAttribute('viewBox', '0 0 1024 1024');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Customized QR code');
      createGradient(documentRef, svg);
      if (options.backgroundMode === 'solid') {
        svg.appendChild(toSvgNode(documentRef, 'rect', {
          width: 1024, height: 1024, fill: options.backgroundColor
        }));
      } else if (options.backgroundMode === 'gradient') {
        svg.appendChild(toSvgNode(documentRef, 'rect', {
          width: 1024, height: 1024, fill: 'url(#qr-background-gradient)'
        }));
      }
      var frame = options.frame;
      var framePaint = options.frameColor;
      if (frame === 'border' || frame === 'square' || frame === 'rounded') {
        svg.appendChild(toSvgNode(documentRef, 'rect', {
          x: 74, y: 18, width: 876, height: 876,
          rx: frame === 'rounded' ? 44 : 0,
          fill: 'none', stroke: framePaint, 'stroke-width': frame === 'border' ? 5 : 10
        }));
      }
      var qrGroup = toSvgNode(documentRef, 'g', { transform: 'translate(128 72)' });
      Array.from(qrRoot.childNodes).forEach(function (node) {
        qrGroup.appendChild(documentRef.importNode(node, true));
      });
      svg.appendChild(qrGroup);
      appendTemplateAccent(documentRef, svg);
      appendFrameLabel(documentRef, svg);
      var finalSvg = new XMLSerializer().serializeToString(svg);
      var svgBlob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
      var outputBlob = await imageBlobFromSvg(svgBlob);
      if (revision !== previewRevision || outputBlob.type !== 'image/png') return;
      var objectUrl = URL.createObjectURL(outputBlob);
      var previewImage = document.createElement('img');
      previewImage.className = 'qr-code-output-image';
      previewImage.alt = 'Live preview of the customized QR code';
      previewImage.onload = function () {
        if (revision !== previewRevision) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        revokePreviewUrl();
        previewUrl = objectUrl;
        previewOutput.replaceChildren(previewImage);
        previewFrame.dataset.frame = options.frame;
        previewFrame.dataset.background = options.backgroundMode;
        downloadButton.href = previewUrl;
        downloadButton.download = sanitizeFilename(qrName);
        downloadButton.hidden = false;
        previewStatus.textContent = 'Preview ready · 1024 × 1024 PNG · ' + frameName();
        previewStatus.classList.remove('is-error');
      };
      previewImage.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        if (revision !== previewRevision) return;
        previewStatus.textContent = 'The customized QR code preview could not be rendered.';
        previewStatus.classList.add('is-error');
        downloadButton.hidden = true;
      };
      previewImage.src = objectUrl;
    } catch (error) {
      if (revision !== previewRevision) return;
      throwPreviewError(error);
    }
  }

  function throwPreviewError(error) {
    previewStatus.textContent = error && error.message
      ? error.message
      : 'The QR code could not be rendered with these settings.';
    previewStatus.classList.add('is-error');
    downloadButton.hidden = true;
    downloadButton.removeAttribute('href');
  }

  function revokePreviewUrl() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  var renderTimer = null;
  function scheduleRender() {
    if (!qrData) return;
    previewRevision += 1;
    clearTimeout(renderTimer);
    downloadButton.hidden = true;
    downloadButton.removeAttribute('href');
    previewStatus.textContent = 'Updating QR code preview…';
    previewStatus.classList.remove('is-error');
    renderTimer = setTimeout(generatePreview, 90);
  }

  function updateControlsFromState() {
    root.querySelectorAll('[data-option]').forEach(function (control) {
      var key = control.dataset.option;
      if (Object.prototype.hasOwnProperty.call(options, key)) control.value = String(options[key]);
    });
    root.querySelector('[data-option="backgroundMode"]').value = options.backgroundMode;
    solidColors.hidden = options.backgroundMode !== 'solid';
    solidCustom.hidden = options.backgroundMode !== 'solid';
    gradientControls.hidden = options.backgroundMode !== 'gradient';
    logoSizeOutput.textContent = options.logoSize + '%';
    logoSizeControl.hidden = !logoSource;
    removeLogoButton.disabled = !logoSource;
  }

  function beginCustomizer(content) {
    qrData = content.data;
    qrName = nameInput.value.trim();
    if (qrData.length > 2900) throw new Error('This content is too long for a reliable QR code. Use a shorter URL or text.');
    var category = categoryFor(selectedType);
    root.querySelector('[data-data-summary]').textContent = category.title + ' · ' +
      (qrName || 'Unnamed QR code');
    inputStep.hidden = true;
    customizer.hidden = false;
    options.template = 'professional';
    options.frame = 'none';
    options.bodyShape = 'square';
    options.bodyColor = '#111827';
    options.outerShape = 'square';
    options.outerColor = '#111827';
    options.innerShape = 'square';
    options.innerColor = '#111827';
    options.backgroundMode = 'solid';
    options.backgroundColor = '#ffffff';
    options.frameColor = '#2563eb';
    options.labelColor = '#172033';
    options.logoSize = 16;
    setLogo('');
    renderAllChoices();
    updateControlsFromState();
    scheduleRender();
    customizer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function uploadShareFile(file) {
    if (!file || !selectedType) return;
    var category = categoryFor(selectedType);
    var extension = getExtension(file.name);
    if (!category.extensions.includes(extension)) {
      hostedFileUrl = '';
      currentFile = null;
      setFormStatus('Choose a supported ' + category.label + ' file.', true, true);
      updateFormValidity();
      return;
    }
    if (!file.size || file.size > MAX_SHARE_BYTES) {
      hostedFileUrl = '';
      currentFile = null;
      setFormStatus(file.size ? 'Files must be 20 MB or smaller.' : 'The selected file is empty.', true, true);
      updateFormValidity();
      return;
    }
    currentFile = file;
    hostedFileUrl = '';
    isUploading = true;
    customizeButton.disabled = true;
    hostedUrlText.hidden = true;
    filePrompt.textContent = 'Uploading ' + file.name + '…';
    setFormStatus('Validating and publishing this file so its QR URL can be opened publicly.', false);
    var form = new FormData();
    form.append('file', file, file.name);
    form.append('category', selectedType);
    try {
      var response = await fetch('/api/tools/qr-code-generator/share-file', {
        method: 'POST',
        body: form,
        credentials: 'same-origin'
      });
      var result;
      try {
        result = await response.json();
      } catch (error) {
        result = null;
      }
      if (!response.ok) throw new Error(result && result.error ? result.error : 'The file could not be hosted for QR access.');
      var url = new URL(result && result.url);
      if (url.protocol !== 'https:' || !url.hostname) throw new Error('The hosted file URL could not be verified.');
      if (currentFile !== file) return;
      hostedFileUrl = url.href;
      filePrompt.textContent = file.name + ' · ' + formatBytes(file.size);
      hostedUrlText.textContent = 'Public file URL verified: ' + hostedFileUrl;
      hostedUrlText.hidden = false;
      setFormStatus('File hosted and public URL verified. Anyone with the link can access this file.', false);
    } catch (error) {
      if (currentFile !== file) return;
      hostedFileUrl = '';
      filePrompt.textContent = 'Select or drop a file here';
      setFormStatus(error && error.message ? error.message : 'The file could not be hosted. No QR code was created.', true, true);
    } finally {
      if (currentFile === file) {
        isUploading = false;
        updateFormValidity();
      }
    }
  }

  function formatBytes(bytes) {
    return bytes < 1024 * 1024
      ? (bytes / 1024).toFixed(1) + ' KB'
      : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function loadCustomLogo(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || !file.size || file.size > MAX_LOGO_BYTES) {
      setFormStatus('Choose a valid PNG, JPG, or WebP logo up to 2 MB.', true);
      return;
    }
    var bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (error) {
      setFormStatus('The selected logo image could not be opened.', true);
      return;
    }
    if (bitmap.width > 2400 || bitmap.height > 2400) {
      bitmap.close();
      setFormStatus('Logo dimensions must be 2,400 pixels or smaller on each side.', true);
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    setLogo(canvas.toDataURL('image/png'));
    logoGrid.querySelectorAll('[data-logo]').forEach(function (button) {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    removeLogoButton.disabled = false;
    logoSizeControl.hidden = false;
    scheduleRender();
  }

  function handleTypeCardClick(event) {
    var card = event.target.closest('[data-type]');
    if (card && categories[card.dataset.type]) openType(card.dataset.type);
  }

  root.querySelector('[data-type-step]').addEventListener('click', handleTypeCardClick);
  root.querySelector('[data-action="back"]').addEventListener('click', function () {
    inputStep.hidden = true;
    typeStep.hidden = false;
    selectedType = '';
    setFormStatus('', false);
  });
  root.querySelector('[data-action="edit-input"]').addEventListener('click', function () {
    customizer.hidden = true;
    inputStep.hidden = false;
  });
  inputForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (isUploading) return;
    try {
      if (!selectedFormIsValid()) {
        updateFormValidity();
        throw new Error('Complete the required fields before customizing the QR code.');
      }
      beginCustomizer(contentForSelectedType());
    } catch (error) {
      setFormStatus(error.message || 'The QR code input is invalid.', true);
    }
  });
  [urlInput, textInput, phoneInput, whatsappMessage, nameInput].forEach(function (control) {
    control.addEventListener('input', updateFormValidity);
  });
  countrySearch.addEventListener('input', function () {
    var option = Array.from(root.querySelectorAll('#qrCountryOptions option')).find(function (item) {
      return item.value === countrySearch.value;
    });
    if (option) {
      countryInput.value = option.dataset.country;
      root.querySelector('[data-phone-hint]').textContent =
        'International calling code +' + window.libphonenumber.getCountryCallingCode(option.dataset.country) +
        ' selected. Enter the number as used in this country.';
      updateFormValidity();
    } else if (countrySearch.value.trim()) {
      countryInput.value = '';
      setFormStatus('Choose a country from the searchable country list.', true);
      updateFormValidity();
    }
  });
  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) uploadShareFile(file);
  });
  fileDrop.addEventListener('click', function (event) {
    if (!event.target.closest('input')) fileInput.click();
  });
  fileDrop.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach(function (eventName) {
    fileDrop.addEventListener(eventName, function (event) {
      event.preventDefault();
      fileDrop.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (eventName) {
    fileDrop.addEventListener(eventName, function (event) {
      event.preventDefault();
      fileDrop.classList.remove('is-dragging');
    });
  });
  fileDrop.addEventListener('drop', function (event) {
    if (event.dataTransfer && event.dataTransfer.files.length) uploadShareFile(event.dataTransfer.files[0]);
  });

  [templateGrid, frameGrid, bodyGrid, outerGrid, innerGrid].forEach(function (container) {
    container.addEventListener('click', function (event) {
      var button = event.target.closest('[data-choice]');
      if (button) setChoice(button.dataset.choiceGroup.split(' ')[0], button.dataset.choice);
    });
  });
  root.querySelectorAll('[data-option]').forEach(function (control) {
    control.addEventListener('input', function () {
      options[control.dataset.option] = control.type === 'range' ? Number(control.value) : control.value;
      if (['bodyColor', 'outerColor', 'innerColor'].includes(control.dataset.option)) options.template = '';
      if (control.dataset.option === 'logoSize') logoSizeOutput.textContent = control.value + '%';
      if (control.dataset.option === 'backgroundMode') updateControlsFromState();
      renderAllChoices();
      scheduleRender();
    });
    control.addEventListener('change', function () {
      options[control.dataset.option] = control.type === 'range' ? Number(control.value) : control.value;
      if (control.dataset.option === 'backgroundMode') updateControlsFromState();
      renderAllChoices();
      scheduleRender();
    });
  });
  solidColors.addEventListener('click', function (event) {
    var button = event.target.closest('[data-bg-preset]');
    if (!button) return;
    options.backgroundColor = button.dataset.bgPreset;
    root.querySelector('[data-option="backgroundColor"]').value = options.backgroundColor;
    scheduleRender();
  });
  logoGrid.addEventListener('click', function (event) {
    var button = event.target.closest('[data-logo]');
    if (!button) return;
    setLogo(button.dataset.logo);
    scheduleRender();
  });
  root.querySelector('#qrLogoInput').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) loadCustomLogo(file);
  });
  removeLogoButton.addEventListener('click', function () {
    setLogo('');
    logoGrid.querySelectorAll('[data-logo]').forEach(function (button) {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    scheduleRender();
  });

  window.addEventListener('pagehide', function () {
    revokePreviewUrl();
  });
  renderAllChoices();
  updateControlsFromState();
  populateCountries().catch(function (error) {
    setFormStatus(error.message || 'Country dialing codes could not be loaded.', true, true);
  });
})();
