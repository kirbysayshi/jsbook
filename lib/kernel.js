var dbg = require('debug')('jsbook:kernel');
var vm = require('vm');
var $ = require('jquery');

var Codelet = require('./codelet');

loadBook('demo.jsbook', function(err, res) {
  if (err) console.error(err, res);
  var parsed = parseBook(res);
  dbg('loaded %s', res.replace(/\r\n|\r|\n/g, '\\n'));

  var ctx = createExecutionContext();

  var $codeletList = $('.js-codelet-list');
  $codeletList.append(htmlifyBook(parsed));
  $codeletList.find('.js-codelet .js-in').each(function(i, el) {
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

        // TODO: these should be written to a package.json either
        // serialized within the book or alongside.

        // These should be idempotent to execute...
        var deps = JSON.parse(res);
        Object.keys(deps).forEach(function(name) {
          var pkg = deps[name].package;
          dbg('dependency %s', pkg.name + '@' + pkg.version);
          vm.runInContext(deps[name].bundle, ctx);
        })

        dbg('dependencies ok');
      })
    });

    // Trigger a 'valid' event (hopefully) which will cause a requires
    // check immediately if necessary.
    c.editor.update();
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
  var $out = $('[data-codeindex=' + index + '] .js-out');
  $out.html('');

  // Attempt to ensure that any async console.logs find the right
  // console, even if other codelets have been executed.
  var localConsole = 'console_' + uniqloid();

  context[localConsole] = {
      log: consoleProxy.bind(null, 'log')
    , info: consoleProxy.bind(null, 'info')
    , error: consoleProxy.bind(null, 'error')
    , warn: consoleProxy.bind(null, 'warn')
  }

  // This should _probably_ be done with esprima / recast, but this
  // is so much simpler.
  code = code.replace(/console\.(log|info|error|warn)/g, localConsole + '.$1');
  dbg('%s', code.replace(/(\r\n|\r|\n)/g, '\\n'));

  var lastStatement = vm.runInContext(code, context);
  if (typeof lastStatement !== 'undefined') {
    $out.append(outLine(lastStatement));
  }

  function outLine(text) {
    return '<div class="last-result">' + text + '</div>';
  }

  function consoleProxy(mname) {
    var args = Array.prototype.slice.call(arguments, 1);
    $out.append(outLine(args.join(' ')));
    return console[mname].apply(console, args);
  }
}

function uniqloid(opt_length) {
  var length = opt_length || 8;
  var pad = Array(length+1).join('0');
  return (pad + ((Math.random() * parseInt('1' + pad, 10))|0)).slice(-length)
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
      + '<div class="js-codelet codelet row" data-codeindex="' + i + '">'
        + '<div class="js-in in col-sm-11 col-sm-offset-1">'
        + section.code.join('\n')
        + '</div>'
        + '<div class="js-out out col-sm-11 col-sm-offset-1">'
        + '</div>'
      + '</div>'
  })
}