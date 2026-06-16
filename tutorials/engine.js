/* Data-driven, deterministic animation engine.
   A video = { eyebrow, scenes:[{dur, headline, caption, step, steps, stepLabel,
   chrome, body, cursor}] }. The host calls window.seek(t) for every frame, so
   rendering is a pure function of time — perfect for frame-by-frame capture. */

const XF = 0.42;        // crossfade between scenes (s)
const FADE_IN = 0.5;    // open from black
const FADE_OUT = 0.5;   // close to black
const REVEAL_BASE = 0.18;
const REVEAL_STAGGER = 0.12;
const REVEAL_DUR = 0.42;
const CURSOR_MOVE = 0.6;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const CURSOR_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3l5.5 16 2.4-6.6 6.6-2.4L5 3z" fill="#fff" stroke="#1a2540" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

function buildHeadline(parts) {
  if (!parts) return '';
  return parts
    .map((p) => (typeof p === 'string' ? escapeHtml(p) : `<span class="hi">${escapeHtml(p.hi)}</span>`))
    .join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function chromeHtml(chrome) {
  if (!chrome) return '';
  const lock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>`;
  const url = chrome.url || '';
  const idx = url.indexOf('/');
  const host = idx === -1 ? url : url.slice(0, idx);
  const rest = idx === -1 ? '' : url.slice(idx);
  return `<div class="chrome">
    <div class="dots"><i></i><i></i><i></i></div>
    <div class="url">${lock}<span><b>${escapeHtml(host)}</b>${escapeHtml(rest)}</span></div>
  </div>`;
}

const V = window.NEURON_VIDEO;

// compute scene start offsets
const starts = [];
let acc = 0;
for (const s of V.scenes) { starts.push(acc); acc += s.dur; }
const TOTAL = acc;
window.TOTAL = TOTAL;
window.FPS = V.fps || 30;

// ---- build DOM ----
const stage = document.createElement('div');
stage.id = 'stage';
stage.innerHTML = `
  <div class="eyebrow">${escapeHtml(V.eyebrow || '')}</div>
  <div class="headline" id="headline"></div>
  <div class="rail" id="rail"></div>
  <div class="window-wrap" id="wrap">
    <div id="ripple"></div>
    <div id="cursor">${CURSOR_SVG}</div>
  </div>
  <div class="caption" id="caption"></div>
`;
document.body.appendChild(stage);

const wrap = document.getElementById('wrap');
const headlineEl = document.getElementById('headline');
const captionEl = document.getElementById('caption');
const railEl = document.getElementById('rail');
const cursorEl = document.getElementById('cursor');
const rippleEl = document.getElementById('ripple');

// one .scene layer per scene, content built once
const sceneEls = V.scenes.map((s) => {
  const el = document.createElement('div');
  el.className = 'scene';
  el.innerHTML = `<div class="window">${chromeHtml(s.chrome)}<div class="viewport">${s.body || ''}</div></div>`;
  // insert before ripple/cursor so they stay on top
  wrap.insertBefore(el, rippleEl);
  el._reveals = Array.from(el.querySelectorAll('[data-reveal]'));
  return el;
});

function sceneOpacity(i, t) {
  const s = starts[i];
  const e = starts[i] + V.scenes[i].dur;
  let lead;
  if (i === 0) lead = clamp(t / FADE_IN, 0, 1);
  else lead = clamp((t - (s - XF / 2)) / XF, 0, 1);
  let trail;
  if (i === V.scenes.length - 1) trail = clamp((TOTAL - t) / FADE_OUT, 0, 1);
  else trail = clamp((e + XF / 2 - t) / XF, 0, 1);
  return Math.min(lead, trail);
}

function activeIndex(t) {
  for (let i = V.scenes.length - 1; i >= 0; i--) {
    if (t >= starts[i]) return i;
  }
  return 0;
}

function renderRail(scene) {
  const n = scene.steps || 0;
  if (!n) { railEl.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= n; i++) {
    const cls = i === scene.step ? 'dot on' : i < scene.step ? 'dot done' : 'dot';
    html += `<span class="${cls}"></span>`;
  }
  if (scene.stepLabel) html += `<span class="label">${escapeHtml(scene.stepLabel)}</span>`;
  railEl.innerHTML = html;
}

function applyReveals(el, scene, localT) {
  const reveals = el._reveals;
  for (let k = 0; k < reveals.length; k++) {
    const delay = REVEAL_BASE + k * REVEAL_STAGGER;
    const p = easeOut(clamp((localT - delay) / REVEAL_DUR, 0, 1));
    const node = reveals[k];
    node.style.opacity = String(p);
    node.style.transform = `translateY(${(1 - p) * 9}px)`;
  }
}

function applyCursor(scene, sceneEl, localT) {
  const cur = scene.cursor;
  if (!cur) { cursorEl.style.opacity = '0'; rippleEl.style.opacity = '0'; return; }
  const target = sceneEl.querySelector(cur.to);
  if (!target) { cursorEl.style.opacity = '0'; return; }
  const wb = wrap.getBoundingClientRect();
  const tb = target.getBoundingClientRect();
  const tx = tb.left - wb.left + tb.width / 2;
  const ty = tb.top - wb.top + tb.height / 2;
  const fromX = cur.fromX != null ? cur.fromX : tx - 150;
  const fromY = cur.fromY != null ? cur.fromY : ty + 150;
  const appear = cur.appearAt != null ? cur.appearAt : 0.15;
  const mp = easeInOut(clamp((localT - appear) / CURSOR_MOVE, 0, 1));
  const x = fromX + (tx - fromX) * mp;
  const y = fromY + (ty - fromY) * mp;
  cursorEl.style.opacity = String(clamp((localT - appear) / 0.2, 0, 1));
  cursorEl.style.transform = `translate(${x}px, ${y}px)`;

  if (cur.click != null) {
    const dt = localT - cur.click;
    // press dip on cursor
    const press = dt >= 0 && dt < 0.16 ? 0.86 : 1;
    cursorEl.style.transform += ` scale(${press})`;
    const rp = clamp(dt / 0.45, 0, 1);
    if (dt >= 0 && rp < 1) {
      rippleEl.style.opacity = String((1 - rp) * 0.6);
      rippleEl.style.left = `${tx}px`;
      rippleEl.style.top = `${ty}px`;
      rippleEl.style.transform = `translate(-50%, -50%) scale(${0.3 + rp * 2.4})`;
    } else {
      rippleEl.style.opacity = '0';
    }
  } else {
    rippleEl.style.opacity = '0';
  }
}

window.seek = function seek(t) {
  t = clamp(t, 0, TOTAL - 1e-4);
  const ai = activeIndex(t);
  const scene = V.scenes[ai];

  // headline + caption follow the active scene
  headlineEl.innerHTML = buildHeadline(scene.headline);
  captionEl.innerHTML = scene.caption ? escapeHtml(scene.caption) : '';
  renderRail(scene);

  for (let i = 0; i < sceneEls.length; i++) {
    const op = sceneOpacity(i, t);
    const el = sceneEls[i];
    el.style.opacity = String(op);
    el.style.display = op <= 0.001 ? 'none' : 'block';
    if (op > 0.001) applyReveals(el, V.scenes[i], t - starts[i]);
  }

  // cursor belongs to the active scene only
  applyCursor(scene, sceneEls[ai], t - starts[ai]);
};

window.seek(0);
document.body.dataset.ready = '1';
