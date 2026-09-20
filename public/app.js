// IEEE RAS Intelligence — night sky + ask bar. No libraries.
const $ = (s) => document.querySelector(s);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const VIBGYOR = ["#8f5bff", "#5b6cff", "#4aa8ff", "#45d69a", "#f2e05a", "#ffa24a", "#ff5e6c"];

// ====================================================================== canvases
const sky = $("#sky"), g = sky.getContext("2d");
const cur = $("#cursor"), cg = cur.getContext("2d");
let W = 0, H = 0, DPR = 1, quality = 1; // quality drops to 0 on slow devices
const pointer = { x: -999, y: -999, active: false, nx: 0, ny: 0 };

function resize() {
  W = innerWidth; H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, quality ? (W < 700 ? 1.5 : 2) : 1);
  for (const c of [sky, cur]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  cg.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildScene();
  if (titleSettled) settleTitle(true);
}

const sprite = (size, paint) => {
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(size * Math.min(DPR, 2));
  const x = c.getContext("2d");
  x.scale(c.width / size, c.height / size);
  paint(x, size);
  return c;
};

// ====================================================================== scene
let bg, starGlow, smokePuff, moonImg, moonHalo, cursorCloud;
let stars = [], moon = { x: 0, y: 0, r: 40 };

function buildScene() {
  const small = W < 700;

  // sky: dark purple gradient with faint nebula washes, painted once
  bg = document.createElement("canvas");
  bg.width = Math.max(1, Math.round(W / 4)); bg.height = Math.max(1, Math.round(H / 4));
  const b = bg.getContext("2d"), bw = bg.width, bh = bg.height;
  const lg = b.createLinearGradient(0, 0, 0, bh);
  lg.addColorStop(0, "#07031a"); lg.addColorStop(0.55, "#1b0c42"); lg.addColorStop(1, "#3b1a66");
  b.fillStyle = lg; b.fillRect(0, 0, bw, bh);
  for (const [x, y, r, col] of [[0.2, 0.75, 0.55, "rgba(143,91,255,.16)"], [0.85, 0.9, 0.45, "rgba(255,94,160,.10)"], [0.55, 0.35, 0.4, "rgba(74,120,255,.07)"]]) {
    const rg = b.createRadialGradient(x * bw, y * bh, 0, x * bw, y * bh, r * Math.max(bw, bh));
    rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = rg; b.fillRect(0, 0, bw, bh);
  }

  starGlow = sprite(64, (x, s) => {
    const rg = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.12, "rgba(255,255,255,.9)");
    rg.addColorStop(0.3, "rgba(210,195,255,.35)"); rg.addColorStop(1, "rgba(160,130,255,0)");
    x.fillStyle = rg; x.fillRect(0, 0, s, s);
  });
  smokePuff = sprite(64, (x, s) => {
    const rg = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, "rgba(230,222,255,.55)"); rg.addColorStop(0.5, "rgba(200,185,255,.22)"); rg.addColorStop(1, "rgba(180,160,255,0)");
    x.fillStyle = rg; x.fillRect(0, 0, s, s);
  });

  // stars: density scales with screen area; a few bright ones get spikes
  const count = Math.round(Math.min(420, (W * H) / (small ? 3200 : 2600)) * (quality ? 1 : 0.6));
  stars = Array.from({ length: count }, () => {
    const bright = Math.random() < 0.06;
    return {
      x: Math.random(), y: Math.pow(Math.random(), 1.25) * 0.92, // denser towards the top
      r: bright ? rand(1.4, 2.2) : rand(0.4, 1.3), bright,
      a: rand(0.45, 1), speed: rand(0.6, 2.4), phase: rand(0, TAU), depth: rand(0.2, 1),
      tint: Math.random() < 0.25 ? "lav" : "white", seed: Math.random(), hover: 0,
    };
  });

  // moon: cream disc, soft craters, a gentle halo
  moon = { x: small ? W * 0.8 : W * 0.82, y: small ? H * 0.3 : H * 0.24, r: small ? 30 : Math.min(58, W * 0.04) };
  const R = moon.r;
  moonImg = sprite(R * 2 + 4, (x, s) => {
    const c = s / 2;
    const rg = x.createRadialGradient(c - R * 0.35, c - R * 0.35, R * 0.1, c, c, R);
    rg.addColorStop(0, "#fffaf0"); rg.addColorStop(0.7, "#efe6cf"); rg.addColorStop(1, "#d9ccb0");
    x.fillStyle = rg; x.beginPath(); x.arc(c, c, R, 0, TAU); x.fill();
    x.save(); x.clip();
    for (const [dx, dy, cr, al] of [[-0.3, -0.2, 0.22, 0.14], [0.25, 0.1, 0.16, 0.12], [-0.05, 0.4, 0.12, 0.1], [0.4, -0.35, 0.09, 0.1], [-0.45, 0.25, 0.08, 0.09], [0.1, -0.5, 0.07, 0.08]]) {
      x.fillStyle = `rgba(150,130,100,${al})`; x.beginPath(); x.arc(c + dx * R, c + dy * R, cr * R, 0, TAU); x.fill();
      x.strokeStyle = `rgba(255,255,255,${al * 0.8})`; x.lineWidth = R * 0.02; x.beginPath(); x.arc(c + dx * R, c + dy * R, cr * R, Math.PI * 0.9, Math.PI * 1.6); x.stroke();
    }
    x.restore();
  });
  moonHalo = sprite(R * 10, (x, s) => {
    const rg = x.createRadialGradient(s / 2, s / 2, R * 0.9, s / 2, s / 2, s / 2);
    rg.addColorStop(0, "rgba(243,236,216,.35)"); rg.addColorStop(0.25, "rgba(203,184,255,.12)"); rg.addColorStop(1, "rgba(143,91,255,0)");
    x.fillStyle = rg; x.fillRect(0, 0, s, s);
  });

  cursorCloud = cloudSprite(30, 15);
}

// small cloud for the cursor: puffs with a grey outline
function cloudSprite(w, h) {
  const puffs = [[w * 0.28, h * 0.62, h * 0.36], [w * 0.5, h * 0.42, h * 0.48], [w * 0.72, h * 0.6, h * 0.36], [w * 0.4, h * 0.72, h * 0.3], [w * 0.62, h * 0.74, h * 0.3]];
  const pad = 3, c = document.createElement("canvas"), s = Math.min(DPR, 2) * 2;
  c.width = (w + pad * 2) * s; c.height = (h + pad * 2) * s;
  const x = c.getContext("2d");
  x.scale(s, s); x.translate(pad, pad);
  const draw = (grow, col) => { x.fillStyle = col; x.beginPath(); for (const [px, py, pr] of puffs) { x.moveTo(px + pr + grow, py); x.arc(px, py, pr + grow, 0, TAU); } x.fill(); };
  draw(1.3, "#8a8fa3"); draw(0, "#f4f1ff");
  x.globalCompositeOperation = "source-atop"; x.fillStyle = "#d9d3ee";
  x.beginPath(); x.rect(0, h * 0.78, w, h); x.fill();
  return { img: c, w: w + pad * 2, h: h + pad * 2 };
}

// ====================================================================== drawing
function drawMoon(t) {
  const mx = moon.x + (pointer.active ? -pointer.nx * 10 : 0), my = moon.y + Math.sin(t * 0.2) * 4 + (pointer.active ? -pointer.ny * 6 : 0);
  const hs = moon.r * 10 * (1 + Math.sin(t * 0.6) * 0.03);
  g.drawImage(moonHalo, mx - hs / 2, my - hs / 2, hs, hs);
  g.drawImage(moonImg, mx - moon.r - 2, my - moon.r - 2, moon.r * 2 + 4, moon.r * 2 + 4);
}

// blend between a polygon (morph 0) and a circle (morph 1) at angle a
const polyPoint = (sides, morph, a, r, rot) => {
  const seg = TAU / sides, k = ((a - rot) % seg + seg) % seg - seg / 2;
  const pr = (r * Math.cos(Math.PI / sides)) / Math.cos(k);
  const rr = pr + (r - pr) * morph;
  return [Math.cos(a) * rr, Math.sin(a) * rr];
};

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

function drawStars(t, dt) {
  const R = W < 700 ? 70 : 110; // hover radius that triggers diffraction
  for (const s of stars) {
    const x = s.x * W + (pointer.active ? -pointer.nx * 14 * s.depth : 0);
    const y = s.y * H + (pointer.active ? -pointer.ny * 8 * s.depth : 0);
    const pulse = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
    const d = pointer.active ? Math.hypot(pointer.x - x, pointer.y - y) : 1e9;
    const target = d < R ? Math.pow(1 - d / R, 1.3) : 0;
    s.hover += (target - s.hover) * Math.min(1, dt * 6);

    const size = s.r * (s.bright ? 9 : 6) * (0.7 + 0.5 * pulse) * (1 + s.hover * 1.6);
    g.globalAlpha = Math.min(1, s.a * (0.45 + 0.55 * pulse) + s.hover * 0.5);
    g.drawImage(starGlow, x - size / 2, y - size / 2, size, size);
    if (s.bright) {
      g.strokeStyle = s.tint === "lav" ? "rgba(214,200,255,.7)" : "rgba(255,255,255,.7)";
      g.lineWidth = 0.8;
      const L = s.r * (5 + 4 * pulse);
      g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L); g.lineTo(x, y + L); g.stroke();
    }
    g.globalAlpha = 1;
    if (s.hover > 0.02) diffraction(x, y, s, t);
  }
}

// A star seen through an aperture: spikes plus rings whose shape keeps changing
// (triangle -> square -> hexagon -> octagon, melting into circles), tinted VIBGYOR.
function diffraction(x, y, s, t) {
  const k = s.hover;
  const cycle = t * 0.35 + s.seed * 5;
  const shapes = [3, 4, 6, 8];
  const sides = shapes[Math.floor(cycle) % shapes.length];
  const morph = 0.5 - 0.5 * Math.cos((cycle % 1) * TAU); // sharp polygon -> circle -> sharp again
  const rot = t * 0.3 + s.seed * TAU;
  g.save();
  g.translate(x, y);
  g.globalCompositeOperation = "lighter";

  const spikes = sides % 2 ? sides * 2 : sides;
  const L = (26 + 70 * k) * (s.bright ? 1.3 : 1);
  for (let i = 0; i < spikes; i++) {
    const a = rot + (i / spikes) * TAU;
    const ex = Math.cos(a) * L, ey = Math.sin(a) * L;
    const grad = g.createLinearGradient(0, 0, ex, ey);
    grad.addColorStop(0, `rgba(255,255,255,${(0.7 * k).toFixed(3)})`);
    VIBGYOR.forEach((c, j) => grad.addColorStop(0.12 + (j / 6) * 0.78, hexA(c, 0.42 * k)));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.strokeStyle = grad; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(ex, ey); g.stroke();
  }
  const rings = 5;
  for (let i = 0; i < rings; i++) {
    const phase = (t * 0.25 + i / rings) % 1;
    const r = (6 + phase * (38 + 30 * k)) * (s.bright ? 1.2 : 1);
    g.strokeStyle = hexA(VIBGYOR[(i * 2 + Math.floor(cycle)) % VIBGYOR.length], 0.6 * k * (1 - phase));
    g.lineWidth = 1.2;
    g.beginPath();
    for (let j = 0; j <= 48; j++) {
      const [px, py] = polyPoint(sides, morph, (j / 48) * TAU, r, rot);
      j ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}

// occasional shooting star
let meteor = null, nextMeteor = 4;
function drawMeteor(t, dt) {
  if (reduced) return;
  if (!meteor && t > nextMeteor) {
    meteor = { x: rand(0.1, 0.7) * W, y: rand(0.02, 0.3) * H, vx: rand(500, 800), vy: rand(160, 300), life: 0, max: rand(0.7, 1.1) };
    nextMeteor = t + rand(6, 14);
  }
  if (!meteor) return;
  meteor.life += dt; meteor.x += meteor.vx * dt; meteor.y += meteor.vy * dt;
  const a = Math.sin(Math.min(1, meteor.life / meteor.max) * Math.PI);
  const tx = meteor.x - meteor.vx * 0.18, ty = meteor.y - meteor.vy * 0.18;
  const grad = g.createLinearGradient(meteor.x, meteor.y, tx, ty);
  grad.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`); grad.addColorStop(1, "rgba(203,184,255,0)");
  g.strokeStyle = grad; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(meteor.x, meteor.y); g.lineTo(tx, ty); g.stroke();
  if (meteor.life > meteor.max) meteor = null;
}

// ====================================================================== cursor + smoke trail (varied sizes)
const smoke = [];
let lastPuff = { x: 0, y: 0 };

function addSmoke(x, y, n = 1, spread = 0, scale = 1) {
  for (let i = 0; i < n; i++) {
    // mostly small wisps, some medium puffs, now and then a big billow
    const roll = Math.random();
    const size = (roll < 0.15 ? rand(26, 48) : roll < 0.55 ? rand(12, 26) : rand(4, 12)) * scale;
    smoke.push({ x: x + rand(-spread, spread), y: y + rand(-spread, spread), size, life: 0, max: rand(0.9, 1.6) * (0.7 + size / 60),
      vx: rand(-10, 10), vy: rand(-26, -8), spin: rand(-1, 1) });
  }
  if (smoke.length > 160) smoke.splice(0, smoke.length - 160);
}

function drawCursor(dt) {
  cg.clearRect(0, 0, W, H);
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.life += dt;
    if (p.life > p.max) { smoke.splice(i, 1); continue; }
    const u = p.life / p.max;
    p.x += (p.vx + Math.sin(p.life * 3 + p.spin * 5) * 8) * dt;
    p.y += p.vy * dt;
    const s = p.size * (0.5 + u * 1.3);
    cg.globalAlpha = (1 - u) * (u < 0.15 ? u / 0.15 : 1) * 0.9;
    cg.drawImage(smokePuff, p.x - s / 2, p.y - s / 2, s, s);
  }
  cg.globalAlpha = 1;
  if (finePointer && pointer.active && cursorCloud) {
    cg.drawImage(cursorCloud.img, pointer.x - 4, pointer.y - 4, cursorCloud.w, cursorCloud.h);
  }
}

addEventListener("pointermove", (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  pointer.nx = e.clientX / W - 0.5; pointer.ny = e.clientY / H - 0.5;
  const dist = Math.hypot(e.clientX - lastPuff.x, e.clientY - lastPuff.y);
  if (!reduced && dist > 10) {
    addSmoke(e.clientX + 10, e.clientY + 8, dist > 40 ? 2 : 1, 4);
    lastPuff = { x: e.clientX, y: e.clientY };
  }
}, { passive: true });
document.addEventListener("pointerleave", () => (pointer.active = false));
addEventListener("pointerdown", (e) => { if (!reduced) addSmoke(e.clientX, e.clientY, 6, 8); }, { passive: true });

// ====================================================================== loop
let last = performance.now(), T = 0, slow = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  T += reduced ? 0 : dt;
  if (quality && frames < 180) { // adapt once to slow devices
    frames++;
    if (dt > 0.028) slow++;
    if (frames === 180 && slow > 90) { quality = 0; resize(); }
  }
  g.drawImage(bg, 0, 0, W, H);
  drawMoon(T);
  drawStars(T, dt);
  drawMeteor(T, dt);
  drawCursor(dt);
  if (titleTick) titleTick(T);
}

// ====================================================================== 3D title
let titleTick = null, titleSettled = false;

function buildTitle() {
  const word = $("#word");
  const rows = [{ text: "IEEE RAS", cls: "" }, { text: "INTELLIGENCE", cls: "small" }];
  const layers = W < 700 || !quality ? 9 : 14;
  const total = rows.reduce((n, r) => n + r.text.replace(/ /g, "").length, 0);
  let i = 0;
  word.innerHTML = rows.map(({ text, cls }) => `<div class="row ${cls}">${[...text].map((ch) => {
    if (ch === " ") return `<span class="gap"></span>`;
    const hue = 255 + (i / Math.max(1, total - 1)) * 70; // violet -> magenta across the title
    const html = `<span class="ch" style="--i:${i};--fx:${rand(-60, 60).toFixed(0)}vw;--fy:${rand(-50, 50).toFixed(0)}vh;--frx:${rand(-140, 140).toFixed(0)}deg;--fry:${rand(-160, 160).toFixed(0)}deg">` +
      Array.from({ length: layers }, (_, k) => {
        const z = layers - k;
        return `<i class="${z === layers ? "back" : ""}" style="--z:${z};--h:${hue.toFixed(0)}">${ch}</i>`;
      }).join("") + `<i class="face" style="--z:0">${ch}</i></span>`;
    i++;
    return html;
  }).join("")}</div>`).join("");
}

function settleTitle(instant) {
  const title = $("#title"), word = $("#word");
  if (instant) title.style.transition = "none";
  title.classList.remove("settled");
  const r = word.getBoundingClientRect();
  const s = Math.min(0.42, (W * 0.84) / r.width, (H * 0.2) / r.height);
  const top = Math.max(18, H * 0.04);
  const ty = top + (r.height * s) / 2 - H / 2;
  title.style.setProperty("--ts", s.toFixed(3));
  title.style.setProperty("--ty", `${ty.toFixed(1)}px`);
  title.classList.add("settled");
  document.documentElement.style.setProperty("--title-bottom", `${Math.round(top + r.height * s + 12)}px`);
  if (instant) requestAnimationFrame(() => (title.style.transition = ""));
  titleSettled = true;
}

async function runTitle() {
  const title = $("#title");
  const word = $("#word");
  buildTitle();
  await Promise.race([document.fonts.load('800 100px "Syne"'), new Promise((r) => setTimeout(r, 1500))]);
  if (reduced) {
    title.classList.add("ready");
    settleTitle(true);
    document.body.classList.remove("intro-on");
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => title.classList.add("ready")));
  const start = T;
  titleTick = (t) => {
    const k = t - start, amp = titleSettled ? 0.45 : 1;
    const rx = (Math.cos(k * 0.55) * 7 - (pointer.active ? pointer.ny * 22 : 0)) * amp;
    const ry = (Math.sin(k * 0.65) * 14 + (pointer.active ? pointer.nx * 34 : 0)) * amp;
    word.style.transform = `translateY(${(Math.sin(k * 1.1) * 8 * amp).toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
  };
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const r = word.getBoundingClientRect();
    for (let j = 0; j < 30; j++) addSmoke(rand(r.left, r.right), rand(r.top, r.bottom), 1, 0, 1.4);
    settleTitle(false);
    document.body.classList.remove("intro-on");
    if (finePointer) setTimeout(() => $("#q").focus({ preventScroll: true }), 900);
  };
  setTimeout(finish, 3600);
  addEventListener("keydown", finish, { once: true });
  addEventListener("pointerdown", finish, { once: true });
}

// ====================================================================== ask bar
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safe = (u) => (/^https?:\/\//.test(u || "") ? u : "#");
let pool = [], shown = [], history = [], busy = false, lastQuestion = "", lastText = "";

async function loadQuestions() {
  try { pool = (await (await fetch("/api/questions")).json()).questions; }
  catch { pool = ["What is IEEE RAS?", "Tell me about HackVerse.", "Is RAS VIT Chennai recruiting?"]; }
  shuffleQuestions(true);
}

function shuffleQuestions(first) {
  const list = $("#questions");
  const fresh = pool.filter((q) => !shown.includes(q)).sort(() => Math.random() - 0.5);
  shown = (fresh.length >= 3 ? fresh : [...pool].sort(() => Math.random() - 0.5)).slice(0, 3);
  const paint = () => {
    list.innerHTML = shown.map((q, i) => `<li style="--i:${i}"><button type="button">${esc(q)}</button></li>`).join("");
    requestAnimationFrame(() => list.classList.remove("out"));
  };
  if (first) return paint();
  list.classList.add("out");
  $("#shuffle").classList.toggle("spin");
  setTimeout(paint, 300);
}

function markdown(text, sources) {
  const byN = new Map(sources.map((s) => [String(s.n), s]));
  const inline = (s) => s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d{1,2})\]/g, (m, n) => byN.has(n) ? `<sup><a href="${esc(safe(byN.get(n).url))}" target="_blank" rel="noopener" title="${esc(byN.get(n).title)}">${n}</a></sup>` : m);
  let html = "", list = false, para = [];
  const flush = () => { if (para.length) html += `<p>${inline(para.join(" "))}</p>`; para = []; };
  for (const raw of esc(text).split("\n")) {
    const line = raw.trim();
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { flush(); if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { html += "</ul>"; list = false; }
    if (!line) flush(); else para.push(line.replace(/^#+\s*/, ""));
  }
  flush();
  if (list) html += "</ul>";
  return html;
}

function typeIn(el) {
  if (reduced) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const words = [];
  for (const node of nodes) {
    if (node.parentElement.closest("sup")) continue;
    const frag = document.createDocumentFragment();
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.append(part); continue; }
      const s = document.createElement("span");
      s.className = "w"; s.textContent = part; frag.append(s); words.push(s);
    }
    node.replaceWith(frag);
  }
  let i = 0;
  const step = () => { for (let k = 0; k < 3 && i < words.length; k++) words[i++].classList.add("on"); if (i < words.length) setTimeout(step, 16); };
  step();
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

async function ask(question) {
  question = question.trim();
  if (!question || busy) return;
  busy = true; lastQuestion = question;
  const form = $("#ask");
  form.classList.add("busy");
  form.querySelector("button").disabled = true;
  const panel = $("#answer");
  panel.hidden = false;
  $("#asked").textContent = question;
  $("#reply").innerHTML = `<div class="thinking"><i></i><i></i><i></i><span>Searching the sources</span></div>`;
  $("#srcs").innerHTML = "";
  try {
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.text) throw new Error(data.error || "Something went wrong. Please try again.");
    const note = data.fallback && data.error ? `<p class="note">${esc(data.error)}</p>` : "";
    $("#reply").innerHTML = note + markdown(data.text, data.sources || []);
    $("#srcs").innerHTML = (data.sources || []).map((s) => `<a href="${esc(safe(s.url))}" target="_blank" rel="noopener" title="${esc(s.organization || "")}"><b>${s.n}</b>${esc(s.title)} ↗</a>`).join("");
    lastText = data.text;
    typeIn($("#reply"));
    history.push({ role: "user", content: question }, { role: "assistant", content: data.text });
    history = history.slice(-6);
  } catch (e) {
    const msg = e.message === "Failed to fetch" ? "Can't reach the server. Is it running?" : e.message;
    $("#reply").innerHTML = `<p class="err">${esc(msg)}</p><button class="retry" type="button">Try again</button>`;
    lastText = "";
  } finally {
    busy = false;
    form.classList.remove("busy");
    form.querySelector("button").disabled = !$("#q").value.trim();
    panel.scrollTop = 0;
  }
}

const input = $("#q");
$("#ask").addEventListener("submit", (e) => { e.preventDefault(); const q = input.value; input.value = ""; input.dispatchEvent(new Event("input")); ask(q); });
input.addEventListener("input", () => { $("#ask button").disabled = busy || !input.value.trim(); });
$("#questions").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent); });
$("#shuffle").addEventListener("click", () => shuffleQuestions(false));
$("#close").addEventListener("click", () => ($("#answer").hidden = true));
$("#reply").addEventListener("click", (e) => { if (e.target.closest(".retry")) ask(lastQuestion); });
$("#copy").addEventListener("click", async () => {
  if (!lastText) return;
  try { await navigator.clipboard.writeText(`${lastQuestion}\n\n${lastText}`); toast("Answer copied"); } catch { toast("Couldn't copy"); }
});
addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  if (e.key === "Escape") { if (!$("#answer").hidden) $("#answer").hidden = true; else input.blur(); }
});

// ====================================================================== boot
addEventListener("resize", () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });
resize();
requestAnimationFrame(frame);
runTitle();
loadQuestions();
