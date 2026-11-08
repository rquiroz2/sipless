// SipLess service worker — makes the app installable as a PWA.
// It deliberately caches nothing: every page load and API call goes to the
// server, so data always comes live from the server. The only thing it adds
// is a friendly "offline" page when the phone has no connection.

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#fef6f3">
<title>SipLess — offline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#fef6f3;color:#4a3637;font-family:Nunito,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
  .flower{font-size:40px;color:#d4728c;opacity:.6;margin-bottom:8px}
  h1{font-family:"Playfair Display",Georgia,serif;font-size:24px;margin:0 0 8px}
  p{color:#8c6b6d;margin:0 0 22px}
  button{background:#d4728c;color:#fff;border:0;border-radius:12px;padding:12px 26px;font-size:16px;font-weight:600}
  @media (prefers-color-scheme: dark){
    body{background:#1a1016;color:#f0e4e6} p{color:#c4a0a8} button{background:#e8849c;color:#1a1016}
  }
</style></head>
<body><div>
  <div class="flower">✿</div>
  <h1>Can't reach SipLess</h1>
  <p>Check your connection, then try again.</p>
  <button onclick="location.reload()">Retry</button>
</div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  // Only page navigations get special handling; everything else (API calls,
  // scripts, fonts) goes straight to the network untouched.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    )
  );
});
