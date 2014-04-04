// This is the stateful current "page" of the notebook.
// It will manage executing stuff, codelets, serializing itself, deserializing itself...

var dbg = require('debug')('jsbook:book');

var events = require('events');
var vm = require('vm');
var inherits = require('inherits');
var debounce = require('mout/function/debounce');

var Codelet = require('./codelet');
var uniqloid = require('./uniqloid');

function Book() {
  this.executionContext = null;
  this.codelets = [];
  this.container = null;
  this.dependencies = {};

  this.detectRequires = debounce(this.detectRequires.bind(this), 2000);
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
  codelet.on('valid', this.detectRequires);
  codelet.on('execute', this.executeCodeletAt.bind(this, codelet.meta.index));

  this.emit('codelet:add', codelet);
  return codelet;
}

Book.prototype.ensureTrailingCodelet = function() {
  var last = this.codelets[this.codelets.length-1];
  if (last.getValue()) {
    this.addCodelet();
  }
}

Book.prototype.detectRequires = function() {
  // TODO: This may be too slow to do after every valid check...
  var hasNew = false;
  var names = this.codelets.reduce(function(all, codelet) {
    var names = codelet.detectRequires();
    names.forEach(function(name) {
      if (!all[name]) {
        all[name] = 'latest';
        hasNew = true;
      }
    })
    return all;
  }, this.dependencies);

  if (hasNew) {
    this.emit('requires', names);
  }
}

Book.prototype.executeCode = function(code) {
  return vm.runInContext(code, this.executionContext);
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

  // Attempt to ensure that any async console.logs find the right
  // console, even if other codelets have been executed.
  var localConsole = 'console_' + uniqloid();

  this.executionContext[localConsole] = {
      log: consoleProxy.bind(this, 'log')
    , info: consoleProxy.bind(this, 'info')
    , error: consoleProxy.bind(this, 'error')
    , warn: consoleProxy.bind(this, 'warn')
  }

  // This should _probably_ be done with esprima / recast, but this
  // is so much simpler.
  code = code.replace(/console\.(log|info|error|warn)/g, localConsole + '.$1');
  dbg('%s', code.replace(/(\r\n|\r|\n)/g, '\\n'));

  var lastResult = vm.runInContext(code, this.executionContext);
  this.emit('execute:after', index, lastResult);

  function consoleProxy(mname) {
    var args = Array.prototype.slice.call(arguments, 1);
    this.emit('console', index, mname, args);
    return console[mname].apply(console, args);
  }
}

Book.parse = function(text) {
  var re = /^\/\/\s(\{.+)$|^(.+)$/gim;
  var book = new Book();
  var currentSection = new Codelet();//book.addCodelet();

  // TODO: perhaps meta should be merged, not replaced?

  text.replace(re, function(match, meta, code) {

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
      currentSection = new Codelet(); //book.addCodelet();
      currentSection.meta = JSON.parse(meta);
      book.addCodelet(currentSection);
      return;
    }

    if (code) {
      currentSection.initialCode.push(code);
    }
  })

  return book;
}

Book.createExecutionContext = function() {
  var ctxObj = {
      console: {}
    // Give the context these since vm is based on an iframe that will be
    // removed from the DOM by the time they resolve. This is screwy, probably
    // need a better solution than vm module. Is the vm module even necessary?
    // Proxying console to named interceptor works just fine... was that the
    // only reason for vm?
    , setTimeout: setTimeout
    , setInterval: setInterval
  };
  Object.keys(console).forEach(function(name) {
    // Ensure we have a new fn instance to avoid rebinding
    // the actual console fns...
    ctxObj.console[name] = console[name].bind(console);
  })

  var context = vm.createContext(ctxObj);
  return context;
}


