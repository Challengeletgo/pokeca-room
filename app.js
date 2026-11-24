import { api } from './api.js';
import { buildRoom, template } from './render.js';
import { exportRoom } from './image.js';
import { openEditor, download } from './editor.js';
import { toast, dialog, confirmDlg, esc, getMe, ensureName, I } from './ui.js';

const app = document.getElementById('app');
const url = p => api.url(p);
const fmtN = n => n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '만' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + '천' : String(n || 0);

function header(active) {
  return `<header class="top"><a class="logo" href="#/"><i></i><b>POKECA ROOM</b><span>포케카 룸</span></a>
    <nav class="nav"><a href="#/" class="${active === 'explore' ? 'on' : ''}">둘러보기</a><a href="#/me" class="${active === 'me' ? 'on' : ''}">내 룸</a></nav>
    <div class="grow"></div><button class="btn sm accent" data-new>${I.plus} 만들기</button><a class="me-chip" href="#/me" data-chip><i>?</i><span>내 룸</span></a></header>`;
}
async function wireHeader() {
  app.querySelector('[data-new]').onclick = newRoom;
  try { const me = await getMe(); const c = app.querySelector('[data-chip]'); if (me.name && c) c.innerHTML = `<i>${esc(me.name[0])}</i><span>${esc(me.name)}</span>`; } catch (e) {}
}
const footer = () => `<footer class="foot wrap">포케카 룸은 포켓몬 카드 수집가를 위한 비공식 팬 사이트예요. (주)포켓몬코리아·The Pokémon Company·Nintendo와 관련이 없으며, 올라온 사진은 각 수집가의 것이에요.<br>
  현금 거래·판매 기능은 없어요. 다른 사람의 사진을 허락 없이 올리지 마세요. <a href="privacy.html">개인정보 처리 안내</a> · <a href="https://challengeletgo.github.io/gem-exchange/">젬 거래소</a></footer>`;

// ---------- explore ----------
let ex = { sort: 'pop', q: '', items: [], done: false };
async function explore() {
  app.innerHTML = header('explore') + `<main><div class="wrap">
    <section class="hero"><div><h1>내 컬렉션을 위한<br><em>단 하나의 진열장</em></h1>
      <p>카드 사진을 올리고, 선반과 조명과 슬랩 라벨까지 마음대로 꾸며 보세요. 정해진 칸은 없어요. 놓고 싶은 곳에, 놓고 싶은 각도로.</p>
      <div class="cta"><button class="btn accent" data-new2>${I.plus} 내 쇼케이스 만들기</button><a class="btn ghost" href="#explore-list">다른 수집가 구경하기</a></div></div>
      <div class="hero-art"><div class="stack"><div class="hc"><b></b><i></i><i></i><i></i></div><div class="hc"><b></b><i></i><i></i><i></i></div><div class="hc"><b></b><i></i><i></i><i></i></div><div class="shelfbar"></div></div></div></section>
    <div class="bar" id="explore-list"><div class="seg"><button data-s="pop">인기</button><button data-s="new">최신</button></div>
      <label class="search">${I.search}<input data-q placeholder="제목이나 닉네임으로 찾기" value="${esc(ex.q)}"></label></div>
    <div class="grid" data-g>${'<div class="skel"></div>'.repeat(8)}</div><div class="more" data-more hidden><button class="btn ghost">더 보기</button></div>
  </div>${footer()}</main>`;
  wireHeader(); app.querySelector('[data-new2]').onclick = newRoom;
  const segs = app.querySelectorAll('[data-s]'); const setSeg = () => segs.forEach(b => b.setAttribute('aria-pressed', b.dataset.s === ex.sort)); setSeg();
  segs.forEach(b => b.onclick = () => { ex.sort = b.dataset.s; setSeg(); load(true); });
  let qt; app.querySelector('[data-q]').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { ex.q = e.target.value.trim(); load(true); }, 300); };
  app.querySelector('[data-more] button').onclick = () => load(false);
  load(true);
  async function load(reset) {
    const g = app.querySelector('[data-g]'); if (!g) return;
    if (reset) { ex.items = []; ex.done = false; }
    try {
      const rows = await api.list(ex.sort, ex.q, ex.items.length);
      ex.items.push(...rows); ex.done = rows.length < 24;
      g.innerHTML = ex.items.length ? ex.items.map(tile).join('') : `<div class="empty" style="grid-column:1/-1"><b>${ex.q ? '찾는 쇼케이스가 없어요' : '아직 공개된 쇼케이스가 없어요'}</b>첫 번째 쇼케이스의 주인공이 되어 보세요!</div>`;
      app.querySelector('[data-more]').hidden = ex.done;
    } catch (e) { g.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>불러오지 못했어요</b>${esc(e.message)}</div>`; }
  }
}
const tile = r => `<a class="tile" href="#/s/${r.id}"><div class="cov${r.cover ? '' : ' none'}" style="${r.cover ? `background-image:url('${esc(url(r.cover))}')` : ''}">${r.cover ? '' : '표지 없음'}${r.is_public === false ? '<span class="badge">비공개</span>' : r.hidden ? '<span class="badge">숨김</span>' : ''}</div>
  <div class="meta"><h3>${esc(r.title)}</h3><p><span class="own">${esc(r.owner_name || '')}</span><span>♥ ${fmtN(r.like_count)}</span><span>👁 ${fmtN(r.view_count)}</span></p></div></a>`;

// ---------- new ----------
async function newRoom() {
  const me = await ensureName('쇼케이스를 만들려면 닉네임이 필요해요'); if (!me) return;
  const T = [['glass3', '유리 진열장 3단'], ['wood', '원목 선반'], ['velvet', '벨벳 단독 전시'], ['neon', '네온 뽑기 자랑'], ['blank', '빈 갤러리 벽']];
  const pick = await dialog(`<h3>어떤 방으로 시작할까요?</h3><p class="sub">시작 모양일 뿐이에요. 안의 모든 것을 옮기고, 지우고, 바꿀 수 있어요.</p><div class="tpls">${T.map(([k, l]) => `<button class="tpl" data-t="${k}"><div class="pv" data-pv="${k}"></div><b>${l}</b></button>`).join('')}</div><div class="row"><button class="btn ghost" data-x>닫기</button></div>`, (d, close) => {
    d.querySelectorAll('[data-pv]').forEach(pv => {
      const doc = template(pv.dataset.pv); const r = buildRoom(doc, url, { edit: true }); const box = document.createElement('div'); box.appendChild(r); pv.appendChild(box);
      requestAnimationFrame(() => { const s = Math.max(pv.clientWidth / doc.w, pv.clientHeight / doc.h); box.style.transform = `scale(${s})`; box.style.left = (pv.clientWidth - doc.w * s) / 2 + 'px'; });
    });
    d.querySelectorAll('[data-t]').forEach(b => b.onclick = () => close(b.dataset.t)); d.querySelector('[data-x]').onclick = () => close(null);
  });
  if (pick) location.hash = '#/new/' + pick;
}

// ---------- viewer ----------
async function viewer(id) {
  app.innerHTML = `<div class="viewer"><div class="stage"></div><div class="hint" data-hint>두 손가락으로 확대 · 카드를 누르면 자세히</div></div>`;
  const v = app.querySelector('.viewer'), st = v.querySelector('.stage');
  let s;
  try { s = await api.get(id); } catch (e) { s = null; }
  if (!s) { v.innerHTML = `<div class="vt"><a class="glassbtn" href="#/">${I.back}</a></div><div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px"><div><h2>쇼케이스를 찾을 수 없어요</h2><p style="opacity:.7">삭제됐거나 비공개로 바뀌었을 수 있어요.</p><a class="btn accent" href="#/">둘러보기로</a></div></div>`; return; }
  document.title = `${s.title} · 포케카 룸`;
  api.view(id);
  const doc = s.doc; const room = buildRoom(doc, url); const wrap = document.createElement('div'); wrap.className = 'roomwrap'; wrap.appendChild(room); st.appendChild(wrap);
  const me = await getMe().catch(() => ({}));
  v.insertAdjacentHTML('beforeend', `<div class="vt"><a class="glassbtn" href="#/" data-back>${I.back}</a><div class="ttl"><h2>${esc(s.title)}</h2><p>${esc(s.owner_name || '')} · 👁 ${fmtN(s.view_count)}${s.is_public ? '' : ' · 비공개'}${s.hidden ? ' · 숨김 처리됨' : ''}</p></div>
    ${s.mine ? `<a class="glassbtn" href="#/edit/${s.id}">${I.edit}<span>꾸미기</span></a>` : ''}</div>
    ${s.intro ? `<div class="intro" data-intro>${esc(s.intro)}</div>` : ''}
    <div class="vb"><button class="glassbtn ${s.liked ? 'on' : ''}" data-like>${s.liked ? I.heartF : I.heart}<span>${fmtN(s.like_count)}</span></button>
      <button class="glassbtn" data-share>${I.share}<span>공유</span></button><button class="glassbtn" data-png>${I.download}</button><button class="glassbtn" data-fit>${I.fit}</button>
      ${!s.mine ? `<button class="glassbtn" data-rep title="신고">${I.flag}</button>` : ''}${me.is_admin ? `<button class="glassbtn" data-hide>${s.hidden ? '숨김 해제' : '숨기기'}</button>` : ''}</div>`);
  // pan / zoom
  let z = 1, ox = 0, oy = 0, minZ = 1;
  const apply = () => wrap.style.transform = `translate(${ox}px,${oy}px) scale(${z})`;
  const fit = () => { const W = innerWidth, H = innerHeight, top = 70, bot = 90; minZ = z = Math.min((W - 24) / doc.w, (H - top - bot) / doc.h); ox = (W - doc.w * z) / 2; oy = top + (H - top - bot - doc.h * z) / 2; apply(); };
  fit(); const onR = () => { if (!document.body.contains(v)) return removeEventListener('resize', onR); fit(); }; addEventListener('resize', onR);
  const zoomAt = (f, cx, cy) => { const nz = Math.min(minZ * 6, Math.max(minZ * 0.6, z * f)); ox = cx - (cx - ox) * (nz / z); oy = cy - (cy - oy) * (nz / z); z = nz; apply(); };
  const pts = new Map(); let g = null, lastTap = 0;
  st.addEventListener('pointerdown', e => { st.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; g = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), z0: z, ox0: ox, oy0: oy, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; }
    else g = { sx: e.clientX, sy: e.clientY, ox0: ox, oy0: oy, moved: false, target: e.target }; });
  st.addEventListener('pointermove', e => { if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pinch) { const [a, b] = [...pts.values()]; const k = Math.hypot(a.x - b.x, a.y - b.y) / g.d0; const nz = Math.min(minZ * 6, Math.max(minZ * 0.6, g.z0 * k)); const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ox = m.x - (g.m.x - g.ox0) * (nz / g.z0); oy = m.y - (g.m.y - g.oy0) * (nz / g.z0); z = nz; apply(); return; }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy; if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true; if (g.moved) { ox = g.ox0 + dx; oy = g.oy0 + dy; apply(); } });
  const up = e => { pts.delete(e.pointerId); if (!g) return;
    if (!g.pinch && !g.moved) { const now = Date.now();
      if (now - lastTap < 300) { zoomAt(z > minZ * 1.5 ? minZ / z : 2.2, e.clientX, e.clientY); if (z <= minZ * 1.01) fit(); lastTap = 0; }
      else { lastTap = now; const itEl = g.target.closest?.('.it'); if (itEl) { const it = doc.items.find(x => x.id === itEl.dataset.id); if (it && ['card', 'slab', 'photo'].includes(it.t)) setTimeout(() => { if (lastTap === now) inspect(it); }, 260); } } }
    if (pts.size === 0) g = null; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  st.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); }, { passive: false });
  const hint = v.querySelector('[data-hint]'); setTimeout(() => hint.classList.add('show'), 600); setTimeout(() => hint.classList.remove('show'), 4200);
  const intro = v.querySelector('[data-intro]'); if (intro) setTimeout(() => intro.style.transition = 'opacity .6s', 0), setTimeout(() => intro.style.opacity = 0, 7000);

  v.querySelector('[data-fit]').onclick = fit;
  v.querySelector('[data-like]').onclick = async e => {
    const b = e.currentTarget;
    try { const r = await api.like(id); b.classList.toggle('on', r.liked); b.innerHTML = `${r.liked ? I.heartF : I.heart}<span>${fmtN(r.count)}</span>`; if (r.liked) burst(b); } catch (er) { toast(er.message); }
  };
  v.querySelector('[data-share]').onclick = async () => {
    const link = location.href.split('#')[0].split('?')[0] + '#/s/' + id;
    if (navigator.share) { try { await navigator.share({ title: s.title + ' · 포케카 룸', text: `${s.owner_name}님의 포켓몬카드 쇼케이스`, url: link }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(link); toast('링크를 복사했어요!'); } catch (e) { prompt('이 링크를 복사하세요', link); }
  };
  v.querySelector('[data-png]').onclick = async () => { const b = toast('이미지를 만드는 중…', 60000); try { download(await exportRoom(room, Math.min(2400, doc.w * 2)), s.title + '.png'); } catch (e) { toast(e.message); } b.close(); };
  const rep = v.querySelector('[data-rep]'); if (rep) rep.onclick = async () => {
    const reason = await dialog(`<h3>신고하기</h3><p class="sub">어떤 문제가 있나요? 운영자가 확인 후 숨김 처리해요.</p><div class="chips" style="margin-bottom:12px">${['다른 사람의 사진 도용', '부적절한 이미지', '현금 거래 유도', '욕설·비방', '기타'].map(r => `<button data-r="${r}">${r}</button>`).join('')}</div><div class="row"><button class="btn ghost" data-x>취소</button></div>`,
      (d, close) => { d.querySelectorAll('[data-r]').forEach(b => b.onclick = () => close(b.dataset.r)); d.querySelector('[data-x]').onclick = () => close(null); });
    if (!reason) return; try { await api.report(id, reason); toast('신고했어요. 고마워요!'); } catch (e) { toast(e.message); }
  };
  const hide = v.querySelector('[data-hide]'); if (hide) hide.onclick = async () => { try { await api.adminHide(id, !s.hidden); toast(s.hidden ? '다시 보이게 했어요' : '숨겼어요'); viewer(id); } catch (e) { toast(e.message); } };
}

function burst(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 10; i++) { const p = document.createElement('span'); p.textContent = '♥'; p.style.cssText = `position:fixed;z-index:90;left:${r.left + r.width / 2}px;top:${r.top}px;color:#ff3d6e;font-size:${14 + Math.random() * 14}px;pointer-events:none;transition:transform .8s cubic-bezier(.2,.7,.3,1),opacity .8s`; document.body.appendChild(p);
    requestAnimationFrame(() => { p.style.transform = `translate(${(Math.random() - .5) * 140}px,${-60 - Math.random() * 90}px) rotate(${(Math.random() - .5) * 60}deg)`; p.style.opacity = 0; }); setTimeout(() => p.remove(), 900); }
}

// card inspect with 3D tilt + glare
function inspect(it) {
  const d = document.createElement('div'); d.className = 'inspect';
  const maxW = Math.min(innerWidth * 0.82, 520), maxH = innerHeight * 0.72; const k = Math.min(maxW / it.w, maxH / it.h);
  const copy = { ...it, x: 0, y: 0, r: 0, tx: 0, ty: 0, w: it.w * k, h: it.h * k, shadow: 1.2, o: 1 };
  const box = document.createElement('div'); box.className = 'ins'; box.style.width = copy.w + 'px'; box.style.height = copy.h + 'px';
  const r = buildRoom({ w: copy.w, h: copy.h, bg: { theme: 'solid', c1: 'transparent', light: 0, grain: 0 }, items: [copy] }, url);
  r.style.background = 'transparent'; r.style.overflow = 'visible'; r.querySelector('.bg').style.background = 'transparent'; r.querySelector('.grain')?.remove(); r.querySelector('.ambient')?.remove();
  box.appendChild(r); box.insertAdjacentHTML('beforeend', '<i class="glare"></i>'); d.appendChild(box);
  d.insertAdjacentHTML('beforeend', `<button class="glassbtn x" data-x>${I.x}</button><p class="cap">움직여서 빛 반사를 확인해 보세요</p>`);
  document.body.appendChild(d);
  const tilt = (px, py) => { box.style.transform = `rotateY(${(px - .5) * 30}deg) rotateX(${(.5 - py) * 26}deg)`; box.style.setProperty('--gx', px * 100 + '%'); box.style.setProperty('--gy', py * 100 + '%'); };
  d.addEventListener('pointermove', e => tilt(e.clientX / innerWidth, e.clientY / innerHeight));
  const ori = e => { if (e.gamma == null) return; tilt(Math.min(1, Math.max(0, .5 + e.gamma / 50)), Math.min(1, Math.max(0, .5 + (e.beta - 40) / 50))); };
  addEventListener('deviceorientation', ori);
  const close = () => { removeEventListener('deviceorientation', ori); d.remove(); };
  d.querySelector('[data-x]').onclick = close; d.addEventListener('click', e => { if (e.target === d) close(); });
  let t = 0; const idle = () => { if (!document.body.contains(d)) return; t += 0.02; if (!d.matches(':hover')) tilt(.5 + Math.sin(t) * .18, .45 + Math.cos(t * .8) * .12); requestAnimationFrame(idle); }; idle();
}

// ---------- my page ----------
async function mine() {
  app.innerHTML = header('me') + `<main><div class="wrap"><div class="mine-head"><div><h1>내 룸</h1><p style="margin:6px 0 0;color:var(--ink2)" data-who></p></div><button class="btn accent" data-new3>${I.plus} 새 쇼케이스</button></div>
    <div class="grid" data-g>${'<div class="skel"></div>'.repeat(3)}</div><div class="acct" data-acct></div></div>${footer()}</main>`;
  wireHeader(); app.querySelector('[data-new3]').onclick = newRoom;
  const me = await getMe(true);
  app.querySelector('[data-who]').textContent = me.name ? `${me.name}님의 쇼케이스 · ${me.count}/20` : '아직 닉네임이 없어요';
  const g = app.querySelector('[data-g]');
  try { const rows = me.name ? await api.mine() : []; g.innerHTML = rows.length ? rows.map(r => tile({ ...r, owner_name: r.is_public ? '공개' : '비공개' })).join('') : `<div class="empty" style="grid-column:1/-1"><b>첫 쇼케이스를 만들어 보세요</b>카드 사진만 있으면 1분이면 충분해요.</div>`; }
  catch (e) { g.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`; }
  const a = app.querySelector('[data-acct]');
  a.innerHTML = me.name ? `<h3>계정</h3><p>포케카 룸은 젬 거래소와 계정을 함께 써요. 다른 기기에서도 쓰려면 <b>복구 코드</b>를 만들어 적어 두세요. ${me.has_recovery ? '(이미 만든 적 있어요)' : ''}</p>
      <div class="row"><button class="btn soft sm" data-code>복구 코드 ${me.has_recovery ? '새로 ' : ''}만들기</button><a class="btn ghost sm" href="https://challengeletgo.github.io/gem-exchange/">젬 거래소 가기</a><button class="btn ghost sm" data-del style="color:#d33">계정 삭제</button></div><div class="code" data-cb hidden></div>`
    : `<h3>시작하기</h3><p>닉네임을 정하면 쇼케이스를 만들 수 있어요. 젬 거래소를 쓰고 있다면 복구 코드로 같은 계정을 불러올 수 있어요.</p><div class="row"><button class="btn sm" data-start>닉네임 정하기</button></div>`;
  const st = a.querySelector('[data-start]'); if (st) st.onclick = async () => { if (await ensureName('')) mine(); };
  const cb = a.querySelector('[data-code]'); if (cb) cb.onclick = async () => {
    if (me.has_recovery && !(await confirmDlg('복구 코드를 새로 만들까요?', '새로 만들면 예전 코드는 더 이상 쓸 수 없어요.', '새로 만들기'))) return;
    try { const c = await api.makeRecovery(); const box = a.querySelector('[data-cb]'); box.textContent = c; box.hidden = false; toast('복구 코드를 꼭 따로 적어 두세요. 다시 보여 드릴 수 없어요.', 5000); } catch (e) { toast(e.message); }
  };
  const del = a.querySelector('[data-del]'); if (del) del.onclick = async () => {
    if (!(await confirmDlg('계정을 삭제할까요?', '포케카 룸 쇼케이스와 올린 사진, 젬 거래소의 닉네임·자산·기록이 모두 지워져요. 되돌릴 수 없어요.', '삭제'))) return;
    try { await api.deleteMe(); toast('계정을 삭제했어요'); setTimeout(() => { location.hash = '#/'; location.reload(); }, 1200); } catch (e) { toast(e.message); }
  };
}

// ---------- router ----------
async function route() {
  if (window.__edGuard && !window.__edGuard()) { /* editor handles its own back button; hash changes from outside are allowed */ }
  window.__edGuard = null; window.onbeforeunload = null; document.title = '포케카 룸 · 나만의 포켓몬카드 쇼케이스';
  const h = location.hash.replace(/^#\/?/, ''); const [p, a] = h.split('/');
  scrollTo(0, 0);
  try {
    if (p === 's' && a) await viewer(a);
    else if (p === 'edit' && a) await openEditor(app, { id: a });
    else if (p === 'new') await openEditor(app, { tpl: a });
    else if (p === 'me') await mine();
    else await explore();
  } catch (e) { console.error(e); app.innerHTML = header() + `<main><div class="wrap empty"><b>문제가 생겼어요</b>${esc(e.message)}<br><br><a class="btn" href="#/">처음으로</a></div></main>`; }
}

(async () => {
  try { await api.init(); } catch (e) { toast('서버에 연결하지 못했어요: ' + e.message, 6000); }
  addEventListener('hashchange', route); route();
})();
