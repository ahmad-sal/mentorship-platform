(function (root) {
  'use strict';

  var thresholds = {
    firstYear: {
      public: { sciences: 70, arts: 65 },
      medical: { sciences: 80 },
      federalPrivate: { sciences: 70, arts: 65 },
      hed: { sciences: 65, arts: 60 }
    },
    continuing: {
      public: { sciences: 70, arts: 65 },
      medical: { sciences: 60 },
      hed: { sciences: 70, arts: 65 }
    }
  };

  function getThreshold(stage, institution, stream) {
    var stageThresholds = thresholds[stage];
    var institutionThresholds = stageThresholds && stageThresholds[institution];
    return institutionThresholds && Object.prototype.hasOwnProperty.call(institutionThresholds, stream)
      ? institutionThresholds[stream]
      : null;
  }

  function calculateFirstYear(input) {
    var matricPercentage = input.matricObtained / input.matricTotal * 100;
    var intermediatePercentage = input.intermediateObtained / input.intermediateTotal * 100;
    var aggregate = matricPercentage * 0.30 + intermediatePercentage * 0.70;
    var threshold = getThreshold('firstYear', input.institution, input.stream);

    return {
      aggregate: aggregate,
      percentage: intermediatePercentage,
      intermediatePercentage: intermediatePercentage,
      threshold: threshold,
      passed: threshold !== null && intermediatePercentage >= threshold,
      measure: 'Intermediate / HSSC percentage'
    };
  }

  function calculateContinuing(input) {
    var percentage;
    var measure;

    if (input.institution === 'medical' && input.resultSystem !== 'annual') {
      throw new Error('MBBS/BDS students must use annual examination marks.');
    }
    if (input.resultSystem === 'cgpa') {
      percentage = input.cgpa / input.scale * 100;
      measure = 'CGPA converted to a percentage';
    } else {
      percentage = input.obtained / input.total * 100;
      measure = 'Annual examination percentage';
    }

    var eligibleInstitution = input.institution !== 'federalPrivate';
    var threshold = eligibleInstitution
      ? getThreshold('continuing', input.institution, input.stream)
      : null;

    return {
      percentage: percentage,
      threshold: threshold,
      eligibleInstitution: eligibleInstitution,
      passed: eligibleInstitution && threshold !== null && percentage >= threshold,
      measure: measure
    };
  }

  var api = {
    getThreshold: getThreshold,
    calculateFirstYear: calculateFirstYear,
    calculateContinuing: calculateContinuing
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HonhaarPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis);