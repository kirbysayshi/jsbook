
var detective = require('detective');
var jseditor = require('javascript-editor');

function Codelet(container) {
  this.editor = null;
  this.modules = {};
  this.container = container;
}

module.exports = Codelet;

Codelet.prototype.live = function() {
  if (!this.editor) {
    var value = this.container.textContent;
    this.container.textContent = '';
    this.editor = jseditor({
      container: this.container,
      value: value,
      autofocus: false,
      extraKeys: {
        'Cmd-Enter': function(cm) {
          console.log('Cmd-Enter!')
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
}

Codelet.prototype.execute = function() {
  console.log('told to execute in current env');
}