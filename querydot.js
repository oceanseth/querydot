/*!
 * querydot v0.1.0
 * Deep-link to any element on a page with a CSS selector in the URL.
 *
 *   https://example.com/page?.I3ByaWNpbmcgLmNhcmQ          (query form)
 *   https://example.com/page#.I3ByaWNpbmcgLmNhcmQ          (hash form)
 *
 * The token after `?.` / `#.` is the base64url-encoded selector.
 * MIT License — https://github.com/oceanseth/querydot
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Querydot = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var VERSION = '0.2.0';
    var PREFIX = '.';
    var WAIT_MS = 10000;       // how long to wait for late-rendered elements
    var HIGHLIGHT_MS = 2000;   // how long the highlight pulse lasts

    /* ------------------------------------------------------------------ *
     * Encoding — base64url so selectors survive URL encoding, chat apps, *
     * and markdown unmangled. UTF-8 safe.                                *
     * ------------------------------------------------------------------ */

    function encode(selector) {
        var bytes = new TextEncoder().encode(String(selector));
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function decode(token) {
        var b64 = String(token).replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    /* ------------------------------------------------------------------ *
     * URL handling                                                        *
     * ------------------------------------------------------------------ */

    // Pull the querydot token out of a search string ("?.abc&x=1") or
    // hash string ("#.abc"). Returns the decoded selector or null.
    function extract(search, hash) {
        var token = null;
        if (search && search.charAt(0) === '?' && search.charAt(1) === PREFIX) {
            token = search.slice(2).split('&')[0];
        } else if (hash && hash.charAt(0) === '#' && hash.charAt(1) === PREFIX) {
            token = hash.slice(2);
        }
        if (!token) return null;
        try {
            return decode(decodeURIComponent(token));
        } catch (e) {
            return null; // malformed token — ignore, never throw on page load
        }
    }

    // Build a shareable link: Querydot.link('#pricing .card', url?, {hash: true}?)
    // Preserves existing query params and (in query form) the existing hash.
    function link(selector, url, opts) {
        opts = opts || {};
        var base = url || (typeof location !== 'undefined' ? location.href : '');
        var token = encode(selector);
        var hashIdx = base.indexOf('#');
        var hash = hashIdx === -1 ? '' : base.slice(hashIdx);
        var rest = hashIdx === -1 ? base : base.slice(0, hashIdx);
        var qIdx = rest.indexOf('?');
        var query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
        var path = qIdx === -1 ? rest : rest.slice(0, qIdx);

        // strip any existing querydot token from the query
        if (query.charAt(0) === PREFIX) {
            var amp = query.indexOf('&');
            query = amp === -1 ? '' : query.slice(amp + 1);
        }
        if (opts.hash) {
            return path + (query ? '?' + query : '') + '#' + PREFIX + token;
        }
        return path + '?' + PREFIX + token + (query ? '&' + query : '') + hash;
    }

    /* ------------------------------------------------------------------ *
     * Navigation                                                          *
     * ------------------------------------------------------------------ */

    function highlight(el) {
        if (!document.getElementById('querydot-style')) {
            var style = document.createElement('style');
            style.id = 'querydot-style';
            style.textContent =
                '@keyframes querydot-pulse{0%{box-shadow:0 0 0 4px rgba(255,200,0,.9)}' +
                '100%{box-shadow:0 0 0 12px rgba(255,200,0,0)}}' +
                '.querydot-target{animation:querydot-pulse 1s ease-out 2;border-radius:2px}';
            document.head.appendChild(style);
        }
        el.classList.add('querydot-target');
        setTimeout(function () { el.classList.remove('querydot-target'); }, HIGHLIGHT_MS);
    }

    function focusTarget(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        try { el.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
        highlight(el);
        document.documentElement.setAttribute('data-querydot', 'found');
        try {
            el.dispatchEvent(new CustomEvent('querydot:found', { bubbles: true }));
        } catch (e) { /* CustomEvent unsupported — non-fatal */ }
    }

    // Navigate to a selector now; if the element isn't in the DOM yet
    // (SPA / late render), watch mutations for up to WAIT_MS.
    function goto(selector) {
        var el;
        try {
            el = document.querySelector(selector);
        } catch (e) {
            return false; // invalid selector — never break the host page
        }
        if (el) { focusTarget(el); return true; }

        var observer = new MutationObserver(function () {
            var found;
            try { found = document.querySelector(selector); } catch (e) { found = null; }
            if (found) {
                observer.disconnect();
                clearTimeout(timer);
                focusTarget(found);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        var timer = setTimeout(function () { observer.disconnect(); }, WAIT_MS);
        return false;
    }

    function init() {
        var selector = extract(location.search, location.hash);
        if (selector) goto(selector);
    }

    /* ------------------------------------------------------------------ *
     * Cross-origin driving (opt-in)                                       *
     *                                                                     *
     * A page that wants to be drivable from an embedding parent opts in   *
     * by adding data-querydot-origins="https://host.example" to the       *
     * script tag, or calling Querydot.listen(['https://host.example']) /  *
     * listen('*'). (No literal closing script tag in this file, so it     *
     * stays safe to inline.)                                              *
     *                                                                     *
     * The parent then calls Querydot.drive(iframe, selector, origin) —    *
     * a plain postMessage({querydot: selector}) under the hood. On        *
     * success the embedded page acks with {querydot:'found', selector}.   *
     * ------------------------------------------------------------------ */

    var allowedOrigins = null; // null = messaging disabled

    function listen(origins) {
        if (origins === '*') {
            allowedOrigins = '*';
        } else if (typeof origins === 'string') {
            allowedOrigins = origins.split(/\s+/).filter(Boolean);
        } else {
            allowedOrigins = origins || [];
        }
    }

    function onMessage(e) {
        if (!allowedOrigins) return;
        var d = e.data;
        if (!d || typeof d !== 'object' || typeof d.querydot !== 'string' ||
            d.querydot === 'found') return; // ignore our own ack shape
        if (allowedOrigins !== '*' && allowedOrigins.indexOf(e.origin) === -1) return;

        var sel = d.querydot;
        var src = e.source;
        var origin = e.origin;
        var acked = false;
        function ack() {
            if (acked) return;
            acked = true;
            document.removeEventListener('querydot:found', ack);
            try {
                if (src) src.postMessage({ querydot: 'found', selector: sel }, origin);
            } catch (err) { /* source window gone — non-fatal */ }
        }
        document.addEventListener('querydot:found', ack);
        setTimeout(function () {
            document.removeEventListener('querydot:found', ack);
        }, WAIT_MS + 100);
        goto(sel);
    }

    // Parent-side helper: drive an embedded page that ships querydot.
    // `targetOrigin` should be the iframe's origin; defaults to '*'.
    function drive(frame, selector, targetOrigin) {
        var win = frame && frame.contentWindow ? frame.contentWindow : frame;
        win.postMessage({ querydot: String(selector) }, targetOrigin || '*');
    }

    /* ------------------------------------------------------------------ *
     * Auto-run on pages; stays inert under Node (helpers still usable).   *
     * Opt out with <script src="querydot.js" data-querydot-manual>.       *
     * ------------------------------------------------------------------ */

    if (typeof document !== 'undefined' && typeof location !== 'undefined') {
        var script = document.currentScript;
        var manual = script && script.hasAttribute('data-querydot-manual');
        if (!manual) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
            window.addEventListener('hashchange', init);
        }
        if (script && script.hasAttribute('data-querydot-origins')) {
            listen(script.getAttribute('data-querydot-origins'));
        }
        window.addEventListener('message', onMessage);
    }

    return {
        version: VERSION,
        encode: encode,
        decode: decode,
        extract: extract,
        link: link,
        goto: goto,
        init: init,
        listen: listen,
        drive: drive
    };
});
