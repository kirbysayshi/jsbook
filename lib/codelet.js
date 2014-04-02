var events = require('events');
var inherits = require('inherits');
var detective = require('detective');
var jseditor = require('javascript-editor');

function Codelet(container) {
  this.editor = null;
  this.modules = {};
  this.container = container;
}

inherits(Codelet, events.EventEmitter);
module.exports = Codelet;

Codelet.prototype.live = function() {
  var self = this;
  if (!this.editor) {
    var value = this.container.textContent;
    this.container.textContent = '';
    this.editor = jseditor({
      container: this.container,
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
    this.editor.on('valid', this.moduleCheck.bind(this));
  }
}

Codelet.prototype.moduleCheck = function() {
  this.live();
  var requires = detective(this.editor.getValue());
  console.log('requires', requires);
  this.emit('requires', requires);
}

Codelet.prototype.execute = function() {
  console.log('told to execute in current env');
}