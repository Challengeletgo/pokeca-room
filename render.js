// Draws a showcase document as DOM. Shared by the viewer, the editor and image export.
export const SIZES = {
  portrait: { w: 1200, h: 1600, label: '세로 3:4' },
  tall: { w: 1080, h: 1920, label: '폰 9:16' },
  square: { w: 1500, h: 1500, label: '정사각' },
  wide: { w: 1920, h: 1080, label: '가로 16:9' },
  panorama: { w: 2600, h: 1100, label: '파노라마' },
};
export const THEMES = {
  glass: { label: '유리 진열장', c1: '#f4f2ee', c2: '#d9d4cb' },
  wood: { label: '원목 장식장', c1: '#7a4d2b', c2: '#3b2414' },
  velvet: { label: '벨벳', c1: '#7d1630', c2: '#2a0710' },
  gallery: { label: '갤러리 월', c1: '#f7f6f2', c2: '#cfc9bf' },
  neon: { label: '네온 룸', c1: '#7c5cff', c2: '#0a0a16' },
  concrete: { label: '콘크리트', c1: '#a7a6a2', c2: '#6c6b68' },
  night: { label: '밤하늘', c1: '#16224a', c2: '#05060f' },
  solid: { label: '단색', c1: '#ffe8a3', c2: '#ffe8a3' },
  gradient: { label: '그라데이션', c1: '#ffb3c7', c2: '#8fb8ff' },
  photo: { label: '내 사진', c1: '#222', c2: '#111' },
};
export const LABELS = { red: ['#d8232a', '#fff'], blue: ['#1f56c4', '#fff'], gold: ['#c9a23a', '#1a1408'], black: ['#141414', '#e9c86a'], white: ['#f4f4f4', '#111'], green: ['#1f8a4c', '#fff'], purple: ['#6b3fd1', '#fff'] };
export const FONTS = {
  sans: { label: '기본 고딕', css: "'Pretendard Variable', Pretendard, system-ui, sans-serif" },
  display: { label: '굵은 제목', css: "'Black Han Sans', 'Pretendard Variable', sans-serif" },
  serif: { label: '명조', css: "'Gowun Batang', serif" },
  pen: { label: '손글씨', css: "'Nanum Pen Script', cursive" },
  mono: { label: '타자기', css: "'IBM Plex Mono', 'Pretendard Variable', monospace" },
  pixel: { label: '도트', css: "'DotGothic16', 'Pretendard Variable', monospace" },
};
export const CARD_RATIO = 88 / 63;
export const SLAB_RATIO = 1.66;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10);

export function blankDoc(size = 'portrait', theme = 'glass') {
  const s = SIZES[size]; const t = THEMES[theme];
  return { v: 1, size, w: s.w, h: s.h, bg: { theme, c1: t.c1, c2: t.c2, img: '', case: true, light: 0.7, warm: 0.2, grain: 0.25 }, items: [] };
}

// background layers for a room
function bgHTML(doc, url) {
  const b = doc.bg || {}; const th = b.theme || 'glass';
  const img = th === 'photo' && b.img ? `<div class="bg-photo" style="background-image:url('${esc(url(b.img))}')"></div>` : '';
  const warm = b.warm ?? 0;
  return `<div class="bg th-${th}" style="--c1:${esc(b.c1 || THEMES[th]?.c1)};--c2:${esc(b.c2 || THEMES[th]?.c2)}">${img}<i class="bg-detail"></i></div>
    <div class="ambient" style="--amb:${b.light ?? 0.6};--warm:${warm}"></div>`;
}
function overHTML(doc) {
  const b = doc.bg || {};
  return `${b.case ? '<div class="caseframe"><i class="cf-glare"></i><i class="cf-lock"></i></div>' : ''}<div class="grain" style="opacity:${(b.grain ?? 0.2) * 0.5}"></div>`;
}

export function itemInner(it, url) {
  const src = it.src ? url(it.src) : '';
  switch (it.t) {
    case 'card': return `<div class="face card-face sleeve-${it.sleeve || 'none'}" style="--rad:${it.radius ?? 4.5}%">
        ${src ? `<img src="${esc(src)}" alt="" draggable="false" crossorigin="anonymous">` : '<div class="ph">사진</div>'}
        ${it.holo && it.holo !== 'none' ? `<i class="holo holo-${it.holo}"></i>` : ''}<i class="gloss"></i></div>`;
    case 'slab': {
      const [lc, lt] = LABELS[it.lc] || LABELS.red;
      return `<div class="face slab-face slab-${it.style || 'clear'}">
        <div class="slab-label" style="--lc:${lc};--lt:${lt}"><div class="sl-l"><b>${esc(it.l1 || '')}</b><span>${esc(it.l2 || '')}</span></div><div class="sl-g"><small>${esc(it.gl || 'GEM MT')}</small><strong>${esc(it.grade ?? '10')}</strong></div></div>
        <div class="slab-win">${src ? `<img src="${esc(src)}" alt="" draggable="false" crossorigin="anonymous">` : '<div class="ph">사진</div>'}${it.holo && it.holo !== 'none' ? `<i class="holo holo-${it.holo}"></i>` : ''}</div>
        <i class="gloss"></i></div>`;
    }
    case 'photo': return `<div class="face photo-face fr-${it.frame || 'none'}${it.mat ? ' mat' : ''}"><div class="pf-in">${src ? `<img src="${esc(src)}" alt="" draggable="false" crossorigin="anonymous">` : '<div class="ph">사진</div>'}</div></div>`;
    case 'text': {
      const f = FONTS[it.font] || FONTS.sans;
      const glow = it.glow ? `0 0 ${it.size * 0.25}px ${it.color}, 0 0 ${it.size * 0.6}px ${it.color}` : 'none';
      return `<div class="face text-face" style="font-family:${f.css};font-size:${it.size || 60}px;color:${esc(it.color || '#111')};font-weight:${it.weight || 700};text-align:${it.align || 'center'};text-shadow:${glow};${it.bgc ? `background:${esc(it.bgc)};` : ''}letter-spacing:${it.ls || 0}em;line-height:1.15">${esc(it.text || '').replace(/\n/g, '<br>')}</div>`;
    }
    case 'shelf': return `<div class="face shelf-face mat-${it.mat || 'wood'}"><i></i></div>`;
    case 'riser': return `<div class="face riser-face mat-${it.mat || 'acrylic'}"><i></i></div>`;
    case 'stand': return `<div class="face stand-face mat-${it.mat || 'acrylic'}"><i></i></div>`;
    case 'light': return `<div class="face light-face" style="--lc:${esc(it.color || '#fff6d8')};--pw:${it.power ?? 0.8}"></div>`;
    case 'sticker': return `<div class="face sticker-face" style="font-size:${Math.round(Math.min(it.w, it.h) * 0.82)}px">${esc(it.emoji || '⭐')}</div>`;
    case 'shape': return `<div class="face shape-face sh-${it.kind || 'rect'} fill-${it.fill || 'color'}" style="--sc:${esc(it.c || '#2b2b2b')};--sr:${it.rad ?? 24}px"></div>`;
    case 'slot': return `<div class="face slot-face"><span>＋<br>${it.kind === 'slab' ? '슬랩' : '카드'} 자리</span></div>`;
  }
  return '';
}

export function itemStyle(it) {
  const sh = it.shadow ?? 0.6;
  return `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;z-index:${it.z || 1};opacity:${it.o ?? 1};` +
    `transform:rotate(${it.r || 0}deg);--tx:${it.tx || 0}deg;--ty:${it.ty || 0}deg;--sh:${sh};${it.flip ? '--fl:-1;' : ''}`;
}

export function itemEl(it, url) {
  const el = document.createElement('div');
  el.className = `it t-${it.t}${it.lock ? ' locked' : ''}`;
  el.dataset.id = it.id;
  el.setAttribute('style', itemStyle(it));
  el.innerHTML = `<div class="tilt">${itemInner(it, url)}</div>`;
  return el;
}

// Build a full room element (not yet scaled).
export function buildRoom(doc, url, { edit = false } = {}) {
  const room = document.createElement('div');
  room.className = 'room' + (edit ? ' editing' : '');
  room.style.width = doc.w + 'px'; room.style.height = doc.h + 'px';
  room.innerHTML = bgHTML(doc, url) + '<div class="items"></div>' + overHTML(doc);
  const box = room.querySelector('.items');
  [...(doc.items || [])].sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(it => { if (!edit && it.t === 'slot') return; box.appendChild(itemEl(it, url)); });
  return room;
}

export function refreshBg(room, doc, url) {
  room.querySelector('.bg').outerHTML; // keep reference semantics simple
  room.querySelector('.bg').remove(); room.querySelector('.ambient').remove();
  room.querySelector('.caseframe')?.remove(); room.querySelector('.grain')?.remove();
  room.insertAdjacentHTML('afterbegin', bgHTML(doc, url));
  room.insertAdjacentHTML('beforeend', overHTML(doc));
  room.style.width = doc.w + 'px'; room.style.height = doc.h + 'px';
}

export function fitScale(doc, w, h, pad = 0) { return Math.min((w - pad * 2) / doc.w, (h - pad * 2) / doc.h); }

// templates for a new showcase
export function template(kind) {
  if (kind === 'blank') return blankDoc('portrait', 'gallery');
  if (kind === 'glass3') {
    const d = blankDoc('portrait', 'glass'); const I = d.items; let z = 1;
    [520, 1000, 1480].forEach((y, row) => {
      I.push({ id: uid(), t: 'shelf', x: 70, y, w: 1060, h: 34, r: 0, z: z++, mat: 'glass', shadow: 0.5 });
      [0, 1, 2].forEach(c => I.push({ id: uid(), t: 'slot', kind: row === 1 ? 'slab' : 'card', x: 150 + c * 320, y: y - (row === 1 ? 400 : 360), w: row === 1 ? 240 : 250, h: row === 1 ? 398 : 349, r: 0, z: z++ }));
    });
    [250, 600, 950].forEach(x => I.push({ id: uid(), t: 'light', x: x - 230, y: -120, w: 460, h: 560, r: 0, z: z++, color: '#fff7e0', power: 0.55 }));
    return d;
  }
  if (kind === 'wood') {
    const d = blankDoc('wide', 'wood'); const I = d.items; let z = 1;
    [470, 960].forEach(y => { I.push({ id: uid(), t: 'shelf', x: 60, y, w: 1800, h: 46, r: 0, z: z++, mat: 'wood', shadow: 0.7 });
      [0, 1, 2, 3, 4].forEach(c => I.push({ id: uid(), t: 'slot', kind: 'card', x: 150 + c * 340, y: y - 345, w: 240, h: 335, r: 0, z: z++ })); });
    I.push({ id: uid(), t: 'text', x: 560, y: 1000, w: 800, h: 70, r: 0, z: z++, text: 'MY COLLECTION', font: 'mono', size: 44, color: '#f3dcb3', weight: 600, align: 'center', ls: 0.3 });
    return d;
  }
  if (kind === 'velvet') {
    const d = blankDoc('square', 'velvet'); const I = d.items; let z = 1;
    I.push({ id: uid(), t: 'light', x: 350, y: -200, w: 800, h: 1100, r: 0, z: z++, color: '#ffe7c2', power: 0.7 });
    I.push({ id: uid(), t: 'riser', x: 520, y: 1110, w: 460, h: 120, r: 0, z: z++, mat: 'black' });
    I.push({ id: uid(), t: 'slot', kind: 'slab', x: 600, y: 470, w: 300, h: 498, r: 0, z: z++ });
    I.push({ id: uid(), t: 'stand', x: 640, y: 960, w: 220, h: 160, r: 0, z: z++, mat: 'acrylic' });
    I.push({ id: uid(), t: 'text', x: 350, y: 1300, w: 800, h: 90, r: 0, z: z++, text: 'THE ONE', font: 'serif', size: 64, color: '#f1d6a0', weight: 700, align: 'center', ls: 0.25 });
    return d;
  }
  if (kind === 'neon') {
    const d = blankDoc('tall', 'neon'); const I = d.items; let z = 1;
    I.push({ id: uid(), t: 'text', x: 90, y: 120, w: 900, h: 160, r: -4, z: z++, text: 'PULL ROOM', font: 'display', size: 130, color: '#ff5ad1', weight: 400, align: 'center', glow: true });
    [[140, 420], [560, 420], [140, 1000], [560, 1000]].forEach(([x, y]) => I.push({ id: uid(), t: 'slot', kind: 'card', x, y, w: 380, h: 531, r: 0, z: z++ }));
    I.push({ id: uid(), t: 'sticker', x: 840, y: 1620, w: 160, h: 160, r: 12, z: z++, emoji: '⚡' });
    return d;
  }
  return blankDoc();
}
