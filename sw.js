/* アプリ入れ by Urushihara：サービスワーカー
   ・アプリ入れ本体をスマホに保存して、オフラインでも開けるようにする
   ・入れたアプリ（…/apps/<名前>/…）を、スマホの保存場所から配る */
importScripts("launcher/db.js");
const CACHE = "appire-1.1";
const CORE = ["./", "./index.html", "./launcher/", "./launcher/index.html", "./launcher/manifest.json",
  "./launcher/jszip.min.js", "./launcher/db.js", "./launcher/icon-192.png", "./launcher/icon-512.png", "./launcher/version.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const BASE = new URL("./", self.registration.scope).href;
const APPS = BASE + "apps/";

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url.split("#")[0].split("?")[0];
  if (url.startsWith(APPS)) { e.respondWith(serveApp(url.slice(APPS.length))); return; }
  if (!url.startsWith(BASE)) return;                       // 他のサイトはそのまま
  if (url.endsWith("/launcher/version.json")) {            // 更新確認は常にネット優先
    e.respondWith(fetch(req, {cache: "no-store"}).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate") {                           // 本体のページ：ネット優先、だめなら保存した版
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./launcher/index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return res;
  })));
});

const MIME = {html:"text/html; charset=utf-8", htm:"text/html; charset=utf-8", js:"text/javascript; charset=utf-8", mjs:"text/javascript; charset=utf-8",
  css:"text/css; charset=utf-8", json:"application/json; charset=utf-8", webmanifest:"application/manifest+json; charset=utf-8",
  png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml", ico:"image/x-icon",
  txt:"text/plain; charset=utf-8", md:"text/plain; charset=utf-8", csv:"text/csv; charset=utf-8", xml:"application/xml",
  mp3:"audio/mpeg", wav:"audio/wav", ogg:"audio/ogg", m4a:"audio/mp4", mp4:"video/mp4", webm:"video/webm",
  woff:"font/woff", woff2:"font/woff2", ttf:"font/ttf", otf:"font/otf", wasm:"application/wasm", pdf:"application/pdf"};
const mimeOf = p => MIME[(p.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

function page(title, msg, status){
  const h = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + title + '</title><style>body{font-family:sans-serif;padding:24px;line-height:1.7;background:#f4f5f2;color:#1c2226}a{color:#0f5c6e}</style></head><body>'
    + '<h2>' + title + '</h2><p>' + msg + '</p><p><a href="' + BASE + 'launcher/">アプリ入れを開く</a></p></body></html>';
  return new Response(h, {status: status || 404, headers: {"Content-Type": MIME.html}});
}

/* 入れたアプリのページに足すもの：ホーム画面に追加するボタン */
function helper(id){
  return '<script>(function(){try{if(matchMedia("(display-mode: standalone)").matches)return;var k="appire_hide_"+' + JSON.stringify(id) + ';if(localStorage.getItem(k))return;}catch(e){}'
    + 'var ev=null,bar=null;function mk(t,btn){if(bar)bar.remove();bar=document.createElement("div");'
    + 'bar.style.cssText="position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:#0f5c6e;color:#fff;border-radius:12px;padding:10px 12px;font:15px sans-serif;display:flex;gap:8px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.3)";'
    + 'var s=document.createElement("span");s.style.flex="1";s.textContent=t;bar.appendChild(s);'
    + 'if(btn){var b=document.createElement("button");b.textContent="ホーム画面に追加";b.style.cssText="font:inherit;font-weight:700;border:0;border-radius:8px;padding:8px 10px;background:#fff;color:#0f5c6e";b.onclick=function(){ev.prompt();ev.userChoice.then(function(){bar.remove();});};bar.appendChild(b);}'
    + 'var x=document.createElement("button");x.textContent="×";x.setAttribute("aria-label","閉じる");x.style.cssText="font:20px sans-serif;border:0;background:none;color:#fff;padding:0 4px";x.onclick=function(){bar.remove();try{localStorage.setItem(k,"1")}catch(e){}};bar.appendChild(x);'
    + 'document.body.appendChild(bar);}'
    + 'addEventListener("beforeinstallprompt",function(e){e.preventDefault();ev=e;mk("このアプリをホーム画面に置けます",true);});'
    + 'setTimeout(function(){if(!ev)mk("ホーム画面に置くには：右上の︙ →「ホーム画面に追加」（︙がなければ「Chromeで開く」から）",false);},2500);'
    + '})();</script>';
}

async function serveApp(rest){
  rest = decodeURIComponent(rest);
  const slash = rest.indexOf("/");
  const id = slash < 0 ? rest : rest.slice(0, slash);
  if (slash < 0) return Response.redirect(APPS + id + "/", 302);
  let path = rest.slice(slash + 1);
  let rec;
  try { rec = await APPIRE_DB.getApp(id); } catch (e) { return page("読み込めませんでした", "スマホの保存場所を読めませんでした。アプリ入れを開き直してください。", 500); }
  if (!rec || !rec.cur) return page("このアプリは入っていません", "「" + id + "」はまだ入っていないか、削除されています。アプリ入れからzipを入れてください。");
  if (path === "" ) path = rec.cur.main || "index.html";
  if (path.endsWith("/")) path += "index.html";

  if (path === "__appire_manifest.json") {
    const m = {name: rec.name, short_name: rec.name.slice(0, 12), id: "./", start_url: "./", scope: "./", display: "standalone",
      background_color: "#ffffff", theme_color: "#0f5c6e",
      icons: [{src: "__appire_icon.png", sizes: "192x192", type: "image/png"}, {src: "__appire_icon512.png", sizes: "512x512", type: "image/png"}]};
    return new Response(JSON.stringify(m), {headers: {"Content-Type": MIME.webmanifest}});
  }
  let f = await APPIRE_DB.getFile(APPIRE_DB.fileKey(id, rec.cur.build, path));
  if (!f && !/\.[a-z0-9]+$/i.test(path)) f = await APPIRE_DB.getFile(APPIRE_DB.fileKey(id, rec.cur.build, path + "/index.html"));
  if (!f) return page("ファイルがありません", "「" + path + "」は、このアプリのzipに入っていませんでした。");
  const type = mimeOf(path);
  if (type.startsWith("text/html")) {
    let html = new TextDecoder("utf-8").decode(f);
    const add = [];
    if (!/rel\s*=\s*["']?manifest/i.test(html)) add.push('<link rel="manifest" href="__appire_manifest.json">');
    if (add.length) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, add.join("") + "</head>") : add.join("") + html;
    const h = helper(id);
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, h + "</body>") : html + h;
    return new Response(html, {headers: {"Content-Type": type, "Cache-Control": "no-store"}});
  }
  return new Response(f, {headers: {"Content-Type": type}});
}
