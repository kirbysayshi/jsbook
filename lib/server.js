
// General pattern taken from beefy:
// https://github.com/chrisdickinson/beefy/blob/master/lib/server.js

var http = require('http');
var url = require('url');
var querystring = require('querystring');
var path = require('path');
var fs = require('fs');
var browserify = require('browserify');
var response_stream = require('response-stream');
var through = require('through');
var less = require('less');
var mold = require('mold-source-map');
var concat = require('concat-stream');
var WebSocketServer = require('ws').Server;
var websocket = require('websocket-stream');

module.exports = function(cwd) {
  var server = http.createServer(reqres);
  var wss = new WebSocketServer({server: server})
  wss.on('connection', streamcon)
  return server;

  function streamcon(ws) {
    var out = websocket(ws);
    var urlobj = url.parse(ws.upgradeReq.url);
    var filepath = path.join(cwd, urlobj.pathname);
    var encoding = urlobj.query
      ? querystring.parse(urlobj.query).encoding
      : null;
    var options = encoding !== 'null' // string because of query string
      ? { encoding: encoding }
      : undefined;

    console.log('STREAM BEGIN', options, filepath);

    fs.createReadStream(filepath, options)
      .pipe(out)
      .on('end', console.log.bind(console, 'STREAM END', options, filepath));
  }

  function reqres(req, res) {
    var parsed = url.parse(req.url, true)
      , pathname = parsed.pathname.slice(1) || 'index.html'
      , filepath = path.resolve(path.join(cwd, pathname))
      , logged_pathname = '/' + pathname
      , query = parsed.query || {}
      , start = Date.now()
      , bytesize = 0

    //console.log(parsed, req);

    var pathname

    var stream;

    var reSave = /-\/books\/([^\/]+)\/save/;
    var match = null;
    if (!stream && req.method === 'PUT' && (match = reSave.exec(pathname))) {
      stream = response_stream(saveBook(decodeURIComponent(match[1]), req));
      stream.writeHead(200);
    }

    if (!stream && pathname === '-/kernel-bundle.js') {
      stream = response_stream(kerneljs());
      stream.setHeader('content-type', 'text/javascript')
    }

    if (!stream && pathname === '-/sandbox.html') {
      stream = response_stream(sandbox());
      stream.setHeader('content-type', 'text/html')
    }

    if (!stream && pathname === '-/main.css') {
      stream = response_stream(lessfile());
      stream.setHeader('content-type', 'text/css')
    }

    if (!stream && fs.existsSync(filepath)) {
      stream = response_stream(staticfile(filepath));
    }

    if (!stream && !fs.existsSync(filepath)) {
      stream = response_stream(through());
      stream.writeHead(200, { 'content-type': 'text/javascript' });
      process.nextTick(function() {
        stream.end('');
      });
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

    function saveBook(filename, input) {
      var filepath = path.join(cwd, filename);
      var out = fs.createWriteStream(filepath, {
        encoding: 'utf8',
        flags: 'a',
        start: 0
      });

      out.on('finish', function() {
        console.log('truncating to', out.bytesWritten);
        fs.truncate(filepath, out.bytesWritten, function() {});
      })

      input.pipe(concat(input, function(str) {
        try {
          var parsed = JSON.parse(str);
          out.end(parsed.contents);
        } catch(e) {
          // TODO: better error handling...
          out.end();
        }
      }));

      return out;
    }

    function kerneljs() {
      var brfs = browserify('./kernel.js', {
        basedir: __dirname
      });

      return brfs.bundle({ debug: true })
        .pipe(mold.transformSourcesRelativeTo(__dirname));
    }

    function sandbox() {
      // This is *literally* just so window.location.* gets set
      // properly in the iframe to allow relative paths to work
      // properly. Super annoying that about: is the default protocol
      // for dynamic iframes.
      var out = through();
      process.nextTick(function() {
        var html = '';
        out.queue(html);
        out.queue(null);
      })
      return out;
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


