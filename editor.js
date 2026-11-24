// Free-form showcase editor.
import { api } from './api.js';
import { buildRoom, itemEl, itemStyle, refreshBg, THEMES, SIZES, LABELS, FONTS, CARD_RATIO, SLAB_RATIO, uid, template } from './render.js';
import { pickFile, cropDialog, shrink, exportRoom } from './image.js';
import { toast, confirmDlg, esc, ensureName, I } from './ui.js';

const RATIO_LOCK = { card: 1, slab: 1, photo: 1, sticker: 1, slot: 1 };
const TNAME = { card: '카드', slab: '슬랩', photo: '사진', text: '텍스트', shelf: '선반', riser: '받침대', stand: '스탠드', light: '조명', sticker: '스티커', shape: '도형', slot: '카드 자리' };
const EMOJI = '⭐ ✨ 💎 🔥 ⚡ 💧 🌿 🌙 ☀️ ❤️ 💜 💛 🏆 👑 🎉 🎀 🎁 🍀 🌸 🌈 ☁️ ❄️ 🎮 🃏 📦 🔒 🏷️ 💯 ✅ 🆕 ‼️ ❓ 🐾 🥚 🍙 🎌'.split(' ');
const COLORS = ['#111111', '#ffffff', '#ff5a1f', '#ff3d8b', '#ffd23f', '#19c3a3', '#2c5cff', '#7c5cff', '#8a5a32', '#c9a23a', '#d8232a', '#9aa3ad'];

export async function openEditor(root, { id, tpl }) {
  const me = await ensureName('쇼케이스를 꾸미려면 닉네임이 필요해요');
  if (!me) { location.hash = '#/'; return; }
  let meta = { id: null, title: '나의 쇼케이스', intro: '', is_public: true, cover: null };
  let doc;
  if (id) {
    const s = await api.get(id);
    if (!s || !s.mine) { toast('내 쇼케이스만 고칠 수 있어요'); location.hash = '#/me'; return; }
    meta = { id: s.id, title: s.title, intro: s.intro, is_public: s.is_public, cover: s.cover };
    doc = s.doc && s.doc.items ? s.doc : template('blank');
    try {
      const dr = JSON.parse(localStorage.getItem('pokeca-draft-' + s.id) || 'null');
      if (dr && dr.t > Date.parse(s.updated_at) + 2000 && await confirmDlg('저장하지 않은 변경이 있어요', '이 기기에서 마지막으로 고치던 내용을 불러올까요?', '불러오기', '버리기')) { doc = dr.doc; meta.title = dr.meta?.title || meta.title; }
    } catch (e) {}
  } else doc = template(tpl || 'glass3');
  doc.items.forEach(it => { if (!it.id) it.id = uid(); });

  root.innerHTML = `<div class="ed">
    <div class="ed-bar">
      <button class="btn ghost icon sm" data-back title="나가기">${I.back}</button>
      <input class="ttl" maxlength="40" value="${esc(meta.title)}" aria-label="쇼케이스 제목">
      <span class="st" data-st></span>
      <button class="btn ghost icon sm" data-undo title="되돌리기 (Ctrl+Z)">${I.undo}</button>
      <button class="btn ghost icon sm" data-redo title="다시 하기">${I.redo}</button>
      <button class="btn soft sm hide-m" data-prev>${I.eye} 미리보기</button>
      <button class="btn sm" data-save>저장</button>
    </div>
    <nav class="ed-rail">${tabBtns()}</nav>
    <section class="ed-panel"></section>
    <div class="ed-stage"><div class="canvas"></div><div class="ed-zoom"><button data-zo>−</button><span data-zv>100%</span><button data-zi>＋</button><button data-zf title="화면에 맞추기">⤢</button></div></div>
    <aside class="ed-insp"></aside>
    <nav class="ed-tabs">${tabBtns(true)}</nav>
  </div>`;
  const $ = s => root.querySelector(s);
  const stage = $('.ed-stage'), canvas = $('.canvas'), panel = $('.ed-panel'), insp = $('.ed-insp');
  const mobile = () => innerWidth < 900;
  let room, sel = null, tab = 'add', z = 1, ox = 0, oy = 0, dirty = false, hist = [], fut = [], lastKey = '', lastT = 0;
  const url = p => api.url(p);
  const byId = i => doc.items.find(x => x.id === i);
  const maxZ = () => doc.items.reduce((m, x) => Math.max(m, x.z || 0), 0);

  function tabBtns(m) {
    const t = [['add', I.plus, '추가'], ['bg', I.image, '배경'], ['layers', I.layers, '레이어'], ['info', I.info, '정보']];
    if (m) t.splice(1, 0, ['edit', I.sliders, '편집']);
    return t.map(([k, ic, l]) => `<button data-tab="${k}">${ic}<span>${l}</span></button>`).join('');
  }

  // ---------- history ----------
  function snap(key) {
    const now = Date.now();
    if (key && key === lastKey && now - lastT < 900) { lastT = now; return; }
    hist.push(JSON.stringify(doc)); if (hist.length > 80) hist.shift(); fut = []; lastKey = key || ''; lastT = now;
  }
  function touched() { dirty = true; $('[data-st]').textContent = '저장 안 됨'; try { localStorage.setItem('pokeca-draft-' + (meta.id || 'new'), JSON.stringify({ meta: { ...meta, title: $('.ttl').value }, doc, t: Date.now() })); } catch (e) {} }
  function undo() { if (!hist.length) return; fut.push(JSON.stringify(doc)); doc = JSON.parse(hist.pop()); lastKey = ''; afterDocSwap(); }
  function redo() { if (!fut.length) return; hist.push(JSON.stringify(doc)); doc = JSON.parse(fut.pop()); lastKey = ''; afterDocSwap(); }
  function afterDocSwap() { if (sel && !byId(sel)) sel = null; build(); renderPanel(); renderInsp(); touched(); }

  // ---------- room ----------
  function build() {
    canvas.innerHTML = ''; room = buildRoom(doc, url, { edit: true }); canvas.appendChild(room); applyView(); drawSel();
  }
  function fit() {
    const r = stage.getBoundingClientRect(); const pad = mobile() ? 14 : 40;
    z = Math.min((r.width - pad * 2) / doc.w, (r.height - pad * 2) / doc.h);
    ox = (r.width - doc.w * z) / 2; oy = (r.height - doc.h * z) / 2; applyView();
  }
  function applyView() { canvas.style.transform = `translate(${ox}px,${oy}px) scale(${z})`; $('[data-zv]').textContent = Math.round(z * 100) + '%'; drawSel(); }
  function zoomAt(f, cx, cy) {
    const nz = Math.min(4, Math.max(0.05, z * f)); ox = cx - (cx - ox) * (nz / z); oy = cy - (cy - oy) * (nz / z); z = nz; applyView();
  }
  function elOf(i) { return room.querySelector(`.it[data-id="${i}"]`); }
  function updEl(it, full) {
    const el = elOf(it.id); if (!el) return;
    if (full) { const n = itemEl(it, url); if (it.id === sel) n.classList.add('selected'); el.replaceWith(n); }
    else el.setAttribute('style', itemStyle(it));
  }

  // ---------- selection overlay ----------
  const selEl = document.createElement('div'); selEl.className = 'sel'; stage.appendChild(selEl);
  const guides = document.createElement('div'); stage.appendChild(guides);
  function drawSel() {
    const it = sel && byId(sel);
    room?.querySelectorAll('.it.selected').forEach(n => n.classList.remove('selected'));
    if (!it) { selEl.hidden = true; return; }
    elOf(it.id)?.classList.add('selected');
    selEl.hidden = false; selEl.className = 'sel' + (it.lock ? ' locked' : '');
    Object.assign(selEl.style, { left: ox + it.x * z + 'px', top: oy + it.y * z + 'px', width: it.w * z + 'px', height: it.h * z + 'px', transform: `rotate(${it.r || 0}deg)` });
    const free = !RATIO_LOCK[it.t];
    selEl.innerHTML = `<div class="box"></div>${['nw', 'ne', 'sw', 'se'].map(h => `<i class="h ${h}" data-h="${h}"></i>`).join('')}${free ? '<i class="h e" data-h="e"></i><i class="h s" data-h="s"></i>' : ''}<i class="h rot" data-h="rot"></i>`;
  }
  function select(i) { sel = i; drawSel(); renderInsp(); if (tab === 'layers') renderPanel(); if (mobile()) openSheet(i ? 'edit' : null); }

  // ---------- pointer gestures ----------
  const pts = new Map(); let g = null;
  const toRoom = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - ox) / z, y: (cy - r.top - oy) / z }; };
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.ed-zoom')) return;
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { startPinch(); return; }
    const h = e.target.closest('.h'); const itEl = e.target.closest('.it');
    const p = toRoom(e.clientX, e.clientY);
    if (h && sel) { const it = byId(sel); g = { mode: h.dataset.h === 'rot' ? 'rot' : 'size', h: h.dataset.h, it, o: { ...it }, p, moved: false }; return; }
    if (itEl && !itEl.classList.contains('t-light-pass')) {
      const it = byId(itEl.dataset.id);
      if (it.t === 'slot' && sel === it.id && !it.lock) { /* second tap on slot handled on up */ }
      if (sel !== it.id) select(it.id);
      if (!it.lock) { g = { mode: 'move', it, o: { ...it }, p, moved: false, slotTap: it.t === 'slot' }; return; }
    } else if (!h) { if (sel) select(null); }
    g = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox, oy, moved: false };
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.mode === 'pinch') { doPinch(); return; }
    if (g.mode === 'pan') { ox = g.ox + e.clientX - g.sx; oy = g.oy + e.clientY - g.sy; if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 3) g.moved = true; applyView(); return; }
    const p = toRoom(e.clientX, e.clientY), it = g.it;
    if (!g.moved) { if (Math.hypot(p.x - g.p.x, p.y - g.p.y) * z < 4) return; g.moved = true; snap('g' + Date.now()); }
    if (g.mode === 'move') {
      let nx = g.o.x + p.x - g.p.x, ny = g.o.y + p.y - g.p.y;
      if (!e.altKey) ({ nx, ny } = snapMove(it, nx, ny));
      it.x = Math.round(nx); it.y = Math.round(ny);
    } else if (g.mode === 'rot') {
      const cx = g.o.x + g.o.w / 2, cy = g.o.y + g.o.h / 2;
      let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90; a = ((a + 540) % 360) - 180;
      const s = Math.round(a / 15) * 15; if (e.shiftKey || Math.abs(a - s) < 3.5) a = s;
      it.r = Math.round(a * 10) / 10;
    } else resize(it, g, p, e.shiftKey);
    updEl(it); drawSel(); syncInsp();
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (g?.mode === 'pinch') { if (pts.size < 2) { g = null; clearGuides(); touched(); } return; }
    if (g && g.mode !== 'pan' && g.moved) touched();
    if (g?.slotTap && !g.moved) fillSlot(g.it);
    if (g && g.mode === 'pan' && !g.moved && mobile() && !sel) openSheet(null);
    g = null; clearGuides();
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', e => {
    e.preventDefault(); const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { ox -= e.deltaX; oy -= e.deltaY; applyView(); }
  }, { passive: false });

  function startPinch() {
    const [a, b] = [...pts.values()]; const it = sel && byId(sel);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const onItem = it && !it.lock && g && g.mode !== 'pan' && g.it === it;
    g = { mode: 'pinch', item: onItem ? it : null, o: onItem ? { ...it } : null, d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), z0: z, ox0: ox, oy0: oy, mid0: mid };
    if (onItem) snap('pinch' + Date.now());
  }
  function doPinch() {
    const [a, b] = [...pts.values()]; if (!a || !b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), k = d / g.d0;
    if (g.item) {
      const it = g.item, o = g.o, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      it.w = Math.max(20, o.w * k); it.h = Math.max(20, o.h * k); it.x = Math.round(cx - it.w / 2); it.y = Math.round(cy - it.h / 2); it.w = Math.round(it.w); it.h = Math.round(it.h);
      it.r = Math.round(((o.r || 0) + (ang - g.a0) * 180 / Math.PI) * 10) / 10;
      updEl(it, it.t === 'sticker'); drawSel(); syncInsp();
    } else {
      const r = stage.getBoundingClientRect(); const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, m0 = { x: g.mid0.x - r.left, y: g.mid0.y - r.top };
      const nz = Math.min(4, Math.max(0.05, g.z0 * k));
      ox = mid.x - (m0.x - g.ox0) * (nz / g.z0); oy = mid.y - (m0.y - g.oy0) * (nz / g.z0); z = nz; applyView();
    }
  }
  function resize(it, g, p, free) {
    const o = g.o, th = (o.r || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const lx = (p.x - cx) * cos + (p.y - cy) * sin, ly = -(p.x - cx) * sin + (p.y - cy) * cos; // pointer in local
    const h = g.h; let sx = h.includes('w') ? -1 : h.includes('e') ? 1 : 0, sy = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
    if (h === 'e') sy = 0; if (h === 's') sx = 0;
    const ax = -sx * o.w / 2, ay = -sy * o.h / 2; // anchor (opposite) in local
    let w = sx ? Math.max(16, Math.abs(lx - ax)) : o.w, hh = sy ? Math.max(16, Math.abs(ly - ay)) : o.h;
    const lockR = RATIO_LOCK[it.t] ? !free : (free && sx && sy);
    if (lockR && sx && sy || (RATIO_LOCK[it.t] && !free)) { const k = Math.max(w / o.w, hh / o.h); w = o.w * k; hh = o.h * k; }
    const ncx = sx ? ax + sx * w / 2 : 0, ncy = sy ? ay + sy * hh / 2 : 0; // new local center
    const wx = cx + ncx * cos - ncy * sin, wy = cy + ncx * sin + ncy * cos;
    it.w = Math.round(w); it.h = Math.round(hh); it.x = Math.round(wx - w / 2); it.y = Math.round(wy - hh / 2);
    if (it.t === 'sticker' || it.t === 'text') updEl(it, true);
  }

  // snapping
  function clearGuides() { guides.innerHTML = ''; }
  function snapMove(it, nx, ny) {
    const th = 7 / z; const lx = [0, doc.w / 2, doc.w], ly = [0, doc.h / 2, doc.h];
    doc.items.forEach(o => { if (o.id === it.id || o.t === 'light') return; lx.push(o.x, o.x + o.w / 2, o.x + o.w); ly.push(o.y, o.y + o.h / 2, o.y + o.h); });
    const cand = (v, size, lines) => { let best = null; [0, size / 2, size].forEach(off => lines.forEach(L => { const d = L - (v + off); if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, L }; })); return best; };
    const bx = cand(nx, it.w, lx), by = cand(ny, it.h, ly);
    let html = '';
    if (bx) { nx += bx.d; html += `<div class="guide v" style="left:${ox + bx.L * z}px"></div>`; }
    if (by) { ny += by.d; html += `<div class="guide h2" style="top:${oy + by.L * z}px"></div>`; }
    guides.innerHTML = html; return { nx, ny };
  }

  // ---------- adding things ----------
  function center() { const r = stage.getBoundingClientRect(); const p = toRoom(r.left + r.width / 2, r.top + r.height / 2); return { x: Math.min(Math.max(p.x, 80), doc.w - 80), y: Math.min(Math.max(p.y, 80), doc.h - 80) }; }
  function add(it, at) {
    snap(); const c = at || center(); it.id = uid(); it.z = maxZ() + 1; it.r = it.r || 0; it.shadow = it.shadow ?? 0.6;
    it.x = Math.round(c.x - it.w / 2); it.y = Math.round(c.y - it.h / 2);
    doc.items.push(it); room.querySelector('.items').appendChild(itemEl(it, url)); select(it.id); touched(); return it;
  }
  async function upload(kind, opts = {}) {
    const file = await pickFile(); if (!file) return null;
    const ratio = kind === 'photo' ? null : CARD_RATIO;
    const r = await cropDialog(file, { ratio: opts.ratio ?? ratio, title: opts.title || '사진 자르기' }); if (!r) return null;
    const busy = toast('사진을 올리는 중…', 60000);
    try { const path = await api.upload(r.blob, `${Date.now().toString(36)}-${uid()}.${r.blob.type === 'image/webp' ? 'webp' : 'jpg'}`); busy.close(); return { path, w: r.w, h: r.h }; }
    catch (e) { busy.close(); toast(e.message); return null; }
  }
  const unit = () => Math.round(Math.min(doc.w, doc.h) * 0.26);
  const ADD = {
    async card() { const u = await upload('card'); if (!u) return; const w = unit(); add({ t: 'card', src: u.path, w, h: Math.round(w * u.h / u.w), holo: 'none', sleeve: 'none', radius: 4.5 }); },
    async slab() { const u = await upload('card', { title: '슬랩에 넣을 카드 사진' }); if (!u) return; const w = Math.round(unit() * 1.05); add({ t: 'slab', src: u.path, w, h: Math.round(w * SLAB_RATIO), l1: '카드 이름', l2: '세트 · 번호', gl: 'GEM MT', grade: '10', lc: 'red', style: 'clear' }); },
    async photo() { const u = await upload('photo', { title: '사진 자르기 (자유 비율)' }); if (!u) return; const w = Math.round(unit() * 1.4); add({ t: 'photo', src: u.path, w, h: Math.round(w * u.h / u.w), frame: 'none' }); },
    text() { add({ t: 'text', text: '나의 컬렉션', font: 'display', size: Math.round(doc.w * 0.06), color: '#111111', weight: 700, align: 'center', w: Math.round(doc.w * 0.6), h: Math.round(doc.w * 0.1), shadow: 0 }); },
    shelf() { add({ t: 'shelf', mat: 'wood', w: Math.round(doc.w * 0.86), h: Math.round(doc.w * 0.035) }); },
    riser() { add({ t: 'riser', mat: 'acrylic', w: Math.round(unit() * 1.3), h: Math.round(unit() * 0.35) }); },
    stand() { add({ t: 'stand', mat: 'acrylic', w: Math.round(unit() * 0.7), h: Math.round(unit() * 0.5) }); },
    light() { add({ t: 'light', color: '#fff4d6', power: 0.7, w: Math.round(doc.w * 0.45), h: Math.round(doc.h * 0.4), shadow: 0 }, { x: center().x, y: doc.h * 0.18 }); },
    sticker() { add({ t: 'sticker', emoji: '⭐', w: Math.round(unit() * 0.6), h: Math.round(unit() * 0.6) }); },
    shape() { add({ t: 'shape', kind: 'round', fill: 'velvet', c: '#2a2a2a', rad: 28, w: Math.round(unit() * 1.6), h: Math.round(unit() * 1.6), shadow: 0.4 }); },
    slot() { const w = unit(); add({ t: 'slot', kind: 'card', w, h: Math.round(w * CARD_RATIO), shadow: 0 }); },
    async multi() {
      const files = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.onchange = () => res([...i.files]); i.click(); });
      if (!files.length) return; const c = center(); const w = unit();
      for (let k = 0; k < files.length && k < 20; k++) {
        const r = await cropDialog(files[k], { ratio: CARD_RATIO, title: `카드 ${k + 1} / ${Math.min(files.length, 20)}` }); if (!r) continue;
        const busy = toast('사진을 올리는 중…', 60000);
        try { const path = await api.upload(r.blob, `${Date.now().toString(36)}-${uid()}.webp`); busy.close();
          add({ t: 'card', src: path, w, h: Math.round(w * r.h / r.w), holo: 'none', sleeve: 'none', radius: 4.5 }, { x: c.x + (k % 4) * w * 0.35 - w * 0.5, y: c.y + Math.floor(k / 4) * w * 0.3 });
        } catch (e) { busy.close(); toast(e.message); break; }
      }
    },
  };
  async function fillSlot(slot) {
    const isSlab = slot.kind === 'slab';
    const u = await upload('card', { title: isSlab ? '슬랩에 넣을 카드 사진' : '카드 사진 자르기' }); if (!u) return;
    snap();
    const it = isSlab ? { t: 'slab', src: u.path, l1: '카드 이름', l2: '세트 · 번호', gl: 'GEM MT', grade: '10', lc: 'red', style: 'clear' } : { t: 'card', src: u.path, holo: 'none', sleeve: 'none', radius: 4.5 };
    Object.assign(it, { id: uid(), x: slot.x, y: slot.y, w: slot.w, h: isSlab ? slot.h : Math.round(slot.w * u.h / u.w), r: slot.r, z: slot.z, shadow: 0.6 });
    if (!isSlab) it.y = slot.y + slot.h - it.h;
    doc.items[doc.items.indexOf(slot)] = it; const el = elOf(slot.id); el.replaceWith(itemEl(it, url)); select(it.id); touched();
  }

  // ---------- panels ----------
  function setTab(t) {
    tab = t; root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === t));
    if (mobile()) { openSheet(t === 'edit' ? 'edit' : t); return; }
    renderPanel();
  }
  function openSheet(which) {
    if (!mobile()) return;
    if (which === 'edit' && sel) { tab = 'edit'; panel.classList.add('closed'); insp.classList.remove('closed'); renderInsp(); keepVisible(); }
    else if (which && which !== 'edit') { tab = which; insp.classList.add('closed'); panel.classList.remove('closed'); renderPanel(); }
    else { panel.classList.add('closed'); insp.classList.add('closed'); tab = ''; }
    root.querySelectorAll('.ed-tabs [data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab));
  }
  function keepVisible() {
    const it = sel && byId(sel); if (!it) return;
    const r = stage.getBoundingClientRect(); const sheetTop = innerHeight * 0.54 - 62 - r.top; // visible height above the sheet
    const cy = oy + (it.y + it.h / 2) * z;
    if (cy > sheetTop - 30) { const target = Math.max(40, sheetTop * 0.55); oy += target - cy; canvas.style.transition = 'transform .25s'; applyView(); setTimeout(() => canvas.style.transition = '', 260); }
  }
  function renderPanel() {
    if (tab === 'add' || !tab || tab === 'edit') {
      if (tab === 'edit' && mobile()) return;
      panel.innerHTML = `<h4>카드 · 사진</h4><div class="addgrid">
        ${addBtn('card', '🃏', '카드 사진')}${addBtn('slab', '🏅', '슬랩(등급)')}${addBtn('multi', '📚', '여러 장')}${addBtn('photo', '🖼️', '사진·액자')}${addBtn('slot', '⬚', '카드 자리')}${addBtn('text', '🔤', '글자')}</div>
        <h4>진열 소품</h4><div class="addgrid">${addBtn('shelf', '➖', '선반')}${addBtn('riser', '🧱', '받침대')}${addBtn('stand', '🔺', '스탠드')}${addBtn('light', '💡', '조명')}${addBtn('sticker', '⭐', '스티커')}${addBtn('shape', '⬛', '도형·매트')}</div>
        <p class="note">팁: 카드를 끌어서 옮기고, 모서리로 크기, 위쪽 동그라미로 회전해요. 휴대폰은 두 손가락으로 크기와 각도를 한 번에 바꿀 수 있어요. 빈 곳을 끌면 화면이 움직여요.</p>`;
      panel.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { if (mobile()) openSheet(null); ADD[b.dataset.add](); });
    } else if (tab === 'bg') {
      const b = doc.bg;
      panel.innerHTML = `<h4>배경 테마</h4><div class="themes">${Object.entries(THEMES).map(([k, t]) => `<button data-th="${k}" aria-pressed="${b.theme === k}"><div class="sw"><div class="bg th-${k}" style="--c1:${t.c1};--c2:${t.c2}"><i class="bg-detail"></i></div></div><b>${t.label}</b></button>`).join('')}</div>
        <h4>색</h4><div class="ctl full"><span>색 1</span><input type="color" data-c="c1" value="${b.c1}"></div><div class="ctl full"><span>색 2</span><input type="color" data-c="c2" value="${b.c2}"></div>
        ${b.theme === 'photo' ? `<button class="btn soft sm" data-bgimg>${I.image} 배경 사진 올리기</button>` : ''}
        <h4>분위기</h4>
        <label class="toggle">유리 케이스 프레임<input type="checkbox" data-case ${b.case ? 'checked' : ''}></label>
        ${range('조명', 'light', b.light ?? .6, 0, 1, .05)}${range('색온도', 'warm', b.warm ?? 0, -1, 1, .05)}${range('필름 질감', 'grain', b.grain ?? .2, 0, 1, .05)}
        <h4>캔버스 크기</h4><div class="chips">${Object.entries(SIZES).map(([k, s]) => `<button data-size="${k}" aria-pressed="${doc.size === k}">${s.label}</button>`).join('')}</div>
        <p class="note">크기를 바꿔도 놓아둔 물건은 그대로 있어요. 밖으로 나간 물건은 레이어에서 골라 옮겨 주세요.</p>`;
      panel.querySelectorAll('[data-th]').forEach(x => x.onclick = () => { snap(); const t = THEMES[x.dataset.th]; Object.assign(doc.bg, { theme: x.dataset.th, c1: t.c1, c2: t.c2 }); refreshBg(room, doc, url); renderPanel(); touched(); });
      panel.querySelectorAll('[data-c]').forEach(x => x.oninput = () => { snap('c' + x.dataset.c); doc.bg[x.dataset.c] = x.value; refreshBg(room, doc, url); touched(); });
      panel.querySelector('[data-case]').onchange = e => { snap(); doc.bg.case = e.target.checked; refreshBg(room, doc, url); touched(); };
      panel.querySelectorAll('input[type=range][data-k]').forEach(x => x.oninput = () => { snap('bg' + x.dataset.k); doc.bg[x.dataset.k] = +x.value; x.nextElementSibling.textContent = (+x.value).toFixed(2); refreshBg(room, doc, url); touched(); });
      panel.querySelectorAll('[data-size]').forEach(x => x.onclick = () => { snap(); const s = SIZES[x.dataset.size]; Object.assign(doc, { size: x.dataset.size, w: s.w, h: s.h }); refreshBg(room, doc, url); fit(); renderPanel(); touched(); });
      const bi = panel.querySelector('[data-bgimg]'); if (bi) bi.onclick = async () => {
        const f = await pickFile(); if (!f) return; const busy = toast('배경을 올리는 중…', 60000);
        try { const r = await shrink(f, 2600); const p = await api.upload(r.blob, `bg-${Date.now().toString(36)}.${r.blob.type === 'image/webp' ? 'webp' : 'jpg'}`); snap(); doc.bg.img = p; refreshBg(room, doc, url); touched(); } catch (e) { toast(e.message); } busy.close();
      };
    } else if (tab === 'layers') {
      const list = [...doc.items].sort((a, b) => (b.z || 0) - (a.z || 0));
      panel.innerHTML = `<h4>레이어 (${list.length})</h4><div class="layers">${list.map(it => `<button data-ly="${it.id}" aria-pressed="${it.id === sel}"><span class="lt" style="${it.src ? `background-image:url('${esc(url(it.src))}')` : ''}">${it.src ? '' : layerIcon(it)}</span><span class="ln">${esc(it.t === 'text' ? (it.text || '').slice(0, 18) : TNAME[it.t])}</span>${it.lock ? '🔒' : ''}</button>`).join('') || '<p class="note">아직 아무것도 없어요.</p>'}</div>`;
      panel.querySelectorAll('[data-ly]').forEach(x => x.onclick = () => { select(x.dataset.ly); renderPanel(); });
    } else if (tab === 'info') {
      panel.innerHTML = `<h4>쇼케이스 정보</h4>
        <div class="field"><span>제목</span><input data-f="title" maxlength="40" value="${esc($('.ttl').value)}"></div>
        <div class="field"><span>소개 (200자까지)</span><textarea data-f="intro" maxlength="200">${esc(meta.intro)}</textarea></div>
        <label class="toggle">둘러보기에 공개<input type="checkbox" data-pub ${meta.is_public ? 'checked' : ''}></label>
        <p class="note">비공개로 하면 링크를 가진 사람도 볼 수 없고 나만 볼 수 있어요.</p>
        <h4>내보내기</h4>
        <div class="chips"><button data-act="preview">미리보기</button><button data-act="png">이미지로 저장</button></div>
        ${meta.id ? '<h4>위험</h4><button class="btn danger sm" data-act="del">이 쇼케이스 삭제</button>' : ''}`;
      panel.querySelector('[data-f="title"]').oninput = e => { $('.ttl').value = e.target.value; touched(); };
      panel.querySelector('[data-f="intro"]').oninput = e => { meta.intro = e.target.value; touched(); };
      panel.querySelector('[data-pub]').onchange = e => { meta.is_public = e.target.checked; touched(); };
      panel.querySelectorAll('[data-act]').forEach(x => x.onclick = () => ({ preview, png: savePng, del: delRoom })[x.dataset.act]());
    }
  }
  const addBtn = (k, em, l) => `<button data-add="${k}"><span class="em">${em}</span>${l}</button>`;
  const range = (label, k, v, min, max, step, dataAttr = 'data-k') => `<div class="ctl"><span>${label}</span><input type="range" ${dataAttr}="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${(+v).toFixed(step < 1 ? 2 : 0)}</output></div>`;
  const layerIcon = it => ({ text: '🔤', shelf: '➖', riser: '🧱', stand: '🔺', light: '💡', sticker: it.emoji || '⭐', shape: '⬛', slot: '⬚', card: '🃏', slab: '🏅', photo: '🖼️' })[it.t];

  // ---------- inspector ----------
  function renderInsp() {
    const it = sel && byId(sel);
    if (!it) { insp.innerHTML = mobile() ? '' : `<h4>선택한 물건</h4><p class="note">캔버스에서 카드나 소품을 누르면 여기서 자세히 꾸밀 수 있어요.</p>`; return; }
    const pct = Math.round(it.w / doc.w * 100);
    let h = `<h4>${TNAME[it.t]}</h4>
      <div class="acts"><button data-a="front">${I.up}앞으로</button><button data-a="back">${I.down}뒤로</button><button data-a="dup">${I.copy}복제</button><button data-a="lock" class="${it.lock ? 'on' : ''}">${it.lock ? I.lock : I.unlock}${it.lock ? '잠김' : '잠금'}</button>
      <button data-a="flip">${I.flip}반전</button><button data-a="center">${I.center}가운데</button><button data-a="reset">${I.reset}기울기 0</button><button data-a="del" class="del">${I.trash}삭제</button></div>`;
    if (it.t === 'slot') h += `<button class="btn sm" data-a="fill" style="width:100%;margin-bottom:12px">${I.image} 여기에 카드 사진 넣기</button><div class="chips" style="margin-bottom:12px"><button data-slot="card" aria-pressed="${it.kind !== 'slab'}">카드</button><button data-slot="slab" aria-pressed="${it.kind === 'slab'}">슬랩</button></div>`;
    if (it.src) h += `<button class="btn soft sm" data-a="src" style="width:100%;margin-bottom:12px">${I.image} 사진 바꾸기</button>`;
    h += range('크기', 'size', pct, 2, 160, 1, 'data-p') + range('회전', 'r', it.r || 0, -180, 180, 1, 'data-p');
    if (!['light', 'text'].includes(it.t)) h += range('앞뒤 기울기', 'tx', it.tx || 0, -40, 40, 1, 'data-p') + range('좌우 기울기', 'ty', it.ty || 0, -50, 50, 1, 'data-p');
    if (!['light', 'slot'].includes(it.t)) h += range('그림자', 'shadow', it.shadow ?? .6, 0, 1.5, .05, 'data-p');
    h += range('투명도', 'o', it.o ?? 1, 0.1, 1, .05, 'data-p');
    if (it.t === 'card') h += `<h4>홀로 효과</h4>${chips('holo', it.holo || 'none', { none: '없음', rainbow: '레인보우', gold: '골드', sparkle: '반짝이' })}
      <h4>보호 케이스</h4>${chips('sleeve', it.sleeve || 'none', { none: '없음', clear: '슬리브', toploader: '탑로더' })}<div style="height:10px"></div>${range('모서리', 'radius', it.radius ?? 4.5, 0, 12, .5, 'data-p')}`;
    if (it.t === 'slab') h += `<h4>라벨</h4>${txt('l1', '1줄', it.l1)}${txt('l2', '2줄', it.l2)}${txt('gl', '등급 문구', it.gl)}${txt('grade', '점수', it.grade)}
      <div class="ctl full"><span>라벨 색</span><div class="swatches">${Object.entries(LABELS).map(([k, [c]]) => `<button data-lc="${k}" style="background:${c}" aria-pressed="${(it.lc || 'red') === k}"></button>`).join('')}</div></div>
      <h4>케이스</h4>${chips('style', it.style || 'clear', { clear: '투명', black: '블랙' })}<h4>홀로 효과</h4>${chips('holo', it.holo || 'none', { none: '없음', rainbow: '레인보우', gold: '골드', sparkle: '반짝이' })}
      <p class="note">라벨 글자는 자유롭게 바꿀 수 있어요. 실제 등급 회사 로고는 넣지 않아요.</p>`;
    if (it.t === 'photo') h += `<h4>액자</h4>${chips('frame', it.frame || 'none', { none: '없음', wood: '원목', gold: '골드', black: '블랙', white: '화이트' })}<label class="toggle" style="margin-top:10px">매트(흰 여백)<input type="checkbox" data-mat ${it.mat ? 'checked' : ''}></label>`;
    if (it.t === 'text') h += `<h4>글자</h4><div class="ctl full"><span>내용</span><textarea data-tx>${esc(it.text)}</textarea></div>
      <h4>글꼴</h4>${chips('font', it.font || 'sans', Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.label])))}<div style="height:10px"></div>
      ${range('글자 크기', 'size', it.size || 60, 12, 400, 1, 'data-p')}${range('굵기', 'weight', it.weight || 700, 300, 900, 100, 'data-p')}${range('자간', 'ls', it.ls || 0, -0.1, 0.6, .01, 'data-p')}
      ${colorRow('color', it.color || '#111111')}<h4>정렬</h4>${chips('align', it.align || 'center', { left: '왼쪽', center: '가운데', right: '오른쪽' })}
      <label class="toggle" style="margin-top:10px">네온 빛<input type="checkbox" data-glow ${it.glow ? 'checked' : ''}></label>
      <div class="ctl full"><span>글자 배경</span><div class="swatches"><button data-bgc="" style="background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/10px 10px" aria-pressed="${!it.bgc}"></button>${['#ffffff', '#111111', '#ffd23f', '#ff5a1f', '#2c5cff', 'rgba(0,0,0,.45)'].map(c => `<button data-bgc="${c}" style="background:${c}" aria-pressed="${it.bgc === c}"></button>`).join('')}</div></div>`;
    if (['shelf', 'riser', 'stand'].includes(it.t)) h += `<h4>재질</h4>${chips('mat', it.mat, it.t === 'shelf' ? { wood: '원목', glass: '유리', acrylic: '아크릴', metal: '메탈', marble: '대리석', black: '블랙' } : it.t === 'stand' ? { acrylic: '아크릴', black: '블랙', wood: '원목', gold: '골드' } : { acrylic: '아크릴', wood: '원목', black: '블랙', white: '화이트' })}`;
    if (it.t === 'light') h += `<h4>조명</h4>${colorRow('color', it.color || '#fff4d6')}${range('세기', 'power', it.power ?? .7, 0.1, 1, .05, 'data-p')}`;
    if (it.t === 'sticker') h += `<h4>스티커 바꾸기</h4><div class="emojis">${EMOJI.map(e => `<button data-em="${e}">${e}</button>`).join('')}</div>`;
    if (it.t === 'shape') h += `<h4>모양</h4>${chips('kind', it.kind || 'rect', { rect: '사각', round: '둥근 사각', circle: '원' })}<h4>채우기</h4>${chips('fill', it.fill || 'color', { color: '단색', velvet: '벨벳', felt: '펠트', wood: '원목', mirror: '거울', glass: '유리' })}<div style="height:10px"></div>${colorRow('c', it.c || '#2b2b2b')}${range('둥글기', 'rad', it.rad ?? 24, 0, 200, 1, 'data-p')}`;
    insp.innerHTML = h; bindInsp(it);
  }
  const chips = (k, v, opts) => `<div class="chips" data-ch="${k}">${Object.entries(opts).map(([o, l]) => `<button data-v="${o}" aria-pressed="${v === o}">${l}</button>`).join('')}</div>`;
  const txt = (k, l, v) => `<div class="ctl full"><span>${l}</span><input type="text" data-t="${k}" maxlength="40" value="${esc(v ?? '')}"></div>`;
  const colorRow = (k, v) => `<div class="ctl full"><span>색</span><div><input type="color" data-col="${k}" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'}"><div class="swatches" style="margin-top:6px">${COLORS.map(c => `<button data-sw="${k}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div></div>`;
  function syncInsp() {
    const it = sel && byId(sel); if (!it) return;
    const set = (k, v) => { const x = insp.querySelector(`[data-p="${k}"]`); if (x && document.activeElement !== x) { x.value = v; x.nextElementSibling.textContent = (+v).toFixed(+x.step < 1 ? 2 : 0); } };
    set('size', Math.round(it.w / doc.w * 100)); set('r', it.r || 0);
  }
  function bindInsp(it) {
    const full = () => { updEl(it, true); drawSel(); touched(); };
    insp.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, it));
    insp.querySelectorAll('input[type=range][data-p]').forEach(x => x.oninput = () => {
      snap('p' + x.dataset.p + it.id); const v = +x.value; x.nextElementSibling.textContent = v.toFixed(+x.step < 1 ? 2 : 0);
      const k = x.dataset.p;
      if (k === 'size') { const cx = it.x + it.w / 2, cy = it.y + it.h / 2, nw = Math.max(10, doc.w * v / 100), k2 = nw / it.w; it.w = Math.round(nw); it.h = Math.round(it.h * k2); it.x = Math.round(cx - it.w / 2); it.y = Math.round(cy - it.h / 2); if (it.t === 'sticker') return full(); }
      else it[k] = v;
      if (['size', 'r', 'tx', 'ty', 'shadow', 'o'].includes(k)) { updEl(it); drawSel(); touched(); } else full();
    });
    insp.querySelectorAll('[data-ch]').forEach(c => c.querySelectorAll('button').forEach(b => b.onclick = () => { snap(); it[c.dataset.ch] = b.dataset.v; c.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); full(); }));
    insp.querySelectorAll('[data-t]').forEach(x => x.oninput = () => { snap('t' + x.dataset.t + it.id); it[x.dataset.t] = x.value; full(); });
    const tx = insp.querySelector('[data-tx]'); if (tx) tx.oninput = () => { snap('tx' + it.id); it.text = tx.value; full(); };
    insp.querySelectorAll('[data-col]').forEach(x => x.oninput = () => { snap('col' + it.id); it[x.dataset.col] = x.value; full(); });
    insp.querySelectorAll('[data-sw]').forEach(x => x.onclick = () => { snap(); it[x.dataset.sw] = x.dataset.c; const ci = insp.querySelector(`[data-col="${x.dataset.sw}"]`); if (ci) ci.value = x.dataset.c; full(); });
    insp.querySelectorAll('[data-lc]').forEach(x => x.onclick = () => { snap(); it.lc = x.dataset.lc; insp.querySelectorAll('[data-lc]').forEach(y => y.setAttribute('aria-pressed', y === x)); full(); });
    insp.querySelectorAll('[data-bgc]').forEach(x => x.onclick = () => { snap(); it.bgc = x.dataset.bgc; insp.querySelectorAll('[data-bgc]').forEach(y => y.setAttribute('aria-pressed', y === x)); full(); });
    insp.querySelectorAll('[data-em]').forEach(x => x.onclick = () => { snap(); it.emoji = x.dataset.em; full(); });
    insp.querySelectorAll('[data-slot]').forEach(x => x.onclick = () => { snap(); it.kind = x.dataset.slot; if (it.kind === 'slab') it.h = Math.round(it.w * SLAB_RATIO); else it.h = Math.round(it.w * CARD_RATIO); full(); renderInsp(); });
    const m = insp.querySelector('[data-mat]'); if (m) m.onchange = () => { snap(); it.mat = m.checked; full(); };
    const gl = insp.querySelector('[data-glow]'); if (gl) gl.onchange = () => { snap(); it.glow = gl.checked; full(); };
  }
  async function act(a, it) {
    if (a === 'front' || a === 'back') { snap(); const s = [...doc.items].sort((x, y) => (x.z || 0) - (y.z || 0)); const i = s.indexOf(it); const j = a === 'front' ? i + 1 : i - 1; if (j < 0 || j >= s.length) return; s.splice(i, 1); s.splice(j, 0, it); s.forEach((x, k) => x.z = k + 1); s.forEach(x => updEl(x)); touched(); if (tab === 'layers') renderPanel(); return; }
    if (a === 'dup') { const c = JSON.parse(JSON.stringify(it)); c.lock = false; add(c, { x: it.x + it.w / 2 + 30, y: it.y + it.h / 2 + 30 }); return; }
    if (a === 'lock') { snap(); it.lock = !it.lock; updEl(it, true); drawSel(); renderInsp(); touched(); return; }
    if (a === 'flip') { snap(); it.flip = !it.flip; updEl(it); touched(); return; }
    if (a === 'center') { snap(); it.x = Math.round((doc.w - it.w) / 2); updEl(it); drawSel(); touched(); return; }
    if (a === 'reset') { snap(); it.tx = 0; it.ty = 0; updEl(it); renderInsp(); touched(); return; }
    if (a === 'del') { snap(); doc.items = doc.items.filter(x => x !== it); elOf(it.id)?.remove(); select(null); touched(); if (tab === 'layers') renderPanel(); return; }
    if (a === 'fill') { fillSlot(it); return; }
    if (a === 'src') { const u = await upload(it.t === 'photo' ? 'photo' : 'card'); if (!u) return; snap(); it.src = u.path; if (it.t !== 'slab') it.h = Math.round(it.w * u.h / u.w); updEl(it, true); drawSel(); touched(); }
  }

  // ---------- save / preview / export ----------
  async function save() {
    const title = $('.ttl').value.trim() || '나의 쇼케이스';
    const btn = $('[data-save]'); btn.disabled = true; $('[data-st]').textContent = '저장 중…';
    try {
      let cover = null;
      try { const b = await exportRoom(room, 640); if (b) cover = await api.upload(b, `cover-${Date.now().toString(36)}.${b.type === 'image/webp' ? 'webp' : 'png'}`); } catch (e) { console.warn('cover', e); }
      const old = meta.cover;
      const id = await api.save({ id: meta.id, title, intro: meta.intro, doc, cover, is_public: meta.is_public });
      if (cover && old && old !== cover) api.removeFiles([old]).catch(() => {});
      const wasNew = !meta.id; meta.id = id; meta.title = title; if (cover) meta.cover = cover;
      dirty = false; $('[data-st]').textContent = '저장됨'; try { localStorage.removeItem('pokeca-draft-new'); localStorage.removeItem('pokeca-draft-' + id); } catch (e) {}
      toast(meta.is_public ? '저장했어요! 둘러보기에 공개돼요' : '저장했어요 (비공개)');
      if (wasNew) history.replaceState(null, '', '#/edit/' + id);
      if (tab === 'info') renderPanel();
    } catch (e) { toast(e.message); $('[data-st]').textContent = '저장 실패'; }
    btn.disabled = false;
  }
  function preview() {
    const d = document.createElement('div'); d.className = 'viewer';
    d.innerHTML = `<div class="stage"></div><div class="vt"><button class="glassbtn" data-x>${I.back} 편집으로</button><div class="ttl"><h2>${esc($('.ttl').value)}</h2><p>미리보기</p></div></div>`;
    document.body.appendChild(d); const st = d.querySelector('.stage'); const r = buildRoom(doc, url); const wrap = document.createElement('div'); wrap.className = 'roomwrap'; wrap.appendChild(r); st.appendChild(wrap);
    const s = Math.min((innerWidth - 24) / doc.w, (innerHeight - 90) / doc.h); wrap.style.transform = `translate(${(innerWidth - doc.w * s) / 2}px,${(innerHeight - doc.h * s) / 2 + 20}px) scale(${s})`;
    d.querySelector('[data-x]').onclick = () => d.remove();
  }
  async function savePng() {
    const busy = toast('이미지를 만드는 중…', 60000);
    try { const b = await exportRoom(room, Math.min(2400, doc.w * 2)); download(b, ($('.ttl').value || 'pokeca-room') + '.png'); } catch (e) { toast(e.message); }
    busy.close();
  }
  async function delRoom() {
    if (!(await confirmDlg('이 쇼케이스를 삭제할까요?', '삭제하면 되돌릴 수 없어요. 올린 사진은 내 사진 보관함에 남아요.', '삭제'))) return;
    try { await api.del(meta.id); dirty = false; toast('삭제했어요'); location.hash = '#/me'; } catch (e) { toast(e.message); }
  }

  // ---------- wiring ----------
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => (mobile() && tab === b.dataset.tab && !(b.dataset.tab === 'edit')) ? openSheet(null) : (b.dataset.tab === 'edit' ? (sel ? openSheet('edit') : toast('먼저 캔버스에서 물건을 눌러 고르세요')) : setTab(b.dataset.tab)));
  $('[data-undo]').onclick = undo; $('[data-redo]').onclick = redo; $('[data-save]').onclick = save; $('[data-prev]').onclick = preview;
  $('.ttl').oninput = () => touched();
  $('[data-back]').onclick = async () => { if (dirty && !(await confirmDlg('저장하지 않고 나갈까요?', '저장하지 않은 변경은 이 기기에 임시로만 남아요.', '나가기'))) return; dirty = false; location.hash = meta.id ? '#/s/' + meta.id : '#/me'; };
  $('[data-zi]').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
  $('[data-zo]').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
  $('[data-zf]').onclick = fit;
  const onKey = e => {
    if (!document.body.contains(root.querySelector('.ed'))) { removeEventListener('keydown', onKey); return; }
    if (e.target.matches('input, textarea')) return;
    const it = sel && byId(sel); const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (mod && e.key.toLowerCase() === 'd' && it) { e.preventDefault(); act('dup', it); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && it) { e.preventDefault(); act('del', it); }
    else if (e.key === 'Escape') select(null);
    else if (it && !it.lock && e.key.startsWith('Arrow')) { e.preventDefault(); snap('arrow' + it.id); const d = e.shiftKey ? 10 : 1; if (e.key === 'ArrowLeft') it.x -= d; if (e.key === 'ArrowRight') it.x += d; if (e.key === 'ArrowUp') it.y -= d; if (e.key === 'ArrowDown') it.y += d; updEl(it); drawSel(); touched(); }
  };
  addEventListener('keydown', onKey);
  const onResize = () => { if (!document.body.contains(stage)) { removeEventListener('resize', onResize); return; } fit(); if (!mobile()) { panel.classList.remove('closed'); insp.classList.remove('closed'); if (!tab || tab === 'edit') tab = 'add'; renderPanel(); renderInsp(); } };
  addEventListener('resize', onResize);
  window.onbeforeunload = () => dirty ? '저장하지 않은 변경이 있어요' : undefined;
  window.__edGuard = () => !dirty;

  build(); fit();
  if (mobile()) { panel.classList.add('closed'); insp.classList.add('closed'); tab = ''; } else { setTab('add'); renderInsp(); }
  $('[data-st]').textContent = meta.id ? '저장됨' : '새 쇼케이스';
  if (!id) touched();
}

export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name.replace(/[\\/:*?"<>|]/g, '_'); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
