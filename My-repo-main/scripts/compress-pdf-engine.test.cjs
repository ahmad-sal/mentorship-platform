const assert = require('node:assert/strict');
const {
  calculateResults,
  getCompressionSettings
} = require('../public/compress-pdf-engine.js');

const extreme = getCompressionSettings('extreme');
const recommended = getCompressionSettings('recommended');
const less = getCompressionSettings('less');

assert.ok(extreme.resolution < recommended.resolution);
assert.ok(recommended.resolution < less.resolution);
assert.ok(extreme.quality < recommended.quality);
assert.ok(recommended.quality < less.quality);
assert.throws(() => getCompressionSettings('unknown'), /Choose a compression level/);

assert.deepEqual(calculateResults(1000, 750), {
  originalSize: 1000,
  compressedSize: 750,
  savedBytes: 250,
  percentSaved: 25,
  hasSavings: true,
  isLarger: false
});
const larger = calculateResults(1000, 1250);
assert.equal(larger.percentSaved, -25);
assert.equal(larger.hasSavings, false);
assert.equal(larger.isLarger, true);
const unchanged = calculateResults(1000, 1000);
assert.equal(unchanged.percentSaved, 0);
assert.equal(unchanged.hasSavings, false);
assert.equal(unchanged.isLarger, false);
assert.throws(() => calculateResults(0, 10), /could not be measured/);
assert.throws(() => calculateResults(1000, NaN), /could not be measured/);

console.log('PDF compression strategy and result checks passed.');
