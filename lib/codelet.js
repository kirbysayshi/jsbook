var events = require('events');
var inherits = require('inherits');
var detective = require('detective');
var jseditor = require('javascript-editor');

function Codelet() {

  // The up to date meta information about this codelet.
  this.meta = null;

  // This will be unreliable after editor initialization, but contains
  // only code from when the codelet was instantiated after parsing an
  // existing book.
  this.initialCode = [];

  this.editor = null;
  this.container = null;
}

inherits(Codelet, events.EventEmitter);
module.exports = Codelet;

Codelet.prototype.initEditor = function() {
  var self = this;
  if (!this.editor) {
    var value = this.initialCode.join('\n');
    var container = this.container.querySelector('.js-in');
    container.textContent = '';
    this.editor = jseditor({
      container: container,
      value: value,
      autofocus: false,
      lineNumbers: false,
      extraKeys: {
        'Cmd-Enter': function(cm) {
          console.log('Cmd-Enter!')
          self.emit('execute', cm.getValue());
        }
      }
    })
    this.editor.on('valid', function(hasErrors) { self.emit('valid', hasErrors); })
  }
}

Codelet.prototype.getValue = function() {
  return this.editor
    ? this.editor.getValue()
    : this.initialCode.join('\n');
}

Codelet.prototype.detectRequires = function() {
  var requires = detective(this.getValue());
  return requires;
}

Codelet.prototype.render = function() {
  if (this.container) return this.container;
  var html = ''
    + '<div class="js-codelet codelet row" data-codeindex="' + this.meta.index + '">'
      + '<div class="js-in in col-sm-11 col-sm-offset-1">'
      + this.initialCode.join('\n')
      + '</div>'
      + '<div class="js-out out col-sm-11 col-sm-offset-1">'
      + '</div>'
    + '</div>'
  var div = document.createElement('div');
  div.innerHTML = html;
  this.container = div.childNodes[0];
  return this.container;
}

Codelet.prototype.toTextString = function() {
  return ''
    + '// ' + JSON.stringify(this.meta) + '\n'
    + this.getValue()
    + '\n';
}