const assert = require('node:assert/strict');
const { evaluate } = require('../public/calculator-engine.js');

const check = (expression, expected, options) => {
  assert.ok(Math.abs(evaluate(expression, options) - expected) < 1e-10, expression);
};

check('5 + 3 * 2', 11);
check('(5 + 3) * 2', 16);
check('10 / 4', 2.5);
check('-5 + 8', 3);
check('2^3^2', 512);
check('2^-2', 0.25);
check('10%', 0.1);
check('90 mod 7', 6);
check('5!', 120);
check('sqrt(81) + cbrt(27)', 12);
check('sin(30)', 0.5);
check('sin(π/2)', 1, { angleMode: 'RAD' });
check('asin(1)', 90);
check('ln(e)', 1);
check('log(1000)', 3);
check('abs(-12)', 12);
check('exp(0)', 1);

for (const expression of ['1/0', 'sqrt(-1)', 'ln(0)', 'log(-2)', '2.5!', '171!', 'tan(90)', '2 +', '(2 + 3', '2); process.exit()']) {
  assert.throws(() => evaluate(expression), undefined, expression);
}
assert.throws(() => evaluate('('.repeat(65) + '1' + ')'.repeat(65)), /nested too deeply/);
assert.throws(() => evaluate('1'.repeat(2049)), /too long/);

console.log('Calculator engine checks passed.');
