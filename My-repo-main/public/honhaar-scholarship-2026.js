(function () {
  'use strict';

  var form = document.querySelector('[data-honhaar-form]');
  if (!form || !window.HonhaarPolicy) return;

  var semester = form.elements.semester;
  var institution = form.elements.institution;
  var stream = form.elements.stream;
  var resultSystem = form.elements.resultSystem;
  var firstYearFields = document.querySelector('[data-first-year-fields]');
  var continuingFields = document.querySelector('[data-continuing-fields]');
  var institutionField = document.querySelector('[data-institution-field]');
  var streamField = document.querySelector('[data-stream-field]');
  var resultSystemField = document.querySelector('[data-result-system-field]');
  var cgpaFields = document.querySelector('[data-cgpa-fields]');
  var annualFields = document.querySelector('[data-annual-fields]');
  var continuingNotice = document.querySelector('[data-continuing-notice]');
  var medicalNotice = document.querySelector('[data-medical-notice]');
  var result = document.querySelector('[data-honhaar-result]');
  var errorSummary = document.querySelector('[data-error-summary]');
  var calculateButton = document.querySelector('[data-calculate-button]');
  var formControls = Array.from(form.querySelectorAll('input, select'));

  function setSection(section, visible) {
    section.hidden = !visible;
    section.querySelectorAll('input, select').forEach(function (control) {
      control.disabled = !visible;
    });
  }

  function clearErrors() {
    form.querySelectorAll('[data-error-for]').forEach(function (message) {
      message.textContent = '';
    });
    formControls.forEach(function (control) {
      control.removeAttribute('aria-invalid');
    });
    errorSummary.hidden = true;
    errorSummary.textContent = '';
  }

  function clearFieldError(control) {
    var error = form.querySelector('[data-error-for="' + control.name + '"]');
    if (error) error.textContent = '';
    control.removeAttribute('aria-invalid');
  }

  function setFieldError(control, message) {
    var error = form.querySelector('[data-error-for="' + control.name + '"]');
    if (error) error.textContent = message;
    control.setAttribute('aria-invalid', 'true');
  }

  function updateControls() {
    var isFirstYear = semester.value === 'firstYear';
    var isContinuing = semester.value === 'continuing';
    var isMedical = institution.value === 'medical';
    var previousStream = stream.value;
    setSection(firstYearFields, isFirstYear);
    setSection(continuingFields, isContinuing);
    setSection(institutionField, Boolean(semester.value));
    setSection(streamField, Boolean(semester.value));
    setSection(resultSystemField, isContinuing);
    continuingNotice.hidden = isFirstYear || !semester.value;

    var streamOptions = isMedical
      ? [{ value: 'sciences', label: 'Sciences' }]
      : [
          { value: '', label: 'Select your stream' },
          { value: 'sciences', label: 'Sciences' },
          { value: 'arts', label: 'Arts & Social Sciences' }
        ];
    stream.innerHTML = streamOptions.map(function (option) {
      return '<option value="' + option.value + '">' + option.label + '</option>';
    }).join('');
    stream.value = isMedical ? 'sciences' : previousStream;

    var isMedicalContinuing = isContinuing && isMedical;
    if (isMedicalContinuing) resultSystem.value = 'annual';
    resultSystem.querySelector('option[value="cgpa"]').disabled = isMedicalContinuing;
    setSection(cgpaFields, isContinuing && resultSystem.value === 'cgpa' && !isMedical);
    setSection(annualFields, isContinuing && (resultSystem.value === 'annual' || isMedicalContinuing));
    medicalNotice.hidden = !isMedical;
    calculateButton.textContent = isContinuing ? 'Calculate my percentage' : 'Calculate my aggregate';
    result.hidden = true;
    clearErrors();
  }

  function numberValue(name) {
    var control = form.elements[name];
    var value = control.value.trim() === '' ? NaN : Number(control.value);
    if (!Number.isFinite(value)) {
      setFieldError(control, 'Enter a valid number.');
      return null;
    }
    if (value < 0) {
      setFieldError(control, 'Enter zero or a positive number.');
      return null;
    }
    return value;
  }

  function validateMarks(obtainedName, totalName) {
    var obtained = numberValue(obtainedName);
    var total = numberValue(totalName);
    var obtainedControl = form.elements[obtainedName];
    var totalControl = form.elements[totalName];
    if (total !== null && total <= 0) {
      setFieldError(totalControl, 'Total marks must be greater than zero.');
      total = null;
    }
    if (obtained !== null && total !== null && obtained > total) {
      setFieldError(obtainedControl, 'Obtained marks cannot exceed total marks.');
      obtained = null;
    }
    return obtained !== null && total !== null ? { obtained: obtained, total: total } : null;
  }

  function format(value) {
    return value.toFixed(3) + '%';
  }

  function showResult(data, firstYear) {
    var status;
    if (firstYear) {
      status = data.threshold === null
        ? 'No academic threshold is defined for this institution and stream combination.'
        : (data.passed ? 'The academic threshold is met.' : 'The academic threshold is not met.');
      result.innerHTML = '<h2>Academic estimate</h2>' +
        '<dl class="honhaar-result-values">' +
        '<div><dt>Calculated aggregate</dt><dd>' + format(data.aggregate) + '</dd></div>' +
        '<div><dt>Intermediate percentage checked</dt><dd>' + format(data.intermediatePercentage) + '</dd></div>' +
        '<div><dt>Minimum threshold</dt><dd>' + (data.threshold === null ? 'Not applicable' : format(data.threshold)) + '</dd></div>' +
        '</dl><p class="honhaar-result-status">' + status + '</p>';
    } else {
      status = !data.eligibleInstitution
        ? 'Federal/private universities are not eligible for continuing students.'
        : (data.passed ? 'The academic threshold is met.' : 'The academic threshold is not met.');
      result.innerHTML = '<h2>Academic estimate</h2>' +
        '<dl class="honhaar-result-values">' +
        '<div><dt>Calculated percentage</dt><dd>' + format(data.percentage) + '</dd></div>' +
        '<div><dt>Measure checked</dt><dd>' + data.measure + '</dd></div>' +
        '<div><dt>Minimum threshold</dt><dd>' + (data.threshold === null ? 'Not applicable' : format(data.threshold)) + '</dd></div>' +
        '</dl><p class="honhaar-result-status">' + status + '</p>';
    }
    result.insertAdjacentHTML('beforeend', '<p class="honhaar-result-note">This is an academic estimate only. Final eligibility is subject to the official programme criteria.</p>');
    result.hidden = false;
  }

  form.addEventListener('change', function (event) {
    if (event.target === semester || event.target === institution || event.target === resultSystem) {
      updateControls();
    } else {
      clearFieldError(event.target);
    }
  });

  form.addEventListener('input', function (event) {
    clearFieldError(event.target);
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();
    result.hidden = true;
    var errors = [];
    var isFirstYear = semester.value === 'firstYear';
    if (!semester.value) {
      setFieldError(semester, 'Choose your current semester or year.');
      errors.push('Choose your current semester or year.');
    }
    if (semester.value && !institution.value) {
      setFieldError(institution, 'Select your institution type.');
      errors.push('Select your institution type.');
    }
    if (semester.value && !stream.value) {
      setFieldError(stream, 'Select your study stream.');
      errors.push('Select your study stream.');
    }

    var data;
    if (isFirstYear && institution.value && stream.value) {
      var matric = validateMarks('matricObtained', 'matricTotal');
      var intermediate = validateMarks('intermediateObtained', 'intermediateTotal');
      if (matric && intermediate) {
        data = window.HonhaarPolicy.calculateFirstYear({
          matricObtained: matric.obtained,
          matricTotal: matric.total,
          intermediateObtained: intermediate.obtained,
          intermediateTotal: intermediate.total,
          institution: institution.value,
          stream: stream.value
        });
      }
    } else if (semester.value === 'continuing' && resultSystem.value === 'cgpa' && institution.value && stream.value) {
      var cgpa = numberValue('cgpa');
      var scale = Number(form.elements.cgpaScale.value);
      if (cgpa !== null && cgpa > scale) {
        setFieldError(form.elements.cgpa, 'CGPA cannot exceed the selected scale.');
        cgpa = null;
      }
      if (cgpa !== null) {
        data = window.HonhaarPolicy.calculateContinuing({
          institution: institution.value,
          stream: stream.value,
          resultSystem: 'cgpa',
          cgpa: cgpa,
          scale: scale
        });
      }
    } else if (semester.value === 'continuing' && resultSystem.value === 'annual' && institution.value && stream.value) {
      var annual = validateMarks('annualObtained', 'annualTotal');
      if (annual) {
        data = window.HonhaarPolicy.calculateContinuing({
          institution: institution.value,
          stream: stream.value,
          resultSystem: 'annual',
          obtained: annual.obtained,
          total: annual.total
        });
      }
    } else if (semester.value === 'continuing' && !resultSystem.value) {
      setFieldError(resultSystem, 'Select your result system.');
      errors.push('Select your result system.');
    }

    var invalidFields = form.querySelectorAll('[aria-invalid="true"]');
    if (invalidFields.length) errors.push('Correct the marked fields and calculate again.');
    if (errors.length) {
      errorSummary.textContent = errors.join(' ');
      errorSummary.hidden = false;
      errorSummary.focus();
      return;
    }
    if (data) {
      showResult(data, isFirstYear);
      result.focus();
    }
  });

  form.addEventListener('reset', function () {
    window.setTimeout(function () {
      updateControls();
      result.hidden = true;
      clearErrors();
    }, 0);
  });

  updateControls();
})();