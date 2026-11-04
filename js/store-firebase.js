/* Almacenamiento en Firestore (plan Spark). Mantiene el mismo estado en memoria que usa la interfaz:
   escucha config / teams / games y, al guardar, escribe solo los documentos que cambiaron.
   Los visitantes sueltan los listeners cuando la pestaña se oculta para no gastar lecturas. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));
const clone = v => JSON.parse(JSON.stringify(v));

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
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id, path = name + '/' + id;
        if (ch.type === 'removed') { map.delete(id); known.delete(path); }
        else { const d = ch.doc.data(); map.set(id, d); known.set(path, canon(d)); }
      });
      if (first) { first = false; firstDone(); } else if (pending === 0) rebuild();
    }, err => { console.error(name, err); if (first) { first = false; firstDone(); } });
  }
  function attach() {
    pending = 4;
    remote.teams.clear(); remote.games.clear(); remote.draft.clear(); known.clear();
    let firstCfg = true;
    unsubs = [
      onSnapshot(doc(db, 'config', 'main'), snap => {
        remote.config = snap.exists() ? snap.data() : null;
        known.set('config/main', snap.exists() ? canon(remote.config) : '');
        if (firstCfg) { firstCfg = false; firstDone(); } else if (pending === 0) rebuild();
      }, err => { console.error('config', err); if (firstCfg) { firstCfg = false; firstDone(); } }),
      watch('teams', remote.teams),
      watch('games', remote.games),
      watch('draft', remote.draft)
    ];
  }
  function detach() { unsubs.forEach(u => u()); unsubs = []; }

  document.addEventListener('visibilitychange', () => {
    if (staff) return;
    if (document.hidden) detach(); else attach();
  });

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
      batch.commit().catch(err => host.onError(err));
    }
  }

  return new Promise(resolve => {
    onReady = () => resolve({
      save,
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
