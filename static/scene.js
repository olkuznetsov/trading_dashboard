/* ════════════════════════════════════════════════════════════════
   NEURAL TRADE HQ — pixel office scene v2 (PixiJS 7)
   Art: LimeZu "Modern Interiors" free (non-commercial) + Kenney
   1-Bit Pack (CC0) for ghost/emotes/glyphs. See assets/CREDITS.txt.
   Driven by parsed bot-log events via window.OfficeBus.
   ════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const A_LIMEZU = '/static/assets/limezu/';
const A_ONEBIT = '/static/assets/onebit.png';

const PT = 16;                 // source pixel tile
const Z = 3;                   // zoom
const T = PT * Z;              // 48px world tile
const W = 1056, H = 480;       // virtual world
const SEP_X = 672;             // office | right-wing separator
const KITCH_Y = 240;           // kitchen floor ends
const LOUNGE_Y = 336;          // lounge floor starts

const C = {
  cyan: 0x00f0ff, magenta: 0xff4fc3, yellow: 0xffd34d, purple: 0xb37aff,
  green: 0x3dff8a, red: 0xff4d6a, white: 0xe8e2d0, dim: 0x6a7090,
  navy: 0x12152b, frame: 0x6e4a2f, border: 0x191c2e,
};

// ── onebit atlas bits (ghost / emotes / fx / glyphs) ─────────
const OB = {
  ghost: [27,8],
  faceHappy: [35,14], faceAngry: [36,14], faceDead: [37,14], faceJoy: [38,14],
  bubHeart: [35,15], bubSad: [36,15], bubX: [37,15], bubO: [38,15],
  excl: [35,13], quest: [37,13], cup: [46,2], note: [46,5],
  spark1: [27,12], spark2: [28,12], spark3: [29,12], dust: [26,14],
};
function glyphTile(ch) {
  if (ch >= '0' && ch <= '3') return [35 + (ch.charCodeAt(0) - 48), 17];
  if (ch >= '4' && ch <= '9') return [39 + (ch.charCodeAt(0) - 52), 17];
  if (ch === ':') return [45,17];
  if (ch === '.') return [46,17];
  if (ch === '%') return [47,17];
  if (ch === '+') return [36,20];
  if (ch === '-') return [37,20];
  if (ch === '$') return [35,16];
  if (ch >= 'A' && ch <= 'D') return [35 + (ch.charCodeAt(0) - 65), 18];
  if (ch >= 'E' && ch <= 'M') return [39 + (ch.charCodeAt(0) - 69), 18];
  if (ch >= 'N' && ch <= 'Q') return [35 + (ch.charCodeAt(0) - 78), 19];
  if (ch >= 'R' && ch <= 'Z') return [39 + (ch.charCodeAt(0) - 82), 19];
  return null;
}

// ── boot ─────────────────────────────────────────────────────
const host = document.getElementById('scene');
if (!host || !window.PIXI) return;

PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
PIXI.settings.ROUND_PIXELS = true;
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

const app = new PIXI.Application({
  background: '#0d0e16', antialias: false,
  autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2),
});
host.appendChild(app.view);

const root = new PIXI.Container();
app.stage.addChild(root);
window.__app = app; window.__root = root;
function fit() {
  const cw = host.clientWidth, ch = host.clientHeight;
  if (!cw || !ch) return;
  app.renderer.resize(cw, ch);
  const s = Math.min(cw / W, ch / H);
  root.scale.set(s);
  root.x = (cw - W * s) / 2;
  root.y = (ch - H * s) / 2;
}
new ResizeObserver(fit).observe(host);

const floorL = new PIXI.Container();                       // floors/walls/wall decor
const worldL = new PIXI.Container(); worldL.sortableChildren = true;
const fxL = new PIXI.Container();
const overlayL = new PIXI.Container();
root.addChild(floorL, worldL, fxL, overlayL);

const fontReady = document.fonts
  ? document.fonts.load("10px 'Press Start 2P'").catch(() => {})
  : Promise.resolve();

// texture helpers
const bases = {};
function texFrom(base, c0, r0, cw = 1, rh = 1) {
  return new PIXI.Texture(bases[base],
    new PIXI.Rectangle(c0 * PT, r0 * PT, cw * PT, rh * PT));
}
function ob(cr, tint = 0xffffff, scale = Z) {
  const s = new PIXI.Sprite(texFrom('onebit', cr[0], cr[1]));
  s.tint = tint; s.scale.set(scale);
  return s;
}
function ptext(str, px, color) {
  return new PIXI.Text(str, {
    fontFamily: "'Press Start 2P', monospace", fontSize: px,
    fill: color, resolution: 2,
  });
}
function tileText(str, tint, scale = 1, gap = 1) {
  const c = new PIXI.Container();
  let x = 0;
  for (const raw of str.toUpperCase()) {
    if (raw === ' ') { x += 10 * scale; continue; }
    const g = glyphTile(raw);
    if (!g) { x += 10 * scale; continue; }
    const s = ob(g, tint, scale);
    s.x = x; c.addChild(s);
    x += (PT + gap) * scale;
  }
  return c;
}

// ── load all textures, then build ────────────────────────────
const charNames = ['adam', 'alex', 'amelia', 'bob', 'paper'];
const urls = {
  room: A_LIMEZU + 'room.png',
  interiors: A_LIMEZU + 'interiors.png',
  monitor: A_LIMEZU + 'monitor.png',
  onebit: A_ONEBIT,
};
charNames.forEach(n => urls['ch_' + n] = A_LIMEZU + `char_${n}.png`);

Promise.all([
  fontReady,
  ...Object.entries(urls).map(([k, u]) =>
    PIXI.Assets.load(u).then(t => { bases[k] = t.baseTexture; })),
]).then(build).catch(e => console.error('scene load failed', e));

// ════════════════════════════════════════════════════════════
function build() {

// ── room: floors + walls ─────────────────────────────────────
function tileFill(base, picks, x0, y0, x1, y1) {
  // picks: array of [c,r] source tiles for a 2x2-ish repeating pattern
  let i = 0;
  for (let y = y0; y < y1; y += T) {
    for (let x = x0; x < x1; x += T) {
      const p = picks[(Math.floor(x / T) + Math.floor(y / T)) % picks.length];
      const s = new PIXI.Sprite(texFrom(base, p[0], p[1]));
      s.scale.set(Z); s.x = x; s.y = y;
      floorL.addChild(s); i++;
    }
  }
}
// office herringbone floor (room builder 11..12,13..14)
tileFill('room', [[11,13],[12,13]], 0, 96, SEP_X, H);
// kitchen gray stone (11..12,11..12)
tileFill('room', [[11,11],[12,11]], SEP_X, 96, W, KITCH_Y);
// lounge teal (11..12,9..10)
tileFill('room', [[11,9],[12,9]], SEP_X, LOUNGE_Y, W, H);

// wall bands: office beige (1,19)/(1,20); kitchen mint (1,9)/(1,10)
function wallBand(x0, x1, topY, topTile, botTile) {
  for (let x = x0; x < x1; x += T) {
    const a = new PIXI.Sprite(texFrom('room', topTile[0], topTile[1]));
    a.scale.set(Z); a.x = x; a.y = topY;
    const b = new PIXI.Sprite(texFrom('room', botTile[0], botTile[1]));
    b.scale.set(Z); b.x = x; b.y = topY + T;
    floorL.addChild(a, b);
  }
}
wallBand(0, SEP_X, 0, [1,19], [1,20]);          // office top wall
wallBand(SEP_X, W, 0, [1,9], [1,10]);           // kitchen top wall
wallBand(SEP_X, W, KITCH_Y, [1,17], [1,18]);    // kitchen|lounge separator

// borders + separator with door gaps
(function borders() {
  const g = new PIXI.Graphics();
  g.beginFill(C.border);
  g.drawRect(0, 0, W, 6); g.drawRect(0, H - 8, W, 8);
  g.drawRect(0, 0, 6, H); g.drawRect(W - 6, 0, 6, H);
  // office|wing separator (gaps: kitchen door 216..288, lounge door 348..458)
  g.drawRect(SEP_X - 5, 0, 10, 216);
  g.drawRect(SEP_X - 5, 288, 10, 348 - 288);
  g.drawRect(SEP_X - 5, 458, 10, H - 458);
  // kitchen|lounge gap in wall band drawn over: doorway at x 900..966
  g.endFill();
  // doorway cut for kitchen|lounge: redraw floor strip over wall band
  floorL.addChild(g);
  const cut = new PIXI.Graphics();
  cut.beginFill(0x000000, 0).endFill();
  floorL.addChild(cut);
  for (let x = 900; x < 966; x += T) {
    const s = new PIXI.Sprite(texFrom('room', 11, 9));
    s.scale.set(Z); s.x = x; s.y = KITCH_Y;
    const s2 = new PIXI.Sprite(texFrom('room', 11, 9));
    s2.scale.set(Z); s2.x = x; s2.y = KITCH_Y + T;
    floorL.addChild(s, s2);
  }
  // bottom door mat (news runs)
  const mat = new PIXI.Graphics();
  mat.beginFill(0x232838).drawRoundedRect(300, H - 26, 72, 22, 4).endFill();
  mat.beginFill(C.border).drawRect(300, H - 8, 72, 8).endFill();
  floorL.addChild(mat);
})();

// ── furniture ────────────────────────────────────────────────
function furn(c0, r0, cw, rh, x, y, opts = {}) {
  const s = new PIXI.Sprite(texFrom('interiors', c0, r0, cw, rh));
  s.scale.set((opts.flip ? -1 : 1) * Z, Z);
  if (opts.flip) s.x = x + cw * T; else s.x = x;
  s.y = y;
  s.zIndex = opts.z ?? (y + rh * T);
  (opts.layer || worldL).addChild(s);
  return s;
}

// office: double desks with built-in screens (0,33)-(2,34), screen at right
// rowA y 168, rowB y 330 — mirrored desk (screen left) + normal (screen right)
[[168], [330]].forEach(([dy]) => {
  furn(0, 33, 3, 2, 288, dy, { flip: true });   // screen at left end (x 288..336)
  furn(0, 33, 3, 2, 432, dy);                   // screen at right end (x 528..576)
});
// desk screen glow pulses
const deskGlows = [];
[[300, 180], [536, 180], [300, 342], [536, 342]].forEach(([gx, gy]) => {
  const g = new PIXI.Graphics();
  g.beginFill(0x86b8ff, 0.16).drawRoundedRect(0, 0, 30, 20, 3).endFill();
  g.x = gx; g.y = gy; g.zIndex = gy + 200;
  worldL.addChild(g);
  deskGlows.push(g);
});
// chairs under brains
furn(9, 31, 1, 2, 234, 180, { z: 240 });
furn(14, 31, 1, 2, 582, 180, { z: 240 });
furn(9, 31, 1, 2, 234, 342, { z: 402 });
furn(14, 31, 1, 2, 582, 342, { z: 402 });

// bookshelf + plants (office)
furn(4, 14, 2, 4, 24, 100);
furn(0, 49, 1, 2, 30, 290);
furn(10, 44, 1, 2, 616, 96);
furn(13, 44, 1, 2, 610, 372);
// paper intern school desk (office bottom-left)
furn(0, 36, 2, 2, 48, 372);

// kitchen: fridge, vending, server shelf, table + treats
furn(13, 2, 1, 3, 692, 76);
furn(2, 18, 3, 3, 756, 76);
const rackBase = furn(10, 68, 2, 3, 936, 76);
const rackLights = new PIXI.Graphics();
rackLights.x = 948; rackLights.y = 98; rackLights.zIndex = 6000;
worldL.addChild(rackLights);
furn(5, 7, 2, 2, 780, 132);
furn(10, 13, 1, 1, 796, 128, { z: 5000 });
furn(11, 13, 1, 1, 836, 136, { z: 5000 });

// lounge: fireplace, couch, pillows, globe, wall art
const fire = furn(3, 68, 2, 3, 692, 232);
furn(6, 13, 3, 2, 808, 360);
furn(9, 74, 1, 1, 820, 356, { z: 9000 });
furn(10, 75, 1, 1, 906, 356, { z: 9000 });
furn(10, 66, 1, 2, 984, 364);
furn(8, 67, 2, 1, 844, 268, { layer: floorL });
furn(7, 21, 2, 1, 956, 270, { layer: floorL });

// fire flicker glow
const fireGlow = new PIXI.Graphics();
fireGlow.beginFill(0xff9a3d, 0.10).drawCircle(0, 0, 60).endFill();
fireGlow.x = 740; fireGlow.y = 350; fireGlow.zIndex = 1;
floorL.addChild(fireGlow);

// ── wall data panels (office) ────────────────────────────────
function panel(x, w, accent, titleStr) {
  const cont = new PIXI.Container();
  cont.x = x; cont.y = 10;
  const g = new PIXI.Graphics();
  g.beginFill(C.frame).drawRoundedRect(-4, -4, w + 8, 86, 4).endFill();
  g.beginFill(C.navy, 0.98).drawRect(0, 0, w, 78).endFill();
  g.lineStyle(1.5, accent, 0.5).drawRect(2, 2, w - 4, 74);
  cont.addChild(g);
  const title = ptext(titleStr, 7, accent);
  title.x = 7; title.y = 6;
  cont.addChild(title);
  const body = new PIXI.Container();
  body.x = 7; body.y = 22;
  cont.addChild(body);
  floorL.addChild(cont);
  const maxChars = Math.floor((w - 14) / 7.4);
  return {
    accent,
    set(rows) {
      body.removeChildren();
      rows.slice(0, 4).forEach((r, i) => {
        const t = ptext(String(r[0]).slice(0, maxChars), 7, r[1] ?? C.white);
        t.y = i * 14;
        body.addChild(t);
      });
    },
    flash() {
      let n = 0;
      const iv = setInterval(() => {
        cont.alpha = cont.alpha === 1 ? 0.5 : 1;
        if (++n > 5) { clearInterval(iv); cont.alpha = 1; }
      }, 90);
    },
  };
}
const scoresBoard  = panel(14, 152, C.cyan, 'SETUP SCORES');
const posBoard     = panel(178, 152, C.magenta, 'POSITIONS');
const cautionBoard = panel(342, 152, C.yellow, 'CAUTIONS');
const tuneBoard    = panel(506, 152, C.purple, 'AI CONFIG');
scoresBoard.set([['waiting for scan...', C.dim]]);
posBoard.set([['no open positions', C.dim]]);
cautionBoard.set([['no cautions yet', C.dim]]);
tuneBoard.set([['loading...', C.dim]]);

// kitchen wall ticker
let tickerTexts = {};
(function ticker() {
  const cont = new PIXI.Container();
  cont.x = 686; cont.y = 10;
  const g = new PIXI.Graphics();
  g.beginFill(C.frame).drawRoundedRect(-4, -4, 366, 68, 4).endFill();
  g.beginFill(0x0a0c1a, 0.98).drawRect(0, 0, 358, 60).endFill();
  cont.addChild(g);
  const logo = tileText('NEURAL TRADE HQ', C.cyan, 0.85, 1);
  logo.x = 8; logo.y = 4;
  cont.addChild(logo);
  tickerTexts.l1 = ptext('PNL --  WR --  OPEN --', 8, C.green);
  tickerTexts.l1.x = 8; tickerTexts.l1.y = 30;
  tickerTexts.l2 = ptext('CYCLE --  TRADES --', 8, 0x8a93b8);
  tickerTexts.l2.x = 8; tickerTexts.l2.y = 46;
  cont.addChild(tickerTexts.l1, tickerTexts.l2);
  floorL.addChild(cont);
})();

// offline overlay
const dark = new PIXI.Graphics();
dark.beginFill(0x05060d, 0.62).drawRect(0, 0, W, H).endFill();
dark.visible = false;
overlayL.addChild(dark);
const offlineSign = tileText('OFFLINE', C.red, 2, 2);
offlineSign.x = W / 2 - offlineSign.width / 2; offlineSign.y = H / 2 - 70;
offlineSign.visible = false;
overlayL.addChild(offlineSign);

// ── particles ────────────────────────────────────────────────
const parts = [];
function emit(cr, x, y, opts = {}) {
  const s = ob(cr, opts.tint ?? 0xffffff, opts.scale ?? 1.5);
  s.anchor.set(0.5);
  s.x = x; s.y = y;
  fxL.addChild(s);
  parts.push({
    s, life: opts.life ?? 700, t: 0,
    vx: opts.vx ?? (Math.random() - 0.5) * 60,
    vy: opts.vy ?? -30 - Math.random() * 40,
    g: opts.g ?? 0, vr: opts.vr ?? 0,
  });
}
function confetti() {
  const tints = [C.cyan, C.magenta, C.yellow, C.green, C.purple];
  for (let i = 0; i < 50; i++) {
    emit([OB.spark1, OB.spark2, OB.spark3][i % 3],
      Math.random() * W, 80 + Math.random() * 50, {
        tint: tints[i % 5], vy: 50 + Math.random() * 90,
        vx: (Math.random() - 0.5) * 40, life: 2200 + Math.random() * 800,
        vr: (Math.random() - 0.5) * 6, scale: 1 + Math.random(),
      });
  }
}

// ── characters ───────────────────────────────────────────────
// combined sheet: row0 run RULD×6, row1 idle RULD×6, row2 sit3 R×6 L×6 + static RULD
const DIR = { R: 0, U: 1, L: 2, D: 3 };
function charFrames(key) {
  const f = (x, y) => new PIXI.Texture(bases[key], new PIXI.Rectangle(x * 16, y, 16, 32));
  const run = [], idle = [];
  for (let d = 0; d < 4; d++) {
    run.push([0,1,2,3,4,5].map(i => f(d * 6 + i, 0)));
    idle.push([0,1,2,3,4,5].map(i => f(d * 6 + i, 32)));
  }
  const sitR = [0,1,2,3,4,5].map(i => f(i, 64));
  const sitL = [0,1,2,3,4,5].map(i => f(6 + i, 64));
  const stat = [0,1,2,3].map(i => f(12 + i, 64));
  return { run, idle, sitR, sitL, stat };
}

function makeActor(key, sheet, tint, label, station) {
  const frames = charFrames(sheet);
  const c = new PIXI.Container();
  const shadow = new PIXI.Graphics();
  shadow.beginFill(0x000000, 0.35).drawEllipse(0, 0, 13, 5).endFill();
  shadow.y = 1;
  const body = new PIXI.Sprite(frames.idle[DIR.D][0]);
  body.anchor.set(0.5, 1);
  body.scale.set(Z);
  if (tint) body.tint = tint;
  const nm = ptext(label, 7, station.color);
  nm.anchor.set(0.5, 0); nm.y = -104; nm.alpha = 0.85;
  c.addChild(shadow, body, nm);
  c.x = station.sit ? station.sit.x : station.stand.x;
  c.y = station.sit ? station.sit.y : station.stand.y;
  worldL.addChild(c);

  const bubBg = new PIXI.Graphics();
  const bubTx = ptext('', 8, 0xffffff);
  const bub = new PIXI.Container();
  bub.addChild(bubBg, bubTx); bub.visible = false;
  fxL.addChild(bub);
  let emoteSpr = null;

  const a = {
    key, c, body, frames, station, color: station.color,
    path: [], cb: null, state: 'work', dir: station.sit ? station.sit.dir : 'D',
    speed: 120, busyUntil: 0,
    idleAt: performance.now() + 4000 + Math.random() * 6000,
    sleeping: false, animT: 0, animF: 0, dustT: 0,

    routeTo(x, y, cb) {
      const pts = [];
      const fromLeft = this.c.x < SEP_X, toLeft = x < SEP_X;
      if (fromLeft !== toLeft) {
        const doorY = ((this.c.y + y) / 2) < 310 ? 252 : 403;
        pts.push({ x: SEP_X, y: doorY });
      } else if (!fromLeft && !toLeft) {
        const fromKitchen = this.c.y < KITCH_Y + 40, toKitchen = y < KITCH_Y + 40;
        if (fromKitchen !== toKitchen) pts.push({ x: 933, y: 290 });
      }
      pts.push({ x, y });
      this.path = pts; this.cb = cb || null; this.state = 'walk';
    },
    stop() { this.path = []; this.state = 'idle'; },

    sitDown() {
      if (!this.station.sit) { this.state = 'idle'; return; }
      this.c.x = this.station.sit.x; this.c.y = this.station.sit.y;
      this.dir = this.station.sit.dir;
      this.state = 'work';
    },

    say(text, ms = 3400) {
      const clean = String(text).replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 44);
      if (!clean) return;
      bubTx.text = clean;
      bubBg.clear();
      const w = bubTx.width + 14, h = bubTx.height + 10;
      bubBg.beginFill(0x10131f, 0.95).drawRoundedRect(0, 0, w, h, 5).endFill();
      bubBg.lineStyle(1.5, this.color, 0.85).drawRoundedRect(0, 0, w, h, 5);
      bubBg.moveTo(12, h).lineTo(18, h + 6).lineTo(24, h);
      bubTx.x = 7; bubTx.y = 5;
      bub.visible = true;
      this._bubW = w; this._bubH = h;
      clearTimeout(this._bt);
      this._bt = setTimeout(() => { bub.visible = false; }, ms);
    },

    emote(cr, ms = 2200, tint = 0xffffff) {
      if (emoteSpr) { fxL.removeChild(emoteSpr); emoteSpr = null; }
      emoteSpr = ob(cr, tint, 2);
      emoteSpr.anchor.set(0.5, 1);
      fxL.addChild(emoteSpr);
      clearTimeout(this._et);
      this._et = setTimeout(() => {
        if (emoteSpr) { fxL.removeChild(emoteSpr); emoteSpr = null; }
      }, ms);
    },

    busy(ms) { this.busyUntil = performance.now() + ms; },
    isBusy() { return performance.now() < this.busyUntil; },

    setFrame(tex) { this.body.texture = tex; },

    tick(dms, now) {
      this.animT += dms;
      const fr = this.frames;

      if (this.path.length) {
        const t = this.path[0];
        const dx = t.x - this.c.x, dy = t.y - this.c.y;
        const d = Math.hypot(dx, dy);
        const step = this.speed * dms / 1000;
        if (d <= step) {
          this.c.x = t.x; this.c.y = t.y;
          this.path.shift();
          if (!this.path.length) {
            this.state = 'idle';
            const cb = this.cb; this.cb = null; cb && cb();
          }
        } else {
          this.c.x += dx / d * step; this.c.y += dy / d * step;
          this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
          if (this.animT > 90) { this.animT = 0; this.animF = (this.animF + 1) % 6; }
          this.setFrame(fr.run[DIR[this.dir]][this.animF]);
          this.dustT += dms;
          if (this.dustT > 260) {
            this.dustT = 0;
            emit(OB.dust, this.c.x, this.c.y - 2, { tint: 0x8a93b8, vy: -6, vx: 0, life: 360, scale: 1 });
          }
        }
      } else if (this.sleeping) {
        this.setFrame(fr.stat[DIR.D]);
        this.body.y = Math.sin(now / 650) * 1.5;
        if (!this._zt || now - this._zt > 1500) {
          this._zt = now;
          const z = ptext('z', 9, 0x9aa3c8);
          z.x = this.c.x + 10; z.y = this.c.y - 100;
          fxL.addChild(z);
          parts.push({ s: z, life: 1300, t: 0, vx: 9, vy: -20, g: 0, vr: 0 });
        }
      } else if (this.state === 'work' && this.station.sit) {
        const arr = this.station.sit.dir === 'R' ? fr.sitR : fr.sitL;
        if (this.animT > 160) { this.animT = 0; this.animF = (this.animF + 1) % 6; }
        this.setFrame(arr[this.animF % 6]);
        this.body.y = 0;
      } else if (this.state === 'celebrate') {
        this.setFrame(fr.idle[DIR.D][this.animF % 6]);
        if (this.animT > 110) { this.animT = 0; this.animF++; }
        this.body.y = -Math.abs(Math.sin(now / 120)) * 12;
      } else if (this.state === 'sad') {
        this.setFrame(fr.stat[DIR.D]);
        this.body.y = 3;
      } else {
        const d = DIR[this.dir] ?? DIR.D;
        if (this.animT > 140) { this.animT = 0; this.animF = (this.animF + 1) % 6; }
        this.setFrame(fr.idle[d][this.animF]);
        this.body.y = 0;
      }

      this.c.zIndex = this.c.y;
      if (bub.visible) {
        bub.x = Math.min(Math.max(this.c.x - (this._bubW || 40) / 2, 4), W - (this._bubW || 40) - 4);
        bub.y = this.c.y - 106 - (this._bubH || 18);
      }
      if (emoteSpr) { emoteSpr.x = this.c.x + 16; emoteSpr.y = this.c.y - 98; }
    },
  };
  return a;
}

// stations: sit = desk chair spot; stand = fallback work spot
const STATIONS = {
  brain1: { color: C.cyan,    sit: { x: 252, y: 252, dir: 'R' }, panelSpot: { x: 90, y: 230 } },
  brain2: { color: C.magenta, sit: { x: 612, y: 252, dir: 'L' }, panelSpot: { x: 254, y: 230 } },
  brain3: { color: C.yellow,  sit: { x: 252, y: 414, dir: 'R' }, panelSpot: { x: 418, y: 230 } },
  brain4: { color: C.purple,  sit: { x: 612, y: 414, dir: 'L' }, panelSpot: { x: 582, y: 230 } },
  paper:  { color: C.green,   stand: { x: 96, y: 470 } },
};
const COFFEE = { x: 850, y: 262 };
const COUCH  = [{ x: 850, y: 452 }, { x: 920, y: 452 }, { x: 790, y: 460 }, { x: 968, y: 462 }, { x: 730, y: 446 }];
const DOOR_BOTTOM = { x: 336, y: 462 };

const A = {
  brain1: makeActor('brain1', 'ch_adam',   0, 'BRAIN1', STATIONS.brain1),
  brain2: makeActor('brain2', 'ch_alex',   0, 'BRAIN2', STATIONS.brain2),
  brain3: makeActor('brain3', 'ch_amelia', 0, 'BRAIN3', STATIONS.brain3),
  brain4: makeActor('brain4', 'ch_bob',    0, 'BRAIN4', STATIONS.brain4),
  paper:  makeActor('paper',  'ch_paper',  0, 'PAPER',  STATIONS.paper),
};
A.paper.state = 'idle'; A.paper.dir = 'D';

// shadow ghost
const ghost = (() => {
  const c = new PIXI.Container();
  const body = ob(OB.ghost, 0xcfd8ff, Z);
  body.anchor.set(0.5, 1);
  body.alpha = 0.55;
  const nm = ptext('SHADOW', 7, 0x9aa6e8);
  nm.anchor.set(0.5, 0); nm.y = -76; nm.alpha = 0.7;
  c.addChild(body, nm);
  c.x = 432; c.y = 300; c.zIndex = 300;
  worldL.addChild(c);
  const bubBg = new PIXI.Graphics();
  const bubTx = ptext('', 8, 0xffffff);
  const bub = new PIXI.Container();
  bub.addChild(bubBg, bubTx); bub.visible = false;
  fxL.addChild(bub);
  return {
    c, body, bub, t: 0, cx: 432, cy: 296, rx: 150, ry: 40, dashTo: null,
    _bubW: 0, _bubH: 0,
    say(text, ms = 3000) {
      const clean = String(text).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!clean) return;
      bubTx.text = clean;
      bubBg.clear();
      const w = bubTx.width + 14, h = bubTx.height + 10;
      bubBg.beginFill(0x10131f, 0.95).drawRoundedRect(0, 0, w, h, 5).endFill();
      bubBg.lineStyle(1.5, 0x9aa6e8, 0.85).drawRoundedRect(0, 0, w, h, 5);
      bubTx.x = 7; bubTx.y = 5;
      bub.visible = true;
      this._bubW = w; this._bubH = h;
      clearTimeout(this._bt);
      this._bt = setTimeout(() => { bub.visible = false; }, ms);
    },
  };
})();

// ── idle behaviours ──────────────────────────────────────────
function clampFloor(x, y) {
  return { x: Math.min(Math.max(x, 30), W - 30), y: Math.min(Math.max(y, 215), H - 16) };
}
function backToWork(a) {
  if (a.station.sit) {
    a.routeTo(a.station.sit.x, a.station.sit.y, () => a.sitDown());
  } else {
    a.routeTo(a.station.stand.x, a.station.stand.y, () => {
      a.state = 'idle'; a.dir = 'D';
    });
  }
}
function idleThink(a, now) {
  if (a.sleeping || a.isBusy() || a.state === 'walk' || now < a.idleAt) return;
  a.idleAt = now + 7000 + Math.random() * 11000;
  const r = Math.random();
  if (a.state !== 'work' && r < 0.5) { backToWork(a); return; }
  if (r < 0.12) {                              // coffee run
    a.busy(9000);
    const p = clampFloor(COFFEE.x + (Math.random() * 50 - 25), COFFEE.y + (Math.random() * 16 - 8));
    a.routeTo(p.x, p.y, () => {
      a.emote(OB.cup, 2600, 0xffffff);
      setTimeout(() => backToWork(a), 2800);
    });
  } else if (r < 0.2) {                        // visit a colleague
    const others = Object.values(A).filter(o => o !== a && !o.sleeping);
    const o = others[Math.floor(Math.random() * others.length)];
    a.busy(8000);
    const p = clampFloor(o.c.x + (a.c.x < o.c.x ? -40 : 40), o.c.y + 4);
    a.routeTo(p.x, p.y, () => {
      a.say('...', 1800);
      setTimeout(() => { if (!o.sleeping) o.say('...', 1500); }, 600);
      setTimeout(() => backToWork(a), 2600);
    });
  } else if (r < 0.26 && a.key === 'paper') {  // intern stretches legs
    const p = clampFloor(a.c.x + (Math.random() - 0.5) * 160, a.c.y + (Math.random() - 0.5) * 60);
    a.routeTo(p.x, p.y);
  }
}

// ── event handling ───────────────────────────────────────────
let online = null, cycleN = null;
let newsCool = 0, cautionCool = 0, vetoCool = 0, scanCool = 0;

function workBurst(a, ms, sayTxt) {
  if (a.sleeping) return;
  a.busy(ms);
  if (sayTxt) a.say(sayTxt);
  if (a.state !== 'work' && a.state !== 'walk') backToWork(a);
}

function celebrateAll(text) {
  Object.values(A).forEach((a, i) => {
    a.sleeping = false; a.busy(4400); a.stop();
    setTimeout(() => {
      a.state = 'celebrate';
      a.emote([OB.faceJoy, OB.faceHappy][i % 2], 3600);
      setTimeout(() => { if (a.state === 'celebrate') backToWork(a); }, 3600);
    }, i * 120);
  });
  A.brain2.say(text, 4200);
  confetti();
}
function mournAll(text) {
  Object.values(A).forEach((a, i) => {
    a.busy(4000); a.stop();
    a.state = 'sad';
    if (i % 2 === 0) a.emote(OB.faceDead, 3200);
    setTimeout(() => { if (a.state === 'sad') backToWork(a); }, 4000);
  });
  A.brain2.say(text, 4200);
}

function handleEvent(ev) {
  const now = performance.now();
  switch (ev.actor) {
    case 'brain1': {
      const a = A.brain1;
      if (ev.action === 'scan') {
        if (ev.scores && ev.scores.length) {
          scoresBoard.set(ev.scores.slice(0, 4).map(s => [
            `${s[0].padEnd(5)} ${s[1][0]} ${s[2]}`,
            s[1] === 'LONG' ? C.green : C.red,
          ]));
          scoresBoard.flash();
        }
        if (now > scanCool && !a.sleeping) {
          scanCool = now + 25000;
          a.busy(7000);
          a.routeTo(STATIONS.brain1.panelSpot.x, STATIONS.brain1.panelSpot.y, () => {
            a.dir = 'U'; a.state = 'idle';
            a.emote(OB.quest, 2000);
            setTimeout(() => backToWork(a), 2600);
          });
        }
      } else if (ev.action === 'decide_trade') {
        a.sleeping = false; a.busy(4200); a.stop();
        a.state = 'celebrate'; a.emote(OB.bubO, 3000, C.green);
        a.say(ev.text.replace(/^.*Brain1:\s*/i, ''), 4200);
        setTimeout(() => backToWork(a), 3200);
      } else if (ev.action === 'decide_hold') {
        workBurst(a, 2600, ev.text.replace(/^.*Brain1:\s*/i, ''));
      } else if (ev.action === 'blocked') {
        a.emote(OB.bubX, 2200, C.red);
        workBurst(a, 2000);
      } else {
        workBurst(a, 2200);
      }
      break;
    }
    case 'brain2': {
      const a = A.brain2;
      if (ev.action === 'decide_close') {
        a.busy(3800); a.emote(OB.excl, 2600, C.red);
        a.say(ev.text.replace(/^.*Brain2:\s*/i, ''), 4000);
        posBoard.flash();
      } else if (ev.action === 'decide_hold') {
        workBurst(a, 2600, ev.text.replace(/^.*Brain2:\s*/i, ''));
      } else {
        workBurst(a, 2200);
      }
      break;
    }
    case 'brain3': {
      const a = A.brain3;
      if (ev.action === 'caution' && now > cautionCool && !a.sleeping) {
        cautionCool = now + 35000;
        a.busy(11000);
        a.say(ev.text.slice(0, 40), 2400);
        const note = ob(OB.note, C.yellow, 2);
        note.anchor.set(0.5); fxL.addChild(note);
        const iv = setInterval(() => { note.x = a.c.x + 16; note.y = a.c.y - 70; }, 16);
        a.routeTo(A.brain1.c.x + 44, A.brain1.c.y + 6, () => {
          clearInterval(iv);
          note.x = A.brain1.c.x + 18; note.y = A.brain1.c.y - 80;
          A.brain1.emote(OB.excl, 2000, C.yellow);
          A.brain1.say('ok, noted', 2000);
          setTimeout(() => { fxL.removeChild(note); backToWork(a); }, 1600);
        });
      } else if (ev.action === 'learn') {
        workBurst(a, 3400, ev.text.replace(/^.*(learned|read|pattern):\s*/i, ''));
        emit(OB.spark2, 416, 96, { tint: C.yellow, life: 900 });
      } else {
        workBurst(a, 2200);
      }
      break;
    }
    case 'brain4': {
      const a = A.brain4;
      if (ev.action === 'tune_start' || ev.action === 'tune') {
        workBurst(a, 3200, ev.action === 'tune_start' ? 'optimizing params...' : null);
        tuneBoard.flash();
      } else {
        workBurst(a, 2200);
      }
      break;
    }
    case 'shadow':
      if (ev.action === 'veto' && now > vetoCool) {
        vetoCool = now + 15000;
        ghost.dashTo = { x: A.brain2.c.x + 36, y: A.brain2.c.y - 24, until: now + 4200 };
        ghost.say('VETO! too early', 3200);
        A.brain2.emote(OB.bubX, 2600, C.red);
      } else {
        ghost.body.alpha = 0.9;
        setTimeout(() => ghost.body.alpha = 0.55, 1200);
      }
      break;
    case 'paper': {
      const a = A.paper;
      if (ev.action === 'paper_win') {
        a.emote(OB.faceHappy, 2600, C.green);
        a.say('filter was right!', 2600);
      } else if (ev.action === 'paper_loss') {
        const ok = /Filter CORRECT/i.test(ev.text);
        a.emote(ok ? OB.faceHappy : OB.faceAngry, 2600, ok ? C.green : C.red);
        a.say(ok ? 'good block!' : 'should have traded', 2600);
      } else if (ev.action === 'news' && now > newsCool && !a.sleeping) {
        newsCool = now + 45000;
        a.busy(12000);
        a.routeTo(DOOR_BOTTOM.x, DOOR_BOTTOM.y, () => {
          a.emote(OB.note, 1600, 0xffffff);
          a.routeTo(A.brain1.c.x - 46, A.brain1.c.y + 6, () => {
            a.say('fresh news!', 2000);
            A.brain1.say('thanks', 1600);
            a.routeTo(STATIONS.paper.stand.x, STATIONS.paper.stand.y, () => { a.dir = 'U'; });
          });
        });
      } else {
        if (!a.isBusy() && a.state !== 'walk') { a.dir = 'U'; a.emote(OB.note, 1500, 0xffffff); }
      }
      break;
    }
    case 'office':
      if (ev.action === 'win') celebrateAll(ev.text);
      else if (ev.action === 'loss') mournAll(ev.text);
      else if (ev.action === 'opened') {
        const a = A.brain1, b = A.brain2;
        if (!a.sleeping && !b.sleeping) {
          a.busy(7000); b.busy(7000);
          const mx = 432, my = 290;
          a.routeTo(mx - 26, my, () => { a.state = 'celebrate'; setTimeout(() => backToWork(a), 2000); });
          b.routeTo(mx + 26, my, () => {
            b.state = 'celebrate';
            emit(OB.spark1, mx, my - 70, { tint: C.green, life: 1000, scale: 2 });
            b.say(ev.text.replace(/^.*Journal:\s*/i, ''), 3000);
            setTimeout(() => { backToWork(a); backToWork(b); }, 2100);
          });
        }
      }
      else if (ev.action === 'closed') workBurst(A.brain2, 3000, ev.text.slice(0, 44));
      else if (ev.action === 'cycle') {
        cycleN = ev.cycle; updateTicker();
        emit(OB.spark3, 700, 100, { tint: C.green, life: 700 });
      }
      else if (ev.action === 'error') {
        Object.values(A).forEach(a => a.emote(OB.excl, 2200, C.red));
        flashRed();
      }
      break;
  }
}

let redFlash = null;
function flashRed() {
  if (!redFlash) {
    redFlash = new PIXI.Graphics();
    redFlash.beginFill(C.red, 0.13).drawRect(0, 0, W, H).endFill();
    overlayL.addChild(redFlash);
  }
  redFlash.alpha = 1;
  setTimeout(() => { redFlash.alpha = 0; }, 260);
  setTimeout(() => { redFlash.alpha = 0.7; }, 420);
  setTimeout(() => { redFlash.alpha = 0; }, 650);
}

// ── live data → boards/ticker ────────────────────────────────
let lastStatus = null;

function updateTicker() {
  if (!tickerTexts.l1 || !lastStatus) return;
  const cs = lastStatus.closed_summary;
  const openN = Object.keys(lastStatus.open_trades || {}).length;
  tickerTexts.l1.text =
    `PNL ${(cs.total_pnl_usdt >= 0 ? '+' : '')}${cs.total_pnl_usdt.toFixed(2)}  WR ${cs.win_rate}%  OPEN ${openN}`;
  tickerTexts.l1.style.fill = cs.total_pnl_usdt >= 0 ? C.green : C.red;
  tickerTexts.l2.text =
    `CYCLE ${cycleN ?? '--'}  TRADES ${cs.total_trades}  ${cs.wins}W/${cs.losses}L`;
}

function setStatus(st) {
  lastStatus = st;
  updateTicker();
  const keys = Object.keys(st.open_trades || {});
  if (keys.length) {
    posBoard.set(keys.slice(0, 4).map(k => {
      const t = st.open_trades[k];
      const sym = k.split('/')[0];
      return [`${sym.padEnd(6)} ${t.side === 'buy' ? 'L' : 'S'} ${t.leverage}x @${t.entry_price}`,
              t.side === 'buy' ? C.green : C.red];
    }));
  } else {
    posBoard.set([['no open positions', C.dim]]);
  }
  const isOn = !!st.bot.running;
  if (online === null || online !== isOn) {
    online = isOn;
    dark.visible = !isOn;
    offlineSign.visible = !isOn;
    if (!isOn) {
      Object.values(A).forEach((a, i) => {
        a.busy(99999999); a.stop(); a.sleeping = false;
        const p = COUCH[i % COUCH.length];
        a.routeTo(p.x, p.y, () => { a.sleeping = true; });
      });
      ghost.body.alpha = 0.22;
    } else {
      Object.values(A).forEach(a => {
        a.sleeping = false; a.busyUntil = 0;
        backToWork(a);
      });
      ghost.body.alpha = 0.55;
    }
  }
}

function setBrains(b) {
  if (b.cautions && b.cautions.length) {
    cautionBoard.set(b.cautions.slice(0, 4).map(c =>
      [`${c.symbol}: ${c.note.slice(0, 24)}`, C.yellow]));
  } else {
    cautionBoard.set([['no cautions yet', C.dim]]);
  }
  const cfg = b.config || {};
  tuneBoard.set([
    [`CONF L${cfg.confidence_min_long ?? '--'} S${cfg.confidence_min_short ?? '--'}`, C.purple],
    [`TRAIL ${cfg.trail_activation_pct ?? '-'}/${cfg.trail_keep_pct ?? '-'}`, C.white],
    [`SHDW ${b.shadow?.global_stats?.pct_too_early ?? '--'}% early`, 0x9aa6e8],
    [`PPR ${b.paper?.filter_correct ?? 0}ok ${b.paper?.filter_wrong ?? 0}bad`, C.green],
  ]);
}

// ── main loop ────────────────────────────────────────────────
let rackT = 0;
app.ticker.add(() => {
  const dms = app.ticker.deltaMS;
  const now = performance.now();

  Object.values(A).forEach(a => { a.tick(dms, now); idleThink(a, now); });

  // ghost float / dash
  ghost.t += dms / 1000;
  if (ghost.dashTo && now < ghost.dashTo.until) {
    ghost.c.x += (ghost.dashTo.x - ghost.c.x) * 0.08;
    ghost.c.y += (ghost.dashTo.y - ghost.c.y) * 0.08;
  } else {
    ghost.dashTo = null;
    ghost.c.x = ghost.cx + Math.cos(ghost.t * 0.35) * ghost.rx;
    ghost.c.y = ghost.cy + Math.sin(ghost.t * 0.7) * ghost.ry;
  }
  ghost.body.y = Math.sin(ghost.t * 2.2) * 4;
  ghost.c.zIndex = ghost.c.y + 60;
  if (ghost.bub.visible) {
    ghost.bub.x = Math.min(Math.max(ghost.c.x - ghost._bubW / 2, 4), W - ghost._bubW - 4);
    ghost.bub.y = ghost.c.y - 80 - ghost._bubH;
  }

  // particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dms;
    p.s.x += p.vx * dms / 1000;
    p.s.y += p.vy * dms / 1000;
    if (p.vr) p.s.rotation += p.vr * dms / 1000;
    p.s.alpha = 1 - p.t / p.life;
    if (p.t >= p.life) { p.s.parent?.removeChild(p.s); parts.splice(i, 1); }
  }

  // server shelf lights
  rackT += dms;
  if (rackT > 450) {
    rackT = 0;
    rackLights.clear();
    const colors = [C.green, C.green, C.yellow, C.red, 0x2a3050];
    for (let i = 0; i < 6; i++) {
      rackLights.beginFill(colors[Math.floor(Math.random() * colors.length)], 0.95)
        .drawRect((i % 2) * 10, Math.floor(i / 2) * 12, 4, 4).endFill();
    }
  }

  // desk screen + fire glow pulses
  deskGlows.forEach((g, i) => { g.alpha = 0.5 + Math.sin(now / 600 + i * 1.4) * 0.3; });
  fireGlow.alpha = 0.75 + Math.sin(now / 180) * 0.25;
});

// ── bus hookup ───────────────────────────────────────────────
const bus = window.OfficeBus = window.OfficeBus || { q: [] };
bus.flush = function () {
  while (bus.q.length) {
    const m = bus.q.shift();
    try {
      if (m.type === 'events') m.events.forEach(handleEvent);
      else if (m.type === 'status') setStatus(m.data);
      else if (m.type === 'brains') setBrains(m.data);
    } catch (e) { console.error('scene event error', e); }
  }
};
fit();
bus.flush();
window.__sceneDebug = { actors: A, ghost, stations: STATIONS };
}
})();
