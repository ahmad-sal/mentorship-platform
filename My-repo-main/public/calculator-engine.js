(function (root) {
  'use strict';

  var FUNCTIONS = {
    abs: Math.abs,
    sqrt: function (value) {
      if (value < 0) throw new Error('Square root needs a number of zero or more.');
      return Math.sqrt(value);
    },
    cbrt: Math.cbrt,
    ln: function (value) {
      if (value <= 0) throw new Error('Natural logarithm needs a number greater than zero.');
      return Math.log(value);
    },
    log: function (value) {
      if (value <= 0) throw new Error('Base-10 logarithm needs a number greater than zero.');
      return Math.log10(value);
    },
    exp: Math.exp,
    sin: function (value, degrees) {
      return Math.sin(toRadians(value, degrees));
    },
    cos: function (value, degrees) {
      return Math.cos(toRadians(value, degrees));
    },
    tan: function (value, degrees) {
      var radians = toRadians(value, degrees);
      if (Math.abs(Math.cos(radians)) < 1e-14) throw new Error('Tangent is undefined at this angle.');
      return Math.tan(radians);
    },
    asin: function (value, degrees) {
      return fromRadians(Math.asin(value), degrees);
    },
    acos: function (value, degrees) {
      return fromRadians(Math.acos(value), degrees);
    },
    atan: function (value, degrees) {
      return fromRadians(Math.atan(value), degrees);
    }
  };

  function toRadians(value, degrees) {
    return degrees ? value * Math.PI / 180 : value;
  }

  function fromRadians(value, degrees) {
    return degrees ? value * 180 / Math.PI : value;
  }

  function tokenize(source) {
    if (source.length > 2048) throw new Error('That expression is too long to calculate.');
    var tokens = [];
    var index = 0;
    while (index < source.length) {
      var rest = source.slice(index);
      var whitespace = /^\s+/.exec(rest);
      if (whitespace) {
        index += whitespace[0].length;
        continue;
      }

      var number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      if (number) {
        var value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error('That number is outside the supported range.');
        tokens.push({ type: 'number', value: value, text: number[0] });
        index += number[0].length;
        continue;
      }

      var identifier = /^[a-zA-Z]+/.exec(rest);
      if (identifier) {
        tokens.push({ type: 'identifier', value: identifier[0].toLowerCase(), text: identifier[0] });
        index += identifier[0].length;
        continue;
      }

      var character = source[index];
      if ('+-*/^%!,()'.indexOf(character) !== -1 || character === 'π') {
        tokens.push({ type: character === 'π' ? 'constant' : character, value: character, text: character });
        index += 1;
        continue;
      }
      throw new Error('Check the expression near "' + character + '".');
    }
    if (!tokens.length) throw new Error('Enter a calculation first.');
    if (tokens.length > 256) throw new Error('That expression has too many parts to calculate.');
    return tokens;
  }

  function evaluate(source, options) {
    var tokens = tokenize(String(source));
    var position = 0;
    var nesting = 0;
    var degrees = !options || options.angleMode !== 'RAD';

    function peek() {
      return tokens[position];
    }

    function take(type) {
      var token = peek();
      if (!token || (type && token.type !== type)) throw new Error('The expression is incomplete.');
      position += 1;
      return token;
    }

    function parseExpression(minimumPrecedence) {
      var left = parsePrefix();

      while (peek()) {
        var token = peek();
        if (token.type === '!' || token.type === '%') {
          if (5 < minimumPrecedence) break;
          take();
          if (token.type === '!') left = factorial(left);
          else left /= 100;
          left = checked(left);
          continue;
        }

        var operator = token.type === 'identifier' && token.value === 'mod' ? 'mod' : token.type;
        var precedence = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2, '^': 4 }[operator];
        if (precedence === undefined || precedence < minimumPrecedence) break;
        take();
        var right = parseExpression(operator === '^' ? precedence : precedence + 1);
        if ((operator === '/' || operator === 'mod') && right === 0) {
          throw new Error(operator === '/' ? 'You cannot divide by zero.' : 'Remainder by zero is undefined.');
        }

        if (operator === '+') left += right;
        else if (operator === '-') left -= right;
        else if (operator === '*') left *= right;
        else if (operator === '/') left /= right;
        else if (operator === 'mod') left %= right;
        else left = Math.pow(left, right);
        left = checked(left);
      }
      return left;
    }

    function parsePrefix() {
      var token = take();
      if (token.type === 'number') return token.value;
      if (token.type === 'constant') return Math.PI;
      if (token.type === '+') return parseExpression(3);
      if (token.type === '-') return -parseExpression(3);
      if (token.type === '(') {
        return parseNested();
      }

      if (token.type === 'identifier') {
        if (token.value === 'pi') return Math.PI;
        if (token.value === 'e') return Math.E;
        if (token.value === 'mod') throw new Error('Place a value before the remainder operator.');
        if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, token.value)) {
          throw new Error('Unknown function: ' + token.text + '.');
        }
        if (!peek() || peek().type !== '(') throw new Error('Add parentheses after ' + token.text + '.');
        take('(');
        var argument = parseNested();
        return checked(FUNCTIONS[token.value](argument, degrees));
      }

      throw new Error('The expression is incomplete.');
    }

    function parseNested() {
      nesting += 1;
      if (nesting > 64) throw new Error('That expression is nested too deeply.');
      var value = parseExpression(0);
      if (!peek() || peek().type !== ')') throw new Error('Add a closing parenthesis.');
      take(')');
      nesting -= 1;
      return value;
    }

    var result = parseExpression(0);
    if (position !== tokens.length) {
      if (peek().type === ')') throw new Error('There is an extra closing parenthesis.');
      throw new Error('Check the expression and try again.');
    }
    return checked(result);
  }

  function checked(value) {
    if (!Number.isFinite(value)) throw new Error('The result is outside the supported range.');
    return value;
  }

  function factorial(value) {
    if (value < 0 || !Number.isInteger(value)) throw new Error('Factorial needs a non-negative whole number.');
    if (value > 170) throw new Error('Factorial is limited to 170 to keep the result finite.');
    var result = 1;
    for (var index = 2; index <= value; index += 1) result *= index;
    return result;
  }

  var api = { evaluate: evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CalculatorEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
