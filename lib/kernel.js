var dbg = require('debug')('jsbook:kernel');
var $ = require('jquery');
var qs = require('querystring');

var Book = require('./book')

// TODO: add hints dropdown
// TODO: add require loading indicator
// TODO: add contextual help? Canvas APIs?
// TODO: add banner for when saving is disabled
// TODO: fullscreen button on images or elements?
// TODO: better display of in vs out
// TODO: cmd+s for save
// TODO: collapsible/condensed (3 lines +) console output
// TODO: mistakes-esque side-by-side eval?
//  [2, 3, 4].map(function(n, i) {
//    n;                              2, 3, 4
//    n + 'what';                     '2what', '4what', '6what'
//    return n+2;                     4, 5, 6
//  })
// TODO: use esprima to wrap every line coverages-style for the above (insight mode)
// TODO: enable hooking into eval pipeline _from within the book_
// TODO: insight mode could be a plugin: require('jsbook-insight')
// TODO: add status indicators next to code for executing?
// TODO: how to handle an async codelet?
// TODO: add status indicator for dependencies
// TODO: create a transform chain for certain events, like console logs, last result, dependencies, etc. This allows plugins to handle formatting special output without core inclusion.
// TODO: how to include "runtime" code, like fs.createReadStream -> websockets?

var bookFileName = qs.parse(window.location.search.slice(1)).book;

loadBook(bookFileName, function(err, res) {
  if (err) console.error(err, res);

  var book = Book.parse(res);
  book.executionContext = Book.createExecutionContext();
  book.ensureTrailingCodelet();

  dbg('loaded %s', res.replace(/\r\n|\r|\n/g, '\\n'));

  // Render all existing codelets.
  var $codeletList = $('.js-codelet-list');
  $codeletList.append(book.codelets.map(function(codelet) {
    return codelet.render();
  }));

  // Initialize all editors.
  book.codelets.map(function(codelet) {
    codelet.initEditor();
  });

  // Handle new codelets.
  book.on('codelet:add', function(codelet) {
    $codeletList.append(codelet.render());
    codelet.initEditor();
  })

  // As a codelet begins executing.
  book.on('execute:before', function(codeletIndex) {
    var $out = getOutForCodeletIndex(codeletIndex);
    $out.html('');
  })

  // A codelet has finished executing.
  book.on('execute:after', function(codeletIndex, lastResult) {
    var $out = getOutForCodeletIndex(codeletIndex);
    if (lastResult && lastResult.nodeType === Node.ELEMENT_NODE) {
      $out.append(lastResult);
    } else if (typeof lastResult !== 'undefined') {
      $out.append('<div class="last-result">' + lastResult + '</div>');
    }
  })

  // A console method was called within a codelet.
  book.on('console', function(codeletIndex, methodName, args) {
    var $out = getOutForCodeletIndex(codeletIndex);
    $out.append('<div class="last-result">' + args.join(' ') + '</div>');
  })

  // A book's dependencies have changed.
  book.on('requires', function(nameObj) {
    if (!nameObj || !Object.keys(nameObj).length) return;
    dbg('requesting dependencies %s', Object.keys(nameObj));

    //var index = book.focusedCodeletIndex();
    //if (index == -1) {
    //  index = 1;
    //}

    var index = 0;

    var $depIcon = $('[data-codeindex=' + index + '] .js-in-iconrow .js-orbiter-status');
    var $orbiter = $depIcon.find('.js-orbiter');
    var $statusText = $depIcon.find('.js-status');
    $orbiter.addClass('orbiting');

    requestDependencies(nameObj, function(err, res) {
      // TODO: have this clear a spinner.
      $orbiter.removeClass('orbiting');
      $statusText.addClass('show');
      setTimeout(function() {
        $statusText.removeClass('show');
      }, 5000);

      if (err) {
        $statusText.text('DEPS NOT OK');
        console.error('Could not load `require`s:')
        console.error(err, res);
        return;
      }

       $statusText.text('DEPS OK');

      // TODO: these should be written to a package.json either
      // serialized within the book or alongside.

      // These should be idempotent to execute...
      var deps = JSON.parse(res);
      Object.keys(deps).forEach(function(name) {
        var pkg = deps[name].package;
        dbg('dependency %s', pkg.name + '@' + pkg.version);
        book.executeCode(deps[name].bundle);
      })

      dbg('dependencies ok');
    })
  })

  // Trigger a check for dependencies on load.
  book.detectRequires();

  // The book would like to be saved.
  book.on('request:persistence', function() {
    markWorking();
    var content = book.toTextString();
    dbg('save requested for book %s', bookFileName);
    saveBook(bookFileName, content, function(err, res) {
      var $status = $('[data-action=saved-status]');
      if (err) {
        $status.text('Save Error');
        throw err;
      }
      markNotWorking();
      $status.text('Saved at ' + (new Date).toLocaleTimeString())
    });
  })

  // Execute all codelets shortcut
  $(document).on('click', '[data-action=execute-all]', function(e) {
    e.preventDefault();
    book.codelets.forEach(function(codelet, i) {
      book.executeCodeletAt(i);
    })
  })
});

function getOutForCodeletIndex(index) {
   return $('[data-codeindex=' + index + '] .js-out');
}

function markWorking() {
  $('[data-action=settings] i').addClass('fa-spin');
}

function markNotWorking() {
  $('[data-action=settings] i').removeClass('fa-spin');
}

function requestDependencies(modules, cb) {
  var body = {
    options: {
        debug: true
      //, standalone: true
    },
    dependencies: modules
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

function saveBook(name, contents, cb) {
  var body = {
    contents: contents
  };

  var xhr = new XMLHttpRequest();
  xhr.open('PUT', '/-/books/' + encodeURIComponent(name) + '/save');
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
