var dbg = require('debug')('jsbook:kernel');
var $ = require('jquery');

var Book = require('./book')

// TODO: add hints dropdown
// TODO: add require loading indicator
// TODO: add contextual help? Canvas APIs?
// TODO: add auto saving...
// TODO: add banner for when saving is disabled
// TODO: fullscreen button on images or elements?
// TODO: better display of in vs out

var bookFileName = 'demo.jsbook'

loadBook(bookFileName, function(err, res) {
  if (err) console.error(err, res);

  var book = Book.parse(res);
  book.executionContext = Book.createExecutionContext();

  dbg('loaded %s', res.replace(/\r\n|\r|\n/g, '\\n'));

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

  book.on('execute:before', function(codeletIndex) {
    var $out = $('[data-codeindex=' + codeletIndex + '] .js-out');
    $out.html('');
  })

  book.on('execute:after', function(codeletIndex, lastResult) {
    var $out = $('[data-codeindex=' + codeletIndex + '] .js-out');
    if (lastResult instanceof Element) {
      $out.append(lastResult);
    } else if (typeof lastResult !== 'undefined') {
      $out.append('<div class="last-result">' + lastResult + '</div>');
    }
  })

  book.on('console', function(codeletIndex, methodName, args) {
    var $out = $('[data-codeindex=' + codeletIndex + '] .js-out');
    $out.append('<div class="last-result">' + args.join(' ') + '</div>');
  })

  book.on('requires', function(nameObj) {
    if (!nameObj || !Object.keys(nameObj).length) return;
    dbg('requesting dependencies %s', Object.keys(nameObj));
    requestDependencies(nameObj, function(err, res) {
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
        book.executeCode(deps[name].bundle);
      })

      dbg('dependencies ok');
    })
  })

  book.detectRequires();

  book.on('request:persistence', function() {
    var content = book.toTextString();
    dbg('save requested for book %s with content %s', bookFileName, content);
    saveBook(bookFileName, content, function(err, res) {
      if (err) throw err;
      console.log('saved!');
    });
  })
});

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
