const assert = require('node:assert/strict');
const policy = require('../public/honhaar-policy.js');

const firstYear = (institution, stream, intermediatePercentage) => policy.calculateFirstYear({
  matricObtained: 880,
  matricTotal: 1100,
  intermediateObtained: intermediatePercentage * 12,
  intermediateTotal: 1200,
  institution,
  stream
});

assert.equal(firstYear('public', 'sciences', 70).aggregate, 73);
assert.equal(firstYear('public', 'sciences', 69.999).passed, false);
assert.equal(firstYear('public', 'sciences', 70).passed, true);
assert.equal(firstYear('public', 'arts', 65).passed, true);
assert.equal(firstYear('medical', 'sciences', 80).threshold, 80);
assert.equal(firstYear('medical', 'arts', 80).threshold, null);
assert.equal(firstYear('federalPrivate', 'sciences', 70).passed, true);
assert.equal(firstYear('federalPrivate', 'arts', 65).passed, true);
assert.equal(firstYear('hed', 'sciences', 65).passed, true);
assert.equal(firstYear('hed', 'arts', 60).passed, true);

const continuing = (institution, stream, percentage, resultSystem = 'annual') => policy.calculateContinuing({
  institution,
  stream,
  resultSystem,
  obtained: percentage,
  total: 100
});

assert.equal(continuing('public', 'sciences', 70).passed, true);
assert.equal(continuing('public', 'arts', 65).passed, true);
assert.equal(continuing('medical', 'sciences', 60).passed, true);
assert.equal(continuing('medical', 'arts', 60).threshold, null);
assert.equal(continuing('hed', 'sciences', 70).passed, true);
assert.equal(continuing('hed', 'arts', 65).passed, true);
assert.equal(continuing('federalPrivate', 'sciences', 100).eligibleInstitution, false);
assert.equal(continuing('federalPrivate', 'sciences', 100).passed, false);
assert.equal(policy.calculateContinuing({
  institution: 'public', stream: 'sciences', resultSystem: 'cgpa', cgpa: 3.5, scale: 5
}).percentage, 70);
assert.equal(policy.calculateContinuing({
  institution: 'public', stream: 'sciences', resultSystem: 'cgpa', cgpa: 2.7999, scale: 4
}).passed, false);
assert.equal(policy.calculateContinuing({
  institution: 'public', stream: 'sciences', resultSystem: 'cgpa', cgpa: 2.8, scale: 4
}).passed, true);
assert.throws(() => policy.calculateContinuing({
  institution: 'medical', stream: 'sciences', resultSystem: 'cgpa', cgpa: 4, scale: 4
}), /annual examination marks/);

console.log('Honhaar scholarship policy checks passed.');