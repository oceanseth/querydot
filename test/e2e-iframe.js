// Cross-origin iframe e2e: parent on 127.0.0.1:8777 drives a child page on
// 127.0.0.1:8778 (a different origin) two ways:
//   1. Querydot.drive(iframe, '#card2', childOrigin)  — postMessage
//   2. updating the iframe src hash to #.<token>       — fragment navigation
// Run: node test/e2e-iframe.js   (needs Chrome installed)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const LIB = fs.readFileSync(path.join(__dirname, '..', 'querydot.js'), 'utf8');
const Q = require('../querydot.js');
const PARENT = 'http://127.0.0.1:8777';
const CHILD = 'http://127.0.0.1:8778';
const CARD3_HASH = '#.' + Q.encode('#card3');

const childHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="card1" style="height:120vh">one</div>
<div id="card2" style="height:120vh">two</div>
<div id="card3" style="height:120vh">three</div>
<script src="/querydot.js" data-querydot-origins="${PARENT}"></script>
<script>
  document.addEventListener('querydot:found', function () {
    parent.postMessage('qd-event:' + location.hash, '${PARENT}');
  });
</script>
</body></html>`;

const parentHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<iframe id="f" src="${CHILD}/child.html" style="width:400px;height:300px"></iframe>
<script src="/querydot.js"></script>
<script>
  var results = [];
  function mark() { document.documentElement.setAttribute('data-e2e', results.join('|')); }
  var hashDriven = false;
  window.addEventListener('message', function (e) {
    if (e.origin !== '${CHILD}') return;
    if (e.data && e.data.querydot === 'found') {
      results.push('ack:' + e.data.selector);
      mark();
      if (!hashDriven) {
        hashDriven = true;
        document.getElementById('f').src = '${CHILD}/child.html${CARD3_HASH}';
      }
    } else if (typeof e.data === 'string' && e.data.indexOf('qd-event:') === 0) {
      results.push(e.data);
      mark();
    }
  });
  var f = document.getElementById('f');
  f.addEventListener('load', function once() {
    f.removeEventListener('load', once);
    Querydot.drive(f, '#card2', '${CHILD}');
  });
</script>
</body></html>`;

function serve(port, html) {
    return http.createServer((req, res) => {
        if (req.url === '/querydot.js') {
            res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
            res.end(LIB);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }).listen(port, '127.0.0.1');
}

const s1 = serve(8777, parentHtml);
const s2 = serve(8778, childHtml);

const chromes = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const chrome = chromes.find(p => fs.existsSync(p));
if (!chrome) { console.error('Chrome not found'); process.exit(1); }

execFile(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + path.join(__dirname, '..', '.e2e-chrome'),
    '--virtual-time-budget=8000',
    '--dump-dom', PARENT + '/',
], { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 }, (err, dom) => {
    s1.close();
    s2.close();
    if (err && !dom) { console.error('chrome failed:', err.message); process.exit(1); }
    const m = dom.match(/data-e2e="([^"]*)"/);
    const got = m ? m[1] : '(no marker)';
    console.log('parent results:', got);
    const wantAck = got.includes('ack:#card2');
    const wantHash = got.includes('qd-event:' + CARD3_HASH);
    if (wantAck && wantHash) {
        console.log('ok - cross-origin postMessage drive acked (#card2)');
        console.log('ok - cross-origin hash drive navigated (#card3)');
        console.log('\ne2e passed');
    } else {
        console.error('FAIL: expected ack:#card2 and qd-event:' + CARD3_HASH);
        process.exit(1);
    }
});
