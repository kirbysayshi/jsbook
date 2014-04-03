
// General pattern taken from beefy:
// https://github.com/chrisdickinson/beefy/blob/master/lib/server.js

var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');
var browserify = require('browserify');
var response_stream = require('response-stream');
var through = require('through');
var less = require('less');
var mold = require('mold-source-map');

module.exports = function(cwd) {
  var server = http.createServer(reqres);
  return server;

  function reqres(req, res) {
    var parsed = url.parse(req.url, true)
      , pathname = parsed.pathname.slice(1) || 'index.html'
      , filepath = path.resolve(path.join(cwd, pathname))
      , logged_pathname = '/' + pathname
      , query = parsed.query || {}
      , start = Date.now()
      , bytesize = 0

    var pathname

    var stream;

    if (!stream && pathname === '-/kernel-bundle.js') {
      stream = response_stream(kerneljs());
      stream.setHeader('content-type', 'text/javascript')
    }

    if (!stream && pathname === '-/main.css') {
      stream = response_stream(lessfile());
      stream.setHeader('content-type', 'text/css')
    }

    if (!stream && fs.existsSync(filepath)) {
      stream = response_stream(staticfile(filepath));
    }

    if (stream) {
      stream
        .on('end', logRes)
        .on('data', tally)
        .pipe(res)
    }

    if(!stream) {
      stream = response_stream(through())
      stream.writeHead(404, { 'content-type': 'text/plain' })
      process.nextTick(function() {
        stream.end('not found')
      });
    }

    function kerneljs() {
      var brfs = browserify('./kernel.js', {
        basedir: __dirname
      });

      return brfs.bundle({ debug: true })
        .pipe(mold.transformSourcesRelativeTo(__dirname));
    }

    function staticfile(filepath) {
      return fs.createReadStream(filepath);
    }

    function lessfile() {
      var out = through();
      var buf = '';
      var filepath = path.join(__dirname, '..', 'less', 'main.less')
      fs.createReadStream(filepath, 'utf8')
        .on('data', function(data) { buf += data; })
        .on('end', function() {
          less.render(buf, {
            syncImport: true,
            paths: [path.dirname(filepath)],
            // TODO: disable this when not developing.
            sourceMapFileInline: true,
            sourceMap: true
          }, function(err, css) {
            if (err) throw err;
            out.queue(css);
            out.queue(null);
          })
        })
      return out;
    }

    function logRes() {
      console.error(
          '[' + res.statusCode + ']'
        , (Date.now() - start) + 'ms'
        , bytesize + 'bytes'
        , logged_pathname
      )
    }

    function tally(data) {
      bytesize += data.length
    }
  }
}


