import { api } from './api.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const I = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
  layers: svg('<path d="M12 2l10 6-10 6L2 8z"/><path d="M2 14l10 6 10-6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  down: svg('<path d="M12 5v14M5 12l7 7 7-7"/>'),
  copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
  unlock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>'),
  flip: svg('<path d="M12 3v18M16 7l4 5-4 5M8 7l-4 5 4 5"/>'),
  center: svg('<path d="M12 3v18M7 8h10v8H7z"/>'),
  reset: svg('<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  heart: svg('<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 10-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z"/>'),
  heartF: svg('<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 10-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z" fill="currentColor"/>'),
  share: svg('<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><path d="M16 6l-4-4-4 4M12 2v14"/>'),
  download: svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
  flag: svg('<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
};

export function toast(msg, ms = 2800) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  const h = setTimeout(() => t.remove(), ms); return { close: () => { clearTimeout(h); t.remove(); } };
}

export function dialog(html, onMount) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'dlg'; d.innerHTML = `<div class="card">${html}</div>`;
    document.body.appendChild(d);
    const close = v => { d.remove(); res(v); };
    d.addEventListener('pointerdown', e => { if (e.target === d) close(null); });
    onMount?.(d, close);
  });
}

export function confirmDlg(title, sub, ok = '확인', cancel = '취소') {
  return dialog(`<h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p><div class="row"><button class="btn ghost" data-n>${esc(cancel)}</button><button class="btn ${/삭제|나가기|버리기/.test(ok) ? 'danger' : ''}" data-y>${esc(ok)}</button></div>`,
    (d, close) => { d.querySelector('[data-n]').onclick = () => close(false); d.querySelector('[data-y]').onclick = () => close(true); }).then(v => !!v);
}

let ME = null;
export async function getMe(force) { if (!ME || force) ME = await api.me(); return ME; }

// Ask for a nickname (shared with the gem exchange) when needed.
export async function ensureName(reason) {
  const me = await getMe(true);
  if (me.name) return me;
  const ok = await dialog(`<h3>닉네임 정하기</h3><p class="sub">${esc(reason || '')}<br>포케카 룸은 <b>젬 거래소</b>와 계정을 함께 써요. 이미 젬 거래소를 쓰고 있다면 <a href="#" data-rec style="text-decoration:underline">복구 코드로 불러오기</a>를 눌러 주세요.</p>
    <div data-join><div class="field"><span>닉네임 (한글·영문·숫자 2~12자)</span><input data-n maxlength="12" autocomplete="off"></div>
    <div class="field"><span>나이 (만)</span><input data-a type="number" inputmode="numeric" min="1" max="120"></div></div>
    <div data-recf hidden><div class="field"><span>젬 거래소 닉네임</span><input data-rn maxlength="20" autocomplete="off"></div><div class="field"><span>복구 코드</span><input data-rc maxlength="20" autocomplete="off" placeholder="XXXX-XXXX-XXXX"></div></div>
    <p class="err" data-e></p><p class="note" style="font-size:12px;color:var(--ink2);line-height:1.5;margin:0">만 14세 미만은 보호자 동의가 필요해서 가입할 수 없어요. 개인정보는 닉네임과 나이대만 저장해요. <a href="privacy.html" target="_blank" style="text-decoration:underline">개인정보 처리 안내</a></p>
    <div class="row"><button class="btn ghost" data-x>나중에</button><button class="btn" data-ok>시작하기</button></div>`, (d, close) => {
    let rec = false;
    d.querySelector('[data-rec]').onclick = e => { e.preventDefault(); rec = !rec; d.querySelector('[data-join]').hidden = rec; d.querySelector('[data-recf]').hidden = !rec; d.querySelector('[data-ok]').textContent = rec ? '불러오기' : '시작하기'; };
    d.querySelector('[data-x]').onclick = () => close(false);
    d.querySelector('[data-ok]').onclick = async () => {
      const err = d.querySelector('[data-e]'); err.textContent = '';
      try {
        if (rec) await api.recover(d.querySelector('[data-rn]').value.trim(), d.querySelector('[data-rc]').value.trim().toUpperCase());
        else { const a = parseInt(d.querySelector('[data-a]').value, 10); if (!a) { err.textContent = '나이를 입력해 주세요'; return; } await api.join(d.querySelector('[data-n]').value.trim(), a); }
        close(true);
      } catch (e) { err.textContent = e.message; }
    };
    setTimeout(() => d.querySelector('[data-n]').focus(), 50);
  });
  if (!ok) return null;
  return getMe(true);
}
