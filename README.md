# querydot

Deep-link to **any element on a page** with a CSS selector in the URL — no `id` attributes required.

```
https://example.com/speakers?.I25ld3MtYXJ0aWNsZS13cmFwcGVyLTEz
                             └┬┘└──────────── token ───────────┘
                              │   base64url("#news-article-wrapper-13")
                              └ a query string that starts with "."
```

A page that ships `querydot.js` checks the URL on load, decodes the token, runs
`document.querySelector()` on it, then smooth-scrolls to the element and pulses a
highlight around it. One tiny dependency-free file (~2 KB min).

## Why does this need to exist?

The web already has two ways to link *into* a page, and both fall short of "link to a selector":

- **`#fragment` ids** — the 1993 answer. Only works if the page author gave the element an `id`.
- **[Text fragments](https://developer.mozilla.org/en-US/docs/Web/API/URL_Fragment_Text_Directives)** (`#:~:text=...`) — a real shipped standard (WICG, supported in all current Chrome/Edge/Safari/Firefox). Great for linking to *text*, useless for linking to *structure* (a card, an image, the third pricing tier).
- **CSS selectors in the fragment** were [proposed for Chromium in 2018](https://groups.google.com/a/chromium.org/d/msg/blink-dev/aKI6doxffgQ/7dzrVvo4CAAJ) as part of the same [scroll-to-text-fragment](https://github.com/WICG/scroll-to-text-fragment) effort, and WebKit [declined a similar idea](https://bugs.webkit.org/show_bug.cgi?id=100841). **It never shipped in any browser.**

Userland prior art exists but with different trade-offs:
[jquery.arbitrary-anchor.js](https://github.com/davioliveira/jquery.arbitrary-anchor.js) puts a *raw* selector after `#` (breaks the moment a URL encoder, chat app, or markdown parser touches it, and requires jQuery); the
[text-fragments-polyfill](https://github.com/GoogleChromeLabs/text-fragments-polyfill) implements the text standard, not selectors.

querydot's niche: **selector-based**, **zero dependencies**, and the selector is
**base64url-encoded** so links survive copy/paste through anything — Slack, SMS,
markdown, URL encoders — without mangling.

## Why `?.` instead of `#`?

Both work — querydot accepts `?.TOKEN` (query form) and `#.TOKEN` (hash form).

- **`?.` query form** — survives single-page apps and routers that own the hash. Caveat: query strings reach the server and CDN cache keys.
- **`#.` hash form** — never leaves the browser (no server logs, no cache-key pollution), but SPA routers may eat it.

## Usage

```html
<script src="https://cdn.jsdelivr.net/gh/oceanseth/querydot/querydot.js"></script>
```

That's it — the page now resolves inbound querydot links automatically. Elements that
render late (SPAs) are caught by a MutationObserver for up to 10 s.

### Making links

```js
Querydot.link('#pricing .tier:nth-child(3)')
// → "https://your.site/page?.I3ByaWNpbmcgLnRpZXI6bnRoLWNoaWxkKDMp"

Querydot.link('.speaker-card', 'https://example.com/speakers', { hash: true })
// → "https://example.com/speakers#.LnNwZWFrZXItY2FyZA"
```

Or by hand: base64url-encode the selector (`btoa(sel).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')`) and prefix with `?.`.

### API

| Call | Does |
|------|------|
| `Querydot.link(selector, url?, {hash}?)` | Build a shareable deep link (preserves existing query params) |
| `Querydot.goto(selector)` | Scroll + highlight now (waits up to 10 s for late-rendered elements) |
| `Querydot.encode(sel)` / `Querydot.decode(token)` | base64url helpers |
| `Querydot.extract(search, hash)` | Pull the decoded selector out of URL parts, or `null` |
| `Querydot.init()` | Re-run URL detection (auto-runs on load and `hashchange`) |

Add `data-querydot-manual` to the script tag to disable auto-run.

On success the library sets `data-querydot="found"` on `<html>` and fires a bubbling
`querydot:found` event on the target — handy for analytics or tests.

### Safety

The decoded selector is only ever passed to `document.querySelector()` — it is never
evaluated, never injected into HTML, and invalid selectors or malformed tokens are
silently ignored. A querydot link cannot do anything to a page beyond scrolling it.

## Demo

Open [`demo/index.html`](demo/index.html) — it includes a link builder and sample targets.

## License

MIT © Seth Caldwell
