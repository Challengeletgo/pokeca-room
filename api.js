// Backend layer. Real mode talks to the shared gem-exchange Supabase; ?mock=1 keeps everything in this browser (for testing).
const C = window.ROOM_CONFIG || {};
const MOCK = new URLSearchParams(location.search).has('mock') || !window.supabase || !C.SUPABASE_URL;
const BUCKET = 'room';

function errMsg(e) { const m = (e && (e.message || e.error_description)) || '요청을 처리하지 못했어요'; return m.replace(/^.*?ERROR:\s*/, ''); }

function supaApi() {
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  let session = null;
  const rpc = async (fn, args = {}) => { const r = await sb.rpc(fn, args); if (r.error) throw new Error(errMsg(r.error)); return r.data; };
  return {
    mock: false,
    async init() {
      const { data } = await sb.auth.getSession(); session = data.session;
      if (!session) { const r = await sb.auth.signInAnonymously(); if (r.error) throw new Error(errMsg(r.error)); session = r.data.session; }
      return session.user.id;
    },
    me: () => rpc('room_me'),
    join: (name, age) => rpc('join_game', { p_name: name, p_age: age }),
    recover: (name, code) => rpc('recover_account', { p_name: name, p_code: code }),
    makeRecovery: () => rpc('make_recovery_code'),
    async upload(blob, name) {
      const path = `${session.user.id}/${name}`;
      const r = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: true, cacheControl: '31536000' });
      if (r.error) throw new Error(errMsg(r.error));
      return path;
    },
    async removeFiles(paths) { if (paths.length) await sb.storage.from(BUCKET).remove(paths); },
    url(path) {
      if (!path) return '';
      if (/^(data:|https?:|blob:)/.test(path)) return path;
      return `${C.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    },
    list: (sort, q, offset = 0) => rpc('room_list', { p_sort: sort, p_q: q || '', p_limit: 24, p_offset: offset }),
    mine: () => rpc('room_mine'),
    get: id => rpc('room_get', { p_id: id }),
    save: s => rpc('room_save', { p_id: s.id || null, p_title: s.title, p_intro: s.intro || '', p_doc: s.doc, p_cover: s.cover || null, p_public: s.is_public !== false }),
    del: id => rpc('room_delete', { p_id: id }),
    like: id => rpc('room_like', { p_id: id }),
    view: id => rpc('room_view', { p_id: id }).catch(() => {}),
    report: (id, reason) => rpc('room_report', { p_id: id, p_reason: reason }),
    adminHide: (id, h) => rpc('room_admin_hide', { p_id: id, p_hidden: h }),
    async deleteMe() {
      const mine = await rpc('room_mine');
      const files = await sb.storage.from(BUCKET).list(session.user.id, { limit: 1000 });
      if (files.data?.length) await sb.storage.from(BUCKET).remove(files.data.map(f => `${session.user.id}/${f.name}`));
      await rpc('delete_me'); try { await sb.auth.signOut(); } catch (e) {} return mine.length;
    },
  };
}

// ---- local mock (same interface) ----
function mockApi() {
  const K = 'pokeca-mock-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch (e) { return null; } };
  let db = load() || { uid: 'u-' + Math.random().toString(36).slice(2, 8), name: null, rooms: [], likes: {}, files: {}, recovery: null };
  const save = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) { console.warn('mock storage full', e); } };
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 60));
  const pub = r => ({ id: r.id, title: r.title, intro: r.intro, cover: r.cover, owner_name: r.owner_name, like_count: r.like_count, view_count: r.view_count, updated_at: r.updated_at,
    liked: !!db.likes[r.id], items: (r.doc.items || []).length, is_public: r.is_public, hidden: false });
  return {
    mock: true,
    async init() { save(); return db.uid; },
    me: () => wait({ uid: db.uid, name: db.name, banned: false, has_recovery: !!db.recovery, is_admin: false, count: db.rooms.filter(r => r.owner === db.uid).length }),
    async join(name) { if (!/^[0-9A-Za-z가-힣_ .-]{2,12}$/.test(name.trim())) throw new Error('닉네임은 한글·영문·숫자 2~12자로 정해 주세요'); db.name = name.trim(); save(); return wait(null); },
    async recover() { throw new Error('테스트 모드에서는 복구할 수 없어요'); },
    async makeRecovery() { db.recovery = 'TEST-CODE-0000'; save(); return db.recovery; },
    async upload(blob, name) {
      const data = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      const path = `${db.uid}/${name}`; db.files[path] = data; save(); return path;
    },
    async removeFiles(paths) { paths.forEach(p => delete db.files[p]); save(); },
    url(path) { if (!path) return ''; if (/^(data:|https?:|blob:)/.test(path)) return path; return db.files[path] || ''; },
    async list(sort, q) {
      let rs = db.rooms.filter(r => r.is_public && (!q || r.title.includes(q) || (r.owner_name || '').includes(q)));
      rs.sort((a, b) => sort === 'new' ? b.updated_at.localeCompare(a.updated_at) : (b.like_count - a.like_count) || b.updated_at.localeCompare(a.updated_at));
      return wait(rs.map(pub));
    },
    mine: () => wait(db.rooms.filter(r => r.owner === db.uid).map(pub)),
    get: id => { const r = db.rooms.find(x => x.id === id); return wait(r ? { ...pub(r), doc: r.doc, mine: r.owner === db.uid } : null); },
    async save(s) {
      if (!db.name) throw new Error('닉네임을 먼저 정해 주세요');
      const now = new Date().toISOString();
      if (!s.title || s.title.trim().length > 40) throw new Error('제목은 1~40자로 써 주세요');
      let r = s.id && db.rooms.find(x => x.id === s.id);
      if (!r) { r = { id: 'r' + Date.now().toString(36), owner: db.uid, owner_name: db.name, like_count: 0, view_count: 0, created_at: now }; db.rooms.push(r); }
      Object.assign(r, { title: s.title.trim(), intro: s.intro || '', doc: s.doc, cover: s.cover || r.cover, is_public: s.is_public !== false, updated_at: now });
      save(); return wait(r.id);
    },
    async del(id) { db.rooms = db.rooms.filter(r => r.id !== id); save(); },
    async like(id) { const r = db.rooms.find(x => x.id === id); db.likes[id] = !db.likes[id]; r.like_count += db.likes[id] ? 1 : -1; save(); return { liked: db.likes[id], count: r.like_count }; },
    async view(id) { const r = db.rooms.find(x => x.id === id); if (r && r.owner !== db.uid) { r.view_count++; save(); } },
    async report() { return wait(null); },
    async adminHide() {},
    async deleteMe() { localStorage.removeItem(K); return 0; },
  };
}

export const api = MOCK ? mockApi() : supaApi();
export { errMsg };
