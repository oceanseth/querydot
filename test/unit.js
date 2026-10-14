// Node unit tests for the pure helpers (encode/decode/extract/link).
// Run: node test/unit.js
'use strict';
const assert = require('assert');
const Q = require('../querydot.js');

let n = 0;
function ok(name, fn) { fn(); n++; console.log('ok -', name); }

ok('roundtrip simple id', () => {
    const t = Q.encode('#news-article-wrapper-13');
    assert.strictEqual(Q.decode(t), '#news-article-wrapper-13');
    assert.ok(!/[+/=]/.test(t), 'token is base64url-clean');
});

ok('roundtrip gnarly selector with utf-8', () => {
    const sel = '#pricing .tier:nth-child(3) > a[href*="?x=1&y=2"] /* ümläut ✓ */';
    assert.strictEqual(Q.decode(Q.encode(sel)), sel);
});

ok('extract from query form', () => {
    assert.strictEqual(Q.extract('?' + '.' + Q.encode('.card'), ''), '.card');
});

ok('extract query form with trailing params', () => {
    assert.strictEqual(Q.extract('?.' + Q.encode('.card') + '&utm_source=x', ''), '.card');
});

ok('extract from hash form', () => {
    assert.strictEqual(Q.extract('', '#.' + Q.encode('#deep-target')), '#deep-target');
});

ok('extract ignores normal query/hash', () => {
    assert.strictEqual(Q.extract('?page=2', '#top'), null);
    assert.strictEqual(Q.extract('', ''), null);
});

ok('extract never throws on garbage', () => {
    assert.strictEqual(Q.extract('?.%%%not-base64!!!', ''), null);
});

ok('link builds query form and preserves params + hash', () => {
    const url = Q.link('.card', 'https://ex.com/p?a=1#frag');
    assert.strictEqual(url, 'https://ex.com/p?.' + Q.encode('.card') + '&a=1#frag');
});

ok('link replaces an existing querydot token', () => {
    const first = Q.link('.one', 'https://ex.com/p?a=1');
    const second = Q.link('.two', first);
    assert.strictEqual(second, 'https://ex.com/p?.' + Q.encode('.two') + '&a=1');
});

ok('link hash form', () => {
    const url = Q.link('.card', 'https://ex.com/p?a=1', { hash: true });
    assert.strictEqual(url, 'https://ex.com/p?a=1#.' + Q.encode('.card'));
});

ok('extract(link()) roundtrip', () => {
    const url = Q.link('#x > .y', 'https://ex.com/p');
    const search = url.slice(url.indexOf('?'));
    assert.strictEqual(Q.extract(search, ''), '#x > .y');
});

console.log(`\n${n} assertions passed`);
