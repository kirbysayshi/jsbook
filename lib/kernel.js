console.log('kernel PANIC!');

var vm = require('vm');
var $ = require('jquery');

var Codelet = require('./codelet');

loadBook('demo.jsbook', function(err, res) {
  if (err) console.error(err, res);
  var parsed = parseBook(res);
  console.log(res);

  var ctx = createExecutionContext();

  var $codeletList = $('.codelet-list');
  $codeletList.append(htmlifyBook(parsed));
  $codeletList.find('.codelet .in').each(function(i, el) {
    var c = new Codelet(el);
    c.live();
    c.on('execute', executeCodelet.bind(null, ctx, i));
    c.on('requires', function(names) {
      if (!names || !names.length) return;
      requestDependencies(names, function(err, res) {
        // TODO: have this clear a spinner.

        if (err) {
          console.error('Could not load `require`s:')
          console.error(err, res);
          return;
        }

        // These should be idempotent to execute...
        var deps = JSON.parse(res);
        Object.keys(deps).forEach(function(name) {
          vm.runInContext(deps[name].bundle, ctx);
        })
        console.log('Dependencies ok');
      })
    });
  })

});

function requestDependencies(modules, cb) {
  var body = {
    options: {
        debug: true
      //, standalone: true
    },
    dependencies: modules.reduce(function(accum, name) {
      accum[name] = 'latest';
      return accum;
    }, {})
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', 'http://wzrd.in/multi/');
  xhr.responseType = 'text';
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status !== 200) {
        cb(xhr.status, xhr.response);
      } else {
        cb(null, xhr.response);
      }
    }
  }
  xhr.send(JSON.stringify(body));
}

function createExecutionContext() {
  var ctxObj = { console: {} };
  Object.keys(console).forEach(function(name) {
    // Ensure we have a new fn instance to avoid rebinding
    // the actual console fns...
    ctxObj.console[name] = console[name].bind(console);
  })

  var context = vm.createContext(ctxObj);
  return context;
}

function executeCodelet(context, index, code) {
  var $out = $('[data-codeindex=' + index + '] .out');
  $out.html('');

  context.console.log = consoleProxy.bind(null, 'log');
  context.console.info = consoleProxy.bind(null, 'info');
  context.console.error = consoleProxy.bind(null, 'error');
  context.console.warn = consoleProxy.bind(null, 'warn');

  var lastStatement = vm.runInContext(code, context);
  if (typeof lastStatement !== 'undefined') {
    $out.append(outLine(lastStatement));
  }

  function outLine(text) {
    return '<div>' + text + '</div>';
  }

  function consoleProxy(mname) {
    var args = Array.prototype.slice.call(arguments, 1);
    $out.append(outLine(args.join(' ')));
    return console[mname].apply(console, args);
  }
}

function loadBook(name, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', name);
  xhr.responseType = 'text';
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status !== 200) {
        cb(xhr.status, xhr.response);
      } else {
        cb(null, xhr.response);
      }
    }
  }
  xhr.send();
}

function parseBook(text) {
  var re = /^\/\/\s(\{.+)$|^(.+)$/gim;
  var book = {
    meta: null,
    sections: [
      section()
    ]
  }
  var currentSection = book.sections[0];

  text.replace(re, function(match, meta, code) {

    if (meta && !book.meta) {
      book.meta = JSON.parse(meta);
      return;
    }

    if (meta && !currentSection.meta) {
      currentSection.meta = JSON.parse(meta);
      return;
    }

    if (meta && currentSection.meta) {
      currentSection = section();
      currentSection.meta = JSON.parse(meta);
      book.sections.push(currentSection);
      return;
    }

    if (code) {
      currentSection.code.push(code);
    }
  })

  return book;

  function section() {
    return {
      code: [],
      meta: null
    }
  }
}

function htmlifyBook(book) {
  return book.sections.map(function(section, i) {
    return ''
      + '<div class="codelet" data-codeindex="' + i + '">'
        + '<div class="in">'
        + section.code.join('\n')
        + '</div>'
        + '<div class="out">'
        + '</div>'
      + '</div>'
  })
}