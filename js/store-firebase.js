/* Almacenamiento en Firestore (plan Spark). Mantiene el mismo estado en memoria que usa la interfaz:
   escucha config / teams / games y, al guardar, escribe solo los documentos que cambiaron.
   Los visitantes sueltan los listeners cuando la pestaña se oculta para no gastar lecturas. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch, setDoc, query, where } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));
const clone = v => JSON.parse(JSON.stringify(v));

/* Monitoreo de uso: cada dispositivo cuenta sus lecturas/escrituras del día y las reporta junto con su "latido" a presence/{id};
   la sección Monitoreo de administración suma esos documentos. Cuesta ~1 escritura cada 2 min por dispositivo con la pantalla visible. */
const BEAT_MS = 120000;
const dayKey = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const usage = (() => {
  let u = { day: dayKey(), reads: 0, writes: 0 }, cid = '';
  try {
    cid = localStorage.getItem('torneo.cid') || '';
    if (!cid) { cid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('torneo.cid', cid); }
    const old = JSON.parse(localStorage.getItem('torneo.use') || 'null');
    if (old && old.day === u.day) u = old;
  } catch (e) { cid = cid || Math.random().toString(36).slice(2, 12); }
  const save = () => { try { localStorage.setItem('torneo.use', JSON.stringify(u)); } catch (e) { /* ignore */ } };
  const roll = () => { if (u.day !== dayKey()) u = { day: dayKey(), reads: 0, writes: 0 }; };
  return { cid, get: () => { roll(); return u; }, reads: n => { roll(); u.reads += n; save(); }, writes: n => { roll(); u.writes += n; save(); } };
})();

export function connect(cfg, host) {
  const app = initializeApp(cfg);
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const auth = getAuth(app);

  const remote = { config: null, teams: new Map(), games: new Map(), draft: new Map() };
  const known = new Map(); // 'teams/id' -> json canónico de lo que hay en el servidor
  let unsubs = [], pending = 0, staff = false, onReady = null;

  function rebuild() {
    host.setState({
      v: 1,
      config: remote.config || clone(host.DEFAULT_CONFIG),
      teams: [...remote.teams.values()].sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name)),
      games: [...remote.games.values()].sort((a, b) => a.date.localeCompare(b.date)),
      draft: Object.fromEntries([...remote.draft.entries()])
    });
  }
  function firstDone() {
    if (--pending > 0) return;
    rebuild();
    if (onReady) { onReady(); onReady = null; }
  }
  function watch(name, map) {
    let first = true;
    return onSnapshot(collection(db, name), snap => {
      if (!snap.metadata.fromCache) usage.reads(snap.docChanges().length);
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id, path = name + '/' + id;
        if (ch.type === 'removed') { map.delete(id); known.delete(path); }
        else { const d = ch.doc.data(); map.set(id, d); known.set(path, canon(d)); }
      });
      if (first) { first = false; firstDone(); } else if (pending === 0) rebuild();
    }, err => { console.error(name, err); if (first) { first = false; firstDone(); } retry(); });
  }
  function attach() {
    pending = 4;
    remote.teams.clear(); remote.games.clear(); remote.draft.clear(); known.clear();
    let firstCfg = true;
    unsubs = [
      onSnapshot(doc(db, 'config', 'main'), snap => {
        if (!snap.metadata.fromCache) usage.reads(1);
        remote.config = snap.exists() ? snap.data() : null;
        known.set('config/main', snap.exists() ? canon(remote.config) : '');
        if (firstCfg) { firstCfg = false; firstDone(); } else if (pending === 0) rebuild();
      }, err => { console.error('config', err); if (firstCfg) { firstCfg = false; firstDone(); } retry(); }),
      watch('teams', remote.teams),
      watch('games', remote.games),
      watch('draft', remote.draft)
    ];
  }
  function detach() { unsubs.forEach(u => u()); unsubs = []; }
  /* Un error de listener lo termina para siempre: se vuelve a conectar solo (visitantes con la pantalla visible o staff) */
  let retryTimer = null;
  function retry() {
    if (retryTimer || (!staff && document.hidden)) return;
    retryTimer = setTimeout(() => { retryTimer = null; if (staff || !document.hidden) { detach(); attach(); } }, 5000);
  }
  window.addEventListener('online', () => { if (staff || !document.hidden) { detach(); attach(); } });
  window.addEventListener('pageshow', e => { if (e.persisted && (staff || !document.hidden)) { detach(); attach(); } });

  let beatTimer = null, lastBeat = 0;
  function beat(force) {
    if (document.hidden) return;
    const now = Date.now();
    if (!force && now - lastBeat < 60000) return;
    lastBeat = now;
    usage.writes(1);
    const u = usage.get();
    setDoc(doc(db, 'presence', usage.cid), { t: now, day: u.day, page: (location.pathname.split('/').pop() || 'index').replace('.html', '') || 'index', reads: u.reads, writes: u.writes })
      .catch(err => console.warn('presence', err.code || err));
  }
  function beatStart() { beat(false); if (!beatTimer) beatTimer = setInterval(() => beat(true), BEAT_MS); }
  function beatStop() { clearInterval(beatTimer); beatTimer = null; }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) beatStop(); else beatStart();
    if (staff) return;
    if (document.hidden) detach(); else attach();
  });
  beatStart();

  /* Para administración: dispositivos con latido hoy (cada cambio cuesta una lectura mientras se mira la sección) */
  function watchUsage(cb) {
    return onSnapshot(query(collection(db, 'presence'), where('day', '==', dayKey())), snap => {
      if (!snap.metadata.fromCache) usage.reads(snap.docChanges().length);
      cb(snap.docs.map(d => d.data()), usage.get());
    }, err => { console.error('presence', err); cb(null, usage.get(), err); });
  }

  function save(state) {
    const sets = [], seen = new Set();
    const consider = (path, data) => {
      seen.add(path);
      const j = canon(data);
      if (known.get(path) !== j) { sets.push([path, clone(data)]); known.set(path, j); }
    };
    consider('config/main', state.config);
    state.teams.forEach(t => consider('teams/' + t.id, t));
    state.games.forEach(g => consider('games/' + g.id, g));
    Object.entries(state.draft || {}).forEach(([c, d]) => consider('draft/' + c, Object.assign({}, d, { id: c })));
    const dels = [...known.keys()].filter(p => !seen.has(p) && known.get(p) !== '');
    dels.forEach(p => known.delete(p));
    const ops = sets.map(([p, d]) => b => b.set(doc(db, p), d)).concat(dels.map(p => b => b.delete(doc(db, p))));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      ops.slice(i, i + 400).forEach(o => o(batch));
      usage.writes(Math.min(400, ops.length - i));
      batch.commit().catch(err => host.onError(err));
    }
  }

  return new Promise(resolve => {
    onReady = () => resolve({
      save, watchUsage,
      setStaff: v => { staff = v; if (v && !unsubs.length) attach(); },
      auth: {
        onChange: cb => onAuthStateChanged(auth, cb),
        login: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
        logout: () => signOut(auth)
      }
    });
    attach();
  });
}
