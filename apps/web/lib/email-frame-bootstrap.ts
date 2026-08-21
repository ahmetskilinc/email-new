/**
 * The one script that is allowed to run inside the sandboxed message frame: it
 * reports content height back to the parent and hands link clicks over for the
 * parent to validate.
 *
 * It is authorised by *hash* rather than by a nonce, because a `srcdoc` document
 * has no URL of its own and therefore inherits the embedding page's CSP on top
 * of its own <meta> policy — both have to allow the script. A nonce minted in
 * this file only ever appears in the frame's own policy, so the inherited page
 * policy (which carries a different, per-request nonce) blocked this bootstrap
 * outright and messages rendered at the wrong height with dead links.
 *
 * The hash is also the stricter primitive of the two: the frame policy now
 * authorises this exact source text, instead of anything that turns up carrying
 * the right nonce attribute.
 */
export const EMAIL_FRAME_BOOTSTRAP = `
(function () {
  var post = function (msg) { parent.postMessage(Object.assign({ __mail: 1 }, msg), '*') }
  var report = function () {
    var d = document.documentElement, b = document.body
    // Every metric rounds down somewhere; a fraction lost here leaves the
    // frame a pixel short of its content. Take the max and round up.
    post({ type: 'height', height: Math.ceil(Math.max(
      b.scrollHeight, d.scrollHeight, b.offsetHeight,
      b.getBoundingClientRect().height, d.getBoundingClientRect().height
    )) })
  }
  window.addEventListener('load', report)
  window.addEventListener('resize', report)
  document.addEventListener('DOMContentLoaded', report)
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.body)
  // Late layout shifts (webfonts, images without dimensions) that never touch
  // the body's own border-box slip past the ResizeObserver — re-measure.
  setTimeout(report, 50); setTimeout(report, 500); setTimeout(report, 1500)

  // Links are handed to the parent, which validates the scheme and opens them.
  document.addEventListener('click', function (e) {
    var el = e.target
    while (el && el.tagName !== 'A') el = el.parentElement
    if (!el) return
    e.preventDefault()
    post({ type: 'link', href: el.getAttribute('href') || '' })
  })

  document.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') post({ type: 'imageBlocked' })
  }, true)
})()
`

/**
 * sha256 of EMAIL_FRAME_BOOTSTRAP, in the form CSP wants.
 *
 * Held as a literal because the value is needed in proxy.ts, which runs on the
 * edge runtime where the only digest API is async. `bun test` re-derives it from
 * the source above and fails if the two ever drift, so editing the script
 * without updating this constant cannot ship silently.
 */
export const EMAIL_FRAME_BOOTSTRAP_HASH =
  "sha256-lX9fcRWuKm7BzxLQrSC7CEQK1JpD/eTOgm8KwK0zTlA="
