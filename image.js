// Photo picking, cropping, compression and room export.
import { CARD_RATIO } from './render.js';

export function pickFile(accept = 'image/*') {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
}

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
    return img;
  }
}

export async function toBlob(canvas, q = 0.88) {
  let b = await new Promise(r => canvas.toBlob(r, 'image/webp', q));
  if (!b || b.type !== 'image/webp') b = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
  return b;
}

// Crop dialog. ratio: number (h/w) or null for free. Returns {blob, w, h} or null.
export function cropDialog(file, { ratio = CARD_RATIO, title = '사진 자르기', maxEdge = 1400 } = {}) {
  return new Promise(async resolve => {
    let src = await loadBitmap(file).catch(() => null);
    if (!src) { resolve(null); return; }
    let rot = 0, aspect = ratio;
    const d = document.createElement('div'); d.className = 'dlg crop';
    d.innerHTML = `<div class="card"><h3>${title}</h3><p class="sub">테두리를 끌어서 카드에 딱 맞게 잘라 주세요. 모서리는 자동으로 둥글게 처리돼요.</p>
      <div class="cw"><canvas></canvas><div class="cr"><i class="nw"></i><i class="ne"></i><i class="sw"></i><i class="se"></i></div></div>
      <div class="opts"><div class="chips" data-r>
        <button data-v="card">카드 비율</button><button data-v="free">자유</button><button data-v="sq">정사각</button><button data-v="full">원본 그대로</button></div>
        <button class="btn soft sm" data-rot>↻ 90°</button></div>
      <div class="row"><button class="btn ghost" data-x>취소</button><button class="btn" data-ok>이대로 쓰기</button></div></div>`;
    document.body.appendChild(d);
    const cv = d.querySelector('canvas'), cw = d.querySelector('.cw'), cr = d.querySelector('.cr');
    let W = 0, H = 0, S = 1, box = null; // canvas css size, scale css->src
    function draw() {
      const sw = rot % 180 ? src.height : src.width, sh = rot % 180 ? src.width : src.height;
      const aw = cw.clientWidth, ah = cw.clientHeight; S = Math.min(aw / sw, ah / sh); W = sw * S; H = sh * S;
      const dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.save(); g.translate(W / 2, H / 2); g.rotate(rot * Math.PI / 180);
      const dw = src.width * S, dh = src.height * S; g.drawImage(src, -dw / 2, -dh / 2, dw, dh); g.restore();
      resetBox();
    }
    function resetBox() {
      if (aspect === 'full') { box = { x: 0, y: 0, w: W, h: H }; }
      else if (aspect) { let w = W * 0.86, h = w * aspect; if (h > H * 0.92) { h = H * 0.92; w = h / aspect; } box = { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
      else box = { x: W * 0.07, y: H * 0.07, w: W * 0.86, h: H * 0.86 };
      place();
    }
    function place() {
      const ox = (cw.clientWidth - W) / 2, oy = (cw.clientHeight - H) / 2;
      Object.assign(cr.style, { left: ox + box.x + 'px', top: oy + box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
    }
    const setAspect = v => { aspect = v === 'card' ? CARD_RATIO : v === 'sq' ? 1 : v === 'full' ? 'full' : null;
      d.querySelectorAll('[data-r] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); resetBox(); };
    d.querySelectorAll('[data-r] button').forEach(b => b.onclick = () => setAspect(b.dataset.v));
    d.querySelector('[data-rot]').onclick = () => { rot = (rot + 90) % 360; draw(); };
    // drag & resize
    let drag = null;
    cr.addEventListener('pointerdown', e => {
      e.preventDefault(); cr.setPointerCapture(e.pointerId);
      drag = { mode: e.target.tagName === 'I' ? e.target.className : 'move', sx: e.clientX, sy: e.clientY, b: { ...box } };
    });
    cr.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, b = { ...drag.b };
      if (drag.mode === 'move') { b.x = Math.min(Math.max(0, b.x + dx), W - b.w); b.y = Math.min(Math.max(0, b.y + dy), H - b.h); }
      else {
        if (aspect === 'full') return;
        const m = drag.mode, b0 = drag.b;
        const ax = m.includes('w') ? b0.x + b0.w : b0.x, ay = m.includes('n') ? b0.y + b0.h : b0.y;
        const px = Math.min(W, Math.max(0, (m.includes('w') ? b0.x : b0.x + b0.w) + dx));
        const py = Math.min(H, Math.max(0, (m.includes('n') ? b0.y : b0.y + b0.h) + dy));
        let w = Math.abs(px - ax), h = Math.abs(py - ay);
        if (typeof aspect === 'number') { if (h / Math.max(1, w) > aspect) h = w * aspect; else w = h / aspect; }
        w = Math.max(40, w); h = Math.max(40, h);
        b.x = m.includes('w') ? ax - w : ax; b.y = m.includes('n') ? ay - h : ay; b.w = w; b.h = h;
      }
      box = b; place();
    });
    cr.addEventListener('pointerup', () => drag = null);
    const close = v => { d.remove(); removeEventListener('resize', draw); resolve(v); };
    addEventListener('resize', draw);
    d.querySelector('[data-x]').onclick = () => close(null);
    d.querySelector('[data-ok]').onclick = async () => {
      // render rotated full image at native res, then crop
      const sw = rot % 180 ? src.height : src.width, sh = rot % 180 ? src.width : src.height;
      const k = 1 / S; const cx = box.x * k, cy = box.y * k, cwid = box.w * k, chei = box.h * k;
      const sc = Math.min(1, maxEdge / Math.max(cwid, chei));
      const out = document.createElement('canvas'); out.width = Math.round(cwid * sc); out.height = Math.round(chei * sc);
      const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.scale(sc, sc); g.translate(-cx, -cy); g.translate(sw / 2, sh / 2); g.rotate(rot * Math.PI / 180); g.drawImage(src, -src.width / 2, -src.height / 2);
      const blob = await toBlob(out, 0.88);
      close({ blob, w: out.width, h: out.height });
    };
    requestAnimationFrame(() => { draw(); setAspect(ratio === CARD_RATIO ? 'card' : ratio === 1 ? 'sq' : ratio === 'full' ? 'full' : 'free'); });
  });
}

// plain resize without crop (backgrounds)
export async function shrink(file, maxEdge = 2400) {
  const src = await loadBitmap(file); const sc = Math.min(1, maxEdge / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return { blob: await toBlob(c, 0.85), w: c.width, h: c.height };
}

// Render a room element to an image blob using html-to-image.
export async function exportRoom(roomEl, width) {
  if (!window.htmlToImage) throw new Error('이미지 저장 도구를 불러오지 못했어요');
  const w = parseFloat(roomEl.style.width), h = parseFloat(roomEl.style.height);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${w + 100}px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
  const clone = roomEl.cloneNode(true); clone.classList.remove('editing'); clone.classList.add('no-anim');
  clone.querySelectorAll('.t-slot').forEach(n => n.remove());
  host.appendChild(clone); document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    await Promise.all([...clone.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const ratio = width / w;
    const blob = await window.htmlToImage.toBlob(clone, { width: w, height: h, pixelRatio: ratio, cacheBust: false, skipFonts: false, style: { transform: 'none' } });
    return blob;
  } finally { host.remove(); }
}
