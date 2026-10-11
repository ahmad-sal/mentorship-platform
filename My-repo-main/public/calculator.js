(function () {
  'use strict';

  var root = document.querySelector('[data-calculator]');
  if (!root || !window.CalculatorEngine) return;

  var expression = '';
  var angleMode = 'DEG';
  var history = [];
  var memory = 0;
  var lastValue = 0;
  var lastRepeat = null;
  var evaluated = false;
  var displayExpression = root.querySelector('[data-expression]');
  var displayResult = root.querySelector('[data-result]');
  var notice = root.querySelector('[data-notice]');
  var historyList = root.querySelector('[data-history]');

  function formatValue(value) {
    if (!Number.isFinite(value)) return '';
    if (Object.is(value, -0)) return '0';
    return Number(value.toPrecision(14)).toString();
  }

  function prettyExpression(value) {
    return value
      .replace(/\bpi\b/gi, 'π')
      .replace(/\*/g, ' × ')
      .replace(/\//g, ' ÷ ')
      .replace(/\smod\s/gi, ' mod ')
      .replace(/-/g, '−')
      .replace(/\+/g, ' + ');
  }

  function calculate(value) {
    return window.CalculatorEngine.evaluate(value, { angleMode: angleMode });
  }

  function showNotice(message, isError) {
    notice.textContent = message || '';
    notice.classList.toggle('is-error', Boolean(isError));
  }

  function render() {
    displayExpression.textContent = prettyExpression(expression);
    displayExpression.scrollLeft = displayExpression.scrollWidth;
    displayResult.classList.remove('is-error');

    if (!expression) {
      displayResult.textContent = '0';
      lastValue = 0;
      return;
    }

    try {
      lastValue = calculate(expression);
      displayResult.textContent = formatValue(lastValue);
    } catch (error) {
      displayResult.textContent = evaluated ? error.message : '—';
      displayResult.classList.toggle('is-error', evaluated);
      if (evaluated) showNotice(error.message, true);
    }
    displayResult.scrollLeft = displayResult.scrollWidth;
  }

  function refresh() {
    evaluated = false;
    showNotice('', false);
    render();
  }

  function append(value) {
    var startsNew = /^\d$/.test(value) || value === '.' || value === 'pi' || value === 'e' || value === '(';
    if (evaluated && startsNew) expression = '';
    if (evaluated && !startsNew) {
      try {
        expression = formatValue(calculate(expression));
      } catch (error) {
        expression = '';
      }
    }
    evaluated = false;
    expression += value;
    refresh();
  }

  function appendDecimal() {
    if (evaluated) expression = '';
    var tail = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?$/.exec(expression);
    if (tail && tail[0].indexOf('.') !== -1) return;
    var last = expression.slice(-1);
    if (!last || /[+\-*/^(]$/.test(expression)) expression += '0';
    expression += '.';
    refresh();
  }

  function clearCurrentEntry() {
    var number = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.exec(expression);
    if (number) expression = expression.slice(0, -number[0].length);
    else if (/[a-zA-Zπ]+$/.test(expression)) expression = expression.replace(/[a-zA-Zπ]+$/, '');
    else if (expression.endsWith(')')) {
      var depth = 0;
      var open = -1;
      for (var index = expression.length - 1; index >= 0; index -= 1) {
        if (expression[index] === ')') depth += 1;
        else if (expression[index] === '(') {
          depth -= 1;
          if (depth === 0) {
            open = index;
            break;
          }
        }
      }
      if (open >= 0) expression = expression.slice(0, open + 1);
    }
    refresh();
  }

  function toggleSign() {
    var number = /-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.exec(expression);
    if (number) {
      var start = expression.length - number[0].length;
      var before = expression.slice(0, start);
      if (number[0].charAt(0) === '-' && (start === 0 || /[+\-*/^(]$/.test(before))) {
        expression = before + number[0].slice(1);
      } else {
        expression = before + '-' + number[0];
      }
    } else if (expression) {
      expression = '-(' + expression + ')';
    } else {
      expression = '-';
    }
    refresh();
  }

  function wrapFunction(name) {
    if (expression && evaluated) expression = formatValue(lastValue);
    if (expression && /[+\-*/^(\s]$/.test(expression)) {
      expression += name + '(';
    } else if (expression) {
      expression = name + '(' + expression + ')';
    } else {
      expression = name + '(';
    }
    refresh();
  }

  function applyFunction(name) {
    if (name === 'power') {
      append('^');
      return;
    }
    if (name === 'square' || name === 'cube') {
      var power = name === 'square' ? '2' : '3';
      if (!expression) expression = '0';
      else if (evaluated) expression = formatValue(lastValue);
      expression = '(' + expression + ')^' + power;
      refresh();
      return;
    }
    if (name === 'reciprocal') {
      if (!expression) expression = '0';
      else if (evaluated) expression = formatValue(lastValue);
      expression = '1/(' + expression + ')';
      refresh();
      return;
    }
    wrapFunction(name);
  }

  function findRepeatOperation(source) {
    var depth = 0;
    var candidate = -1;
    for (var index = 0; index < source.length; index += 1) {
      var character = source[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      else if (depth === 0 && '+-*/^'.indexOf(character) !== -1) {
        var previous = source.slice(0, index).trimEnd().slice(-1);
        var next = source.slice(index + 1).trimStart()[0];
        if (!/[0-9.)%!πa-zA-Z]/i.test(previous) || !next) continue;
        if ((character === '+' || character === '-') && /[eE]$/.test(source.slice(0, index))) continue;
        candidate = index;
      } else if (depth === 0 && source.slice(index, index + 3).toLowerCase() === 'mod') {
        var beforeMod = source.slice(0, index).trimEnd().slice(-1);
        if (/[0-9.)%!πa-zA-Z]/i.test(beforeMod)) candidate = index;
      }
    }
    if (candidate < 0) return null;
    var isModulo = source.slice(candidate, candidate + 3).toLowerCase() === 'mod';
    var operator = isModulo ? ' mod ' : source[candidate];
    var right = source.slice(candidate + (isModulo ? 3 : 1)).trim();
    return right ? { operator: operator, right: right } : null;
  }

  function calculateEquals() {
    if (evaluated && lastRepeat) {
      expression = formatValue(lastValue) + lastRepeat.operator + lastRepeat.right;
      evaluated = false;
    }
    if (!expression) return;

    var submitted = expression;
    try {
      var value = calculate(submitted);
      var repeat = findRepeatOperation(submitted);
      history.unshift({ expression: submitted, result: value });
      lastValue = value;
      lastRepeat = repeat;
      expression = submitted;
      evaluated = true;
      showNotice('Calculation complete.', false);
      render();
      renderHistory();
    } catch (error) {
      lastRepeat = null;
      evaluated = true;
      displayExpression.textContent = prettyExpression(submitted);
      displayResult.textContent = error.message;
      displayResult.classList.add('is-error');
      showNotice(error.message, true);
    }
  }

  function renderHistory() {
    if (!history.length) {
      historyList.innerHTML = '<p class="history-empty">Your calculations will appear here.</p>';
      return;
    }
    historyList.innerHTML = history.map(function (item, index) {
      return '<article class="history-item">' +
        '<button type="button" class="history-expression" data-history-expression="' + index + '" aria-label="Reuse expression ' + escapeHtml(item.expression) + '">' + escapeHtml(prettyExpression(item.expression)) + '</button>' +
        '<button type="button" class="history-result" data-history-result="' + index + '" aria-label="Reuse result ' + escapeHtml(formatValue(item.result)) + '">' + escapeHtml(formatValue(item.result)) + '</button>' +
        '</article>';
    }).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function copyResult() {
    var value;
    try {
      value = expression ? calculate(expression) : 0;
    } catch (error) {
      showNotice(error.message, true);
      return;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      showNotice('Clipboard access is unavailable in this browser.', true);
      return;
    }
    navigator.clipboard.writeText(formatValue(value)).then(function () {
      showNotice('Result copied to clipboard.', false);
    }).catch(function () {
      showNotice('Could not copy the result. Check your browser clipboard permissions.', true);
    });
  }

  function readCurrentValue() {
    if (!expression) return 0;
    return calculate(expression);
  }

  function memoryAction(action) {
    try {
      var value = readCurrentValue();
      if (action === 'memory-clear') memory = 0;
      else if (action === 'memory-add' || action === 'memory-subtract') {
        var nextMemory = memory + (action === 'memory-add' ? value : -value);
        if (!Number.isFinite(nextMemory)) throw new Error('The memory value is outside the supported range.');
        memory = nextMemory;
      }
      else if (action === 'memory-recall') {
        if (evaluated) expression = '';
        expression += formatValue(memory);
        refresh();
      }
      showNotice(action === 'memory-recall' ? 'Memory recalled.' : 'Memory updated.', false);
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  root.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action], button[data-angle-mode], button[data-history-expression], button[data-history-result]');
    if (!button || !root.contains(button)) return;

    if (button.hasAttribute('data-angle-mode')) {
      angleMode = button.getAttribute('data-angle-mode');
      root.querySelectorAll('[data-angle-mode]').forEach(function (option) {
        option.setAttribute('aria-pressed', String(option === button));
      });
      refresh();
      showNotice('Angle mode: ' + angleMode + '.', false);
      return;
    }
    if (button.hasAttribute('data-history-expression')) {
      expression = history[Number(button.getAttribute('data-history-expression'))].expression;
      lastRepeat = null;
      refresh();
      return;
    }
    if (button.hasAttribute('data-history-result')) {
      expression = formatValue(history[Number(button.getAttribute('data-history-result'))].result);
      lastRepeat = null;
      refresh();
      return;
    }

    var action = button.getAttribute('data-action');
    var value = button.getAttribute('data-value');
    if (action === 'insert') append(value);
    else if (action === 'decimal') appendDecimal();
    else if (action === 'equals') calculateEquals();
    else if (action === 'clear') {
      expression = '';
      lastRepeat = null;
      evaluated = false;
      showNotice('', false);
      render();
    } else if (action === 'clear-entry') clearCurrentEntry();
    else if (action === 'backspace') {
      expression = expression.slice(0, -1);
      refresh();
    } else if (action === 'sign') toggleSign();
    else if (action === 'function') applyFunction(value);
    else if (action === 'toggle-scientific') {
      var scientificGrid = root.querySelector('#scientificKeys');
      var isOpen = scientificGrid.hidden;
      scientificGrid.hidden = !isOpen;
      button.setAttribute('aria-expanded', String(isOpen));
      button.lastElementChild.textContent = isOpen ? '−' : '＋';
    } else if (action === 'clear-history') {
      history = [];
      renderHistory();
    } else if (action.indexOf('memory-') === 0) memoryAction(action);
    else if (action === 'copy') copyResult();
  });

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    if (event.key !== 'Escape' && target &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName))) return;

    if (event.key === 'Escape') {
      expression = '';
      lastRepeat = null;
      evaluated = false;
      showNotice('', false);
      render();
    } else if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault();
      calculateEquals();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      expression = expression.slice(0, -1);
      refresh();
    } else if (/^[0-9()+\-*/%^.]$/.test(event.key)) {
      event.preventDefault();
      if (event.key === '.') appendDecimal();
      else append(event.key);
    }
  });

  render();
})();
