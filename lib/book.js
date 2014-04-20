// This is the stateful current "page" of the notebook.
// It will manage executing stuff, codelets, serializing itself, deserializing itself...

var dbg = require('debug')('jsbook:book');

var path = require('path');
var events = require('events');
var inherits = require('inherits');
var debounce = require('mout/function/debounce');

var Codelet = require('./codelet');
var uniqloid = require('./uniqloid');

function Book() {
  this.executionContext = null;
  this.codelets = [];
  this.meta = null;
  this.container = null;
  this.dependencies = {};

  this.__dirname = '';
  this.__filename = '';

  // Debounce these so they don't happen too often.
  this.detectRequires = debounce(this.detectRequires.bind(this), 2000);
  this.requestPersistence = debounce(this.requestPersistence.bind(this), 2000);
}

inherits(Book, events.EventEmitter);
module.exports = Book;

Book.prototype.addCodelet = function(codelet) {
  if (!codelet) {
    codelet = new Codelet();
    codelet.meta = { index: this.codelets.length };
  }

  this.codelets.push(codelet);

  codelet.on('valid', this.ensureTrailingCodelet.bind(this));
  codelet.on('valid', Book.ifValid(this.detectRequires));
  codelet.on('valid', Book.ifValid(this.requestPersistence));
  codelet.on('execute', this.requestPersistence);
  codelet.on('execute', this.executeCodeletAt.bind(this, codelet.meta.index));

  this.emit('codelet:add', codelet);
  return codelet;
}

Book.prototype.ensureTrailingCodelet = function() {
  var last = this.codelets[this.codelets.length-1];
  if (!last || last.getValue()) {
    this.addCodelet();
  }
}

Book.prototype.requestPersistence = function() {
  this.emit('request:persistence');
}

Book.prototype.detectRequires = function() {
  var self = this;
  var news = [];
  var allFound = {};

  this.codelets.forEach(function(codelet) {
    var names = codelet.detectRequires();
    names.forEach(function(name) {
      if (!self.dependencies[name]) {
        news.push(name);
      }
      allFound[name] = 'latest';
    })
  });

  // Keep book deps up to date to prevent unnecessary requests to
  // browserify-cdn.
  this.dependencies = allFound;

  if (news.length) {
    this.emit('requires', this.dependencies);
  }
}

Book.prototype.executeCode = function(code) {
  return this.executionContext.eval(code);
}

Book.prototype.executeCodeletAt = function(index) {
  // Emits two events:
  // execute: codelet index, last returned value
  // console: codelet index, console method name, args array

  var c = this.codelets[index];

  if (!c) {
    var msg = 'Unknown codelet at index ' + index;
    throw new Error(msg);
  }

  this.emit('execute:before', index);

  var code = c.getValue();

  var execId = uniqloid();

  // Attempt to ensure that any async console.logs find the right
  // console, even if other codelets have been executed.
  var localConsole = 'console_' + execId;

  this.executionContext[localConsole] = {
      _squelched: false
    , log: consoleProxy.bind(this, 'log')
    , info: consoleProxy.bind(this, 'info')
    , error: consoleProxy.bind(this, 'error')
    , warn: consoleProxy.bind(this, 'warn')
    , squelch: function() {
      this.executionContext[localConsole]._squelched = true;
    }.bind(this)
  }

  // This should _probably_ be done with esprima / recast, but this
  // is so much simpler.
  code = code.replace(/console\.(log|info|error|warn|squelch)/g, localConsole + '.$1');
  dbg('%s', code.replace(/(\r\n|\r|\n)/g, '\\n'));

  var lastResult = this.executeCode(code);
  this.emit('execute:after', index, lastResult);

  function consoleProxy(mname) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!this.executionContext[localConsole]._squelched) {
      this.emit('console', index, mname, args);
    }
    return console[mname].apply(console, args);
  }
}

Book.prototype.toTextString = function() {
  var str = '// ' + JSON.stringify(this.meta) + '\n';

  str += this.codelets.map(function(codelet) {
    return codelet.toTextString();
  }).join('\n');

  return str;
}

Book.parse = function(text, filepath) {
  var re = /^\/\/\s(\{.+)$|^(.*)$/gim;
  var book = new Book();
  var currentSection = new Codelet();

  book.__dirname = path.dirname(filepath);
  book.__filename = path.basename(filepath);

  // TODO: perhaps meta should be merged, not replaced?
  // TODO: kill tracking/saving/deserializing { index: X }

  text.replace(re, function(match, meta, code, index) {

    if (meta && !book.meta) {
      book.meta = JSON.parse(meta);
      return;
    }

    if (meta && !currentSection.meta) {
      currentSection.meta = JSON.parse(meta);
      book.addCodelet(currentSection);
      return;
    }

    if (meta && currentSection.meta) {
      currentSection = new Codelet();
      currentSection.meta = JSON.parse(meta);
      book.addCodelet(currentSection);
      return;
    }

    if (code !== undefined && index !== text.length) {
      currentSection.initialCode.push(code);
    }
  })

  // Ensure a new book has an empty meta object.
  if (text.length === 0) {
    book.meta = {};
  }

  return book;
}


Book.createExecutionContext = function(filename, dirname) {
  // Using an iframe is not because we don't trust the code. It's because
  // we want to have as little interference with the code as possible,
  // while also not poluting our global requires.
  var parent = document.body;
  parent.insertAdjacentHTML('beforeend', '<iframe src="/-/sandbox.html"></iframe>');
  var neighborIframes = parent.querySelectorAll('iframe')
  var iframe = neighborIframes[neighborIframes.length-1];
  iframe.style.display = 'none';
  var fwindow = iframe.contentWindow;
  fwindow.__filename = filename;
  fwindow.__dirname = dirname;
  return fwindow;
}

Book.ifValid = function(fn) {
  // Perform `fn` if returned function receives a truish as the first param.
  return function(isValid) {
    if (isValid) {
      return fn();
    }
  }
}

