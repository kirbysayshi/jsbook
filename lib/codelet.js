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
    + '<div class="js-codelet codelet" data-codeindex="' + this.meta.index + '">'
      + '<div class="row">'
        + '<div class="js-in in col-xs-10 col-xs-offset-1">'
        + this.initialCode.join('\n')
        + '</div>'
        + '<div class="js-in-iconrow col-xs-1">'
          + '<div class="orbiter-status js-orbiter-status">'
            + '<i class="orbiter js-orbiter"><i class="fa fa-rocket upright"></i></i>'
            + '<p class="status js-status">Dependencies Ok!</p>'
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="row">'
        + '<div class="js-out out col-xs-10 col-xs-offset-1">'
        + '</div>'
        + '<div class="js-out-iconrow col-xs-1"></div>'
      + '</div>'
    + '</div>'
  var div = document.createElement('div');
  div.innerHTML = html;
  this.container = div.childNodes[0];
  return this.container;
}

Codelet.prototype.toTextString = function() {
  var value = this.getValue();
  return value
    ? '// ' + JSON.stringify(this.meta) + '\n'
      + this.getValue()
    : '';
}
