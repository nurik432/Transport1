// Слой поверх страницы во время записи: курсор, вспышка клика, субтитры,
// рамка подсветки и титульная карточка. Курсор и субтитр переживают переходы
// между страницами через sessionStorage. Ничего не перехватывает клики.
export const OVERLAY_SCRIPT = `(() => {
  if (window.__vgInstalled) return;
  window.__vgInstalled = true;
  const KEY_XY = "__vg_xy";
  const KEY_CAP = "__vg_cap";
  const CSS = \`
    #__vg-cursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-4px,-3px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    .__vg-ripple{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:3px solid #f59e0b;background:rgba(245,158,11,.18);z-index:2147483646;pointer-events:none;animation:__vgr .65s ease-out forwards}
    @keyframes __vgr{from{transform:scale(.3);opacity:1}to{transform:scale(1.7);opacity:0}}
    #__vg-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);width:max-content;max-width:min(1180px,82vw);background:rgba(15,23,42,.9);color:#fff;font:500 21px/1.45 "Segoe UI",system-ui,sans-serif;padding:11px 22px;border-radius:12px;z-index:2147483645;pointer-events:none;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.28)}
    #__vg-cap:empty{display:none}
    #__vg-hl{position:fixed;border:3px solid #f59e0b;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);z-index:2147483640;pointer-events:none;transition:all .35s ease;display:none}
    #__vg-title{position:fixed;inset:0;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:2147483647;font-family:"Segoe UI",system-ui,sans-serif;text-align:center;padding:0 10vw}
    #__vg-title .k{font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:#93c5fd}
    #__vg-title .t{font-size:52px;font-weight:700;line-height:1.15}
    #__vg-title .s{font-size:24px;color:#cbd5e1;max-width:900px;line-height:1.45}
  \`;
  const install = () => {
    if (document.getElementById("__vg")) return;
    const root = document.createElement("div");
    root.id = "__vg";
    root.innerHTML = '<style>' + CSS + '</style><div id="__vg-hl"></div><div id="__vg-cap"></div>'
      + '<svg id="__vg-cursor" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 14.8 L10.6 21.5 L13.4 20.2 L10.4 13.7 L16.6 13.7 Z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      + '<div id="__vg-title"></div>';
    document.body.appendChild(root);
    const cursor = document.getElementById("__vg-cursor");
    const place = (x, y) => { cursor.style.left = x + "px"; cursor.style.top = y + "px"; };
    try {
      const xy = JSON.parse(sessionStorage.getItem(KEY_XY) || "null");
      if (xy) place(xy[0], xy[1]); else place(-100, -100);
      document.getElementById("__vg-cap").textContent = sessionStorage.getItem(KEY_CAP) || "";
    } catch {}
    window.addEventListener("mousemove", (e) => {
      place(e.clientX, e.clientY);
      try { sessionStorage.setItem(KEY_XY, JSON.stringify([e.clientX, e.clientY])); } catch {}
    }, true);
    window.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__vg-ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      root.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  window.__vgCaption = (text) => {
    try { sessionStorage.setItem(KEY_CAP, text || ""); } catch {}
    const el = document.getElementById("__vg-cap");
    if (el) el.textContent = text || "";
  };
  window.__vgHighlight = (box) => {
    const el = document.getElementById("__vg-hl");
    if (!el) return;
    if (!box) { el.style.display = "none"; return; }
    const pad = 6;
    el.style.display = "block";
    el.style.left = (box.x - pad) + "px";
    el.style.top = (box.y - pad) + "px";
    el.style.width = (box.width + pad * 2) + "px";
    el.style.height = (box.height + pad * 2) + "px";
  };
  window.__vgTitle = (card) => {
    const el = document.getElementById("__vg-title");
    if (!el) return;
    if (!card) { el.style.display = "none"; el.innerHTML = ""; return; }
    const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    el.innerHTML = '<div class="k">' + esc(card.kicker) + '</div><div class="t">' + esc(card.title) + '</div><div class="s">' + esc(card.subtitle) + '</div>';
    el.style.display = "flex";
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();`;
