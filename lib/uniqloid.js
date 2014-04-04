module.exports = function uniqloid(opt_length) {
  var length = opt_length || 8;
  var pad = Array(length+1).join('0');
  return (pad + ((Math.random() * parseInt('1' + pad, 10))|0)).slice(-length)
}