console.log('kernel PANIC!');

var $ = require('jquery');

var Codelet = require('./codelet');

loadBook(function(err, res) {
  if (err) console.error(err, res);
  var parsed = parseBook(res);
  console.log(res);

  var $codeletList = $('.codelet-list');
  $codeletList.append(htmlifyBook(parsed));
  $codeletList.find('.codelet .in').each(function(i, el) {
    var c = new Codelet(el);
    c.live();
  })

});

function loadBook(cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'demo.jsbook');
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
  return book.sections.map(function(section) {
    return ''
      + '<div class="codelet">'
        + '<div class="in">'
        + section.code.join('\n')
        + '</div>'
        + '<div class="out">'
        + '</div>'
      + '</div>'
  })
}