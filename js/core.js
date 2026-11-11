/* Núcleo: datos, reglas del juego, estadísticas y posiciones.
   Capa de almacenamiento = localStorage (prototipo). Para Firebase solo se reemplaza el bloque "Store". */
(function (w) {
  'use strict';

  const KEY = 'torneo.v1';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = p => p + Math.random().toString(36).slice(2, 8);

  const DEFAULT_CONFIG = {
    name: 'Torneo interno Hoopz',
    categories: [
      { id: 'u12', name: 'U12' },
      { id: 'plus12', name: 'Plus 12' }
    ],
    rules: { periods: 4, minutes: 8, otMinutes: 5, foulsOut: 5, bonusFouls: 5, timeouts: 4, onCourt: 5, ptsWin: 3, ptsDraw: 2, ptsLoss: 1, forfeitWin: 20, forfeitLoss: 0 },
    refreshSec: 15
  };

  /* lvl = nivel mínimo de captura: 0 básico, 1 intermedio, 2 completo */
  const ACTIONS = {
    P1: { l: '+1', name: 'Tiro libre anotado', pts: 1, lvl: 0, k: 'score' },
    P2: { l: '+2', name: 'Tiro de 2 anotado', pts: 2, lvl: 0, k: 'score' },
    P3: { l: '+3', name: 'Triple anotado', pts: 3, lvl: 0, k: 'score' },
    M1: { l: 'Falla TL', name: 'Tiro libre fallado', lvl: 1, k: 'miss' },
    M2: { l: 'Falla 2', name: 'Tiro de 2 fallado', lvl: 1, k: 'miss' },
    M3: { l: 'Falla 3', name: 'Triple fallado', lvl: 1, k: 'miss' },
    OREB: { l: 'Reb. ofensivo', name: 'Rebote ofensivo', lvl: 1, k: 'stat' },
    DREB: { l: 'Reb. defensivo', name: 'Rebote defensivo', lvl: 1, k: 'stat' },
    AST: { l: 'Asistencia', name: 'Asistencia', lvl: 1, k: 'stat' },
    STL: { l: 'Robo', name: 'Robo de balón', lvl: 1, k: 'stat' },
    BLK: { l: 'Tapón', name: 'Tapón', lvl: 1, k: 'stat' },
    TO: { l: 'Pérdida', name: 'Pérdida de balón', lvl: 1, k: 'stat' },
    FOUL: { l: 'Falta cometida', name: 'Falta cometida', lvl: 0, k: 'foul' },
    FD: { l: 'Falta recibida', name: 'Falta recibida', lvl: 2, k: 'stat' },
    TMO: { l: 'Tiempo muerto', name: 'Tiempo muerto', lvl: 0, team: true },
    SUB_IN: { l: 'Entra', name: 'Entra a cancha', lvl: 0, sub: true },
    SUB_OUT: { l: 'Sale', name: 'Sale a la banca', lvl: 0, sub: true }
  };
  const MODES = ['Básico', 'Intermedio', 'Completo'];

  /* ---------- Store (localStorage) ---------- */
  let state = null;
  const subs = [];

  function readRaw() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  let backend = null;
  const notify = () => subs.forEach(f => f(state));
  function persist() {
    if (backend) return backend.save(state);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }
  /* Con Firebase configurado se usa la nube; con ?local=1 se usan datos de ejemplo en este navegador */
  function useCloud() {
    try {
      if (/[?&]local=1/.test(location.search)) sessionStorage.setItem('torneo.local', '1');
      if (/[?&]local=0/.test(location.search)) sessionStorage.removeItem('torneo.local');
      return !!w.FIREBASE_CONFIG && sessionStorage.getItem('torneo.local') !== '1';
    } catch (e) { return !!w.FIREBASE_CONFIG; }
  }
  /* load({ live: false }): páginas que no necesitan tiempo real (leen una vez y refrescan cada tanto, para ahorrar lecturas) */
  function load(opts) {
    w.T.live = !(opts && opts.live === false);
    if (useCloud()) {
      const emptyState = () => ({ v: 1, config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)), teams: [], games: [], draft: {} });
      state = emptyState();
      return import(new URL('js/store-firebase.js', document.baseURI).href)
        .then(m => m.connect(w.FIREBASE_CONFIG, {
          DEFAULT_CONFIG,
          setState: s => { state = s; notify(); },
          onError: err => { console.error(err); if (w.UI) w.UI.toast(err.code === 'permission-denied' ? 'Sin permiso para guardar: inicia sesión con un correo autorizado' : 'No se pudo guardar: ' + err.message, 'bad'); }
        }, opts))
        .then(b => { backend = b; w.T.cloud = true; w.T.auth = b.auth; w.T.setStaff = b.setStaff; w.T.watchUsage = b.watchUsage; return state; })
        .catch(err => { console.error(err); w.T.offline = true; return state; });
    }
    state = readRaw();
    if (!state) { state = w.Seed.build(); persist(); }
    state.draft = state.draft || {};
    return Promise.resolve(state);
  }
  function reload() { if (backend) return state; const s = readRaw(); if (s) state = s; return state; }
  function mutate(fn) { fn(state); persist(); subs.forEach(f => f(state)); }
  function subscribe(f) { subs.push(f); }
  function replaceAll(s) { state = s; persist(); notify(); }
  w.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); subs.forEach(f => f(state)); }
  });

  const cfg = () => (state ? state.config : DEFAULT_CONFIG);
  const game = id => state.games.find(g => g.id === id);

  /* ---------- Reloj ---------- */
  const periodLen = p => (p <= cfg().rules.periods ? cfg().rules.minutes : cfg().rules.otMinutes) * 60000;
  const periodLabel = p => (p <= cfg().rules.periods ? 'Q' + p : 'OT' + (p - cfg().rules.periods));
  const remaining = (g, now = Date.now()) =>
    g.clock.running ? Math.max(0, g.clock.remainingMs - (now - g.clock.startedAt)) : g.clock.remainingMs;
  function fmtClock(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- Partidos ---------- */
  function newGame({ cat, home, away, date, mode }) {
    return {
      id: uid('g'), cat, home, away, date, mode: mode ?? 1, status: 'scheduled',
      clock: { period: 1, running: false, remainingMs: periodLen(1), startedAt: null },
      score: { h: 0, a: 0 }, events: []
    };
  }
  function score(events) {
    const s = { h: 0, a: 0 };
    events.forEach(e => { const a = ACTIONS[e.type]; if (a && a.pts) s[e.team] += a.pts; });
    return s;
  }
  function addEvent(g, ev) {
    g.events.push(Object.assign({ id: uid('e'), p: g.clock.period, c: remaining(g), ts: Date.now() }, ev));
    g.score = score(g.events);
    if (g.status === 'scheduled') g.status = 'live';
  }
  function undo(g) { const e = g.events.pop(); g.score = score(g.events); return e; }
  function startClock(g) {
    if (g.clock.running || g.clock.remainingMs <= 0) return;
    g.clock.running = true; g.clock.startedAt = Date.now();
    if (g.status === 'scheduled') g.status = 'live';
  }
  function pauseClock(g) {
    if (!g.clock.running) return;
    g.clock.remainingMs = remaining(g); g.clock.running = false; g.clock.startedAt = null;
  }
  function setClock(g, ms) {
    g.clock.remainingMs = Math.max(0, ms);
    if (g.clock.running) g.clock.startedAt = Date.now();
  }
  function nextPeriod(g) {
    pauseClock(g); g.clock.period++; g.clock.remainingMs = periodLen(g.clock.period);
  }
  function finishGame(g) { pauseClock(g); g.status = 'final'; if (!g.forfeit) g.score = score(g.events); }
  /* Quita la última jugada de un jugador (captura sin tiempos) */
  function removeEvent(g, team, pid, type) {
    for (let i = g.events.length - 1; i >= 0; i--) {
      const e = g.events[i];
      if (e.team === team && e.pid === pid && e.type === type) { g.events.splice(i, 1); g.score = score(g.events); return true; }
    }
    return false;
  }
  /* No presentación: 'side' es el equipo que NO llegó; el otro gana con el marcador definido en Reglas */
  function forfeitGame(g, side, R) {
    const win = R.forfeitWin ?? 20, loss = R.forfeitLoss ?? 0;
    pauseClock(g);
    g.events = []; g.forfeit = side; g.status = 'final';
    g.score = side === 'h' ? { h: loss, a: win } : { h: win, a: loss };
  }
  function clearForfeit(g) { delete g.forfeit; g.status = 'live'; g.score = score(g.events); }

  /* ---------- En cancha, minutos y +/- (se calculan recorriendo los cambios registrados) ---------- */
  const elapsed = (p, c) => { let t = 0; for (let i = 1; i < p; i++) t += periodLen(i); return t + periodLen(p) - c; };
  const hasSubs = g => g.events.some(e => e.type === 'SUB_IN');
  function onCourt(g) {
    const on = { h: new Set(), a: new Set() };
    g.events.forEach(e => {
      if (e.type === 'SUB_IN') on[e.team].add(e.pid);
      else if (e.type === 'SUB_OUT') on[e.team].delete(e.pid);
    });
    return on;
  }
  function minutesPM(g) {
    const out = {}, open = {}, sc = { h: 0, a: 0 };
    const acc = pid => out[pid] || (out[pid] = { ms: 0, pm: 0 });
    const diff = team => sc[team] - sc[team === 'h' ? 'a' : 'h'];
    const close = (pid, t) => {
      const o = open[pid];
      if (!o) return;
      const a = acc(pid);
      a.ms += Math.max(0, t - o.t); a.pm += diff(o.team) - o.diff;
      delete open[pid];
    };
    g.events.forEach(e => {
      const a = ACTIONS[e.type];
      if (a && a.pts) sc[e.team] += a.pts;
      if (e.type === 'SUB_IN' && !open[e.pid]) { open[e.pid] = { t: elapsed(e.p, e.c), diff: diff(e.team), team: e.team }; acc(e.pid); }
      else if (e.type === 'SUB_OUT') close(e.pid, elapsed(e.p, e.c));
    });
    const now = elapsed(g.clock.period, remaining(g));
    Object.keys(open).forEach(pid => close(pid, now));
    return out;
  }

  const teamFouls = (g, team, period) => g.events.filter(e => e.team === team && e.type === 'FOUL' && e.p === period).length;
  const timeoutsUsed = (g, team) => g.events.filter(e => e.team === team && e.type === 'TMO').length;

  /* ---------- Estadísticas ---------- */
  const blank = () => ({ gp: 0, pts: 0, p1m: 0, p1a: 0, p2m: 0, p2a: 0, p3m: 0, p3a: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, to: 0, blk: 0, pf: 0, fd: 0 });
  function applyEvent(s, t) {
    switch (t) {
      case 'P1': s.pts += 1; s.p1m++; s.p1a++; break;
      case 'P2': s.pts += 2; s.p2m++; s.p2a++; break;
      case 'P3': s.pts += 3; s.p3m++; s.p3a++; break;
      case 'M1': s.p1a++; break;
      case 'M2': s.p2a++; break;
      case 'M3': s.p3a++; break;
      case 'OREB': s.oreb++; break;
      case 'DREB': s.dreb++; break;
      case 'AST': s.ast++; break;
      case 'STL': s.stl++; break;
      case 'TO': s.to++; break;
      case 'BLK': s.blk++; break;
      case 'FOUL': s.pf++; break;
      case 'FD': s.fd++; break;
    }
  }
  function playerStats(events, into) {
    const out = into || {};
    events.forEach(e => { if (e.pid) applyEvent(out[e.pid] || (out[e.pid] = blank()), e.type); });
    return out;
  }
  function derive(s) {
    return Object.assign({}, s, { reb: s.oreb + s.dreb, fgm: s.p2m + s.p3m, fga: s.p2a + s.p3a });
  }
  function sumStats(list) {
    const t = blank();
    list.forEach(s => Object.keys(t).forEach(k => { if (k !== 'gp') t[k] += s[k] || 0; }));
    return t;
  }
  const pct = (m, a) => (a ? Math.round((m / a) * 100) + '%' : '–');

  function playerIndex(S) {
    const idx = {};
    S.teams.forEach(t => t.players.forEach(p => { idx[p.id] = { p, team: t }; }));
    return idx;
  }

  /* Acumulado del torneo por jugador (partidos en vivo y finalizados) */
  function tournamentStats(S, cat) {
    const idx = playerIndex(S);
    const acc = {};
    S.games.filter(g => g.cat === cat && g.status === 'final').forEach(g => {
      const per = playerStats(g.events);
      const mp = hasSubs(g) ? minutesPM(g) : {};
      Object.keys(per).forEach(pid => {
        const a = acc[pid] || (acc[pid] = Object.assign(blank(), { ms: 0, pm: 0, mgp: 0 }));
        a.gp++;
        if (mp[pid]) { a.ms += mp[pid].ms; a.pm += mp[pid].pm; a.mgp++; }
        Object.keys(per[pid]).forEach(k => { if (k !== 'gp') a[k] += per[pid][k]; });
      });
    });
    return Object.keys(acc).filter(pid => idx[pid]).map(pid => Object.assign(derive(acc[pid]), { pid, player: idx[pid].p, team: idx[pid].team }));
  }

  /* ---------- Posiciones ---------- */
  function standings(S, cat) {
    const R = S.config.rules;
    const rows = {};
    S.teams.filter(t => t.cat === cat).forEach(t => { rows[t.id] = { team: t, pj: 0, g: 0, e: 0, p: 0, pf: 0, pc: 0, pts: 0 }; });
    S.games.filter(g => g.cat === cat && !g.stage && g.status === 'final').forEach(g => { // las llaves (semifinal, final) no cuentan en la tabla
      const h = rows[g.home], a = rows[g.away];
      if (!h || !a) return;
      h.pj++; a.pj++;
      const wo = g.forfeit ? (g.forfeit === 'h' ? h : a) : null; // el que no se presentó no suma punto de participación
      h.pf += g.score.h; h.pc += g.score.a; a.pf += g.score.a; a.pc += g.score.h;
      if (g.score.h > g.score.a) { h.g++; a.p++; h.pts += R.ptsWin; a.pts += R.ptsLoss; }
      else if (g.score.h < g.score.a) { a.g++; h.p++; a.pts += R.ptsWin; h.pts += R.ptsLoss; }
      else { h.e++; a.e++; h.pts += R.ptsDraw; a.pts += R.ptsDraw; }
      if (wo) wo.pts -= R.ptsLoss;
    });
    return Object.values(rows).map(r => Object.assign(r, { dif: r.pf - r.pc }))
      .sort((x, y) => y.pts - x.pts || y.dif - x.dif || y.pf - x.pf || x.team.name.localeCompare(y.team.name));
  }

  /* ---------- Sorteo de partidos y llaves ----------
     Fase regular: todos contra todos a una vuelta (partidos sin "stage"). Llaves: games con stage 'sf' (slot 1-2), 'final' o 'third'.
     Las categorías nunca se mezclan. Las llaves se arman con los mejores de la tabla de posiciones. */
  const STAGES = { sf: 'Semifinal', final: 'Final', third: 'Tercer lugar' };
  const shuffleArr = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad2 = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const addMin = (iso, m) => isoLocal(new Date(new Date(iso).getTime() + m * 60000));
  const stageName = g => (g.stage === 'sf' ? 'Semifinal ' + g.slot : STAGES[g.stage] || '');
  const leagueGames = (S, cat) => S.games.filter(g => g.cat === cat && !g.stage);
  const playoffGames = (S, cat) => S.games.filter(g => g.cat === cat && g.stage);
  const gameWinner = g => (g.status === 'final' && g.score.h !== g.score.a ? (g.score.h > g.score.a ? g.home : g.away) : null);
  const gameLoser = g => (g.status === 'final' && g.score.h !== g.score.a ? (g.score.h > g.score.a ? g.away : g.home) : null);
  const pushGame = (S, cat, o, date, stage, slot, h, a, extra) => {
    const g = newGame({ cat, home: h, away: a, date, mode: o.mode });
    if (stage) { g.stage = stage; g.slot = slot; }
    S.games.push(Object.assign(g, extra || {}));
  };
  /* Todos contra todos (método del círculo, orden al azar). o = { start, gapMin, mode }. Devuelve cuántos partidos creó, o -1 si ya hay partidos iniciados */
  function drawLeague(S, cat, o) {
    if (leagueGames(S, cat).some(g => g.status !== 'scheduled')) return -1;
    const ids = shuffleArr(S.teams.filter(t => t.cat === cat).map(t => t.id));
    if (ids.length < 2) return 0;
    S.games = S.games.filter(g => !(g.cat === cat && !g.stage));
    if (ids.length % 2) ids.push(null);
    const n = ids.length;
    let t = o.start, count = 0;
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = ids[i], b = ids[n - 1 - i];
        if (!a || !b) continue;
        const flip = Math.random() < 0.5;
        pushGame(S, cat, o, t, null, 0, flip ? a : b, flip ? b : a);
        t = addMin(t, o.gapMin); count++;
      }
      ids.splice(1, 0, ids.pop());
    }
    return count;
  }
  /* Llaves: los n mejores de la tabla (2 = solo final, 4 = semifinales 1.º vs 4.º y 2.º vs 3.º). o = { start, gapMin, mode, n, third } */
  function drawPlayoffs(S, cat, o) {
    if (playoffGames(S, cat).some(g => g.status !== 'scheduled')) return -1;
    const top = standings(S, cat).slice(0, o.n).map(r => r.team.id);
    if (top.length < o.n) return 0;
    S.games = S.games.filter(g => !(g.cat === cat && g.stage));
    if (o.n === 2) { pushGame(S, cat, o, o.start, 'final', 1, top[0], top[1], { seeds: { h: 1, a: 2 } }); return 1; }
    pushGame(S, cat, o, o.start, 'sf', 1, top[0], top[3], { seeds: { h: 1, a: 4 }, thirdPlace: !!o.third });
    pushGame(S, cat, o, addMin(o.start, o.gapMin), 'sf', 2, top[1], top[2], { seeds: { h: 2, a: 3 }, thirdPlace: !!o.third });
    return 2;
  }
  /* Con las semifinales terminadas crea la final (y el tercer lugar). Devuelve: ok | nosf | exists | pending | tie */
  function advancePlayoffs(S, cat, o) {
    const sf = S.games.filter(g => g.cat === cat && g.stage === 'sf').sort((a, b) => a.slot - b.slot);
    if (sf.length < 2) return 'nosf';
    if (S.games.some(g => g.cat === cat && g.stage === 'final')) return 'exists';
    if (sf.some(g => g.status !== 'final')) return 'pending';
    if (sf.some(g => !gameWinner(g))) return 'tie';
    pushGame(S, cat, o, o.start, 'final', 1, gameWinner(sf[0]), gameWinner(sf[1]));
    if (sf[0].thirdPlace) pushGame(S, cat, o, addMin(o.start, -o.gapMin), 'third', 1, gameLoser(sf[0]), gameLoser(sf[1]));
    return 'ok';
  }

  /* ---------- Sorteo de equipos ----------
     state.draft[cat] = { pool: [jugadores sin equipo], last: última asignación suelta, group: último equipo sorteado, done: [equipos ya sorteados] } */
  const draftOf = (S, cat) => Object.assign({ pool: [], last: null, group: null, done: [] }, (S.draft || {})[cat]);
  function draftW(S, cat) {
    S.draft = S.draft || {};
    const d = S.draft[cat] || (S.draft[cat] = { pool: [], last: null, group: null, done: [] });
    d.pool = d.pool || [];
    return d;
  }
  function freeNum(t, want) {
    const used = new Set(t.players.map(p => p.num));
    if (Number.isInteger(want) && want > 0 && !used.has(want)) return want;
    let n = 1; while (used.has(n)) n++;
    return n;
  }
  function draftAssign(S, cat, pid, teamId) {
    const t = S.teams.find(x => x.id === teamId);
    if (!t) return false;
    const d = draftW(S, cat);
    let p = null;
    const i = d.pool.findIndex(x => x.id === pid);
    if (i >= 0) p = d.pool.splice(i, 1)[0];
    else {
      const from = S.teams.find(x => x.players.some(y => y.id === pid));
      if (!from || from.id === teamId) return false;
      if (from.players.find(y => y.id === pid).captain) return false; // un capitán no cambia de equipo: primero se devuelve con ✕
      p = from.players.splice(from.players.findIndex(y => y.id === pid), 1)[0];
    }
    p.num = freeNum(t, p.num);
    t.players.push(p);
    d.last = { pid: p.id, name: p.name, teamId, cap: !!p.captain, ts: Date.now() };
    return true;
  }
  function draftReturn(S, cat, pid) {
    const from = S.teams.find(x => x.players.some(y => y.id === pid));
    if (!from) return false;
    const p = from.players.splice(from.players.findIndex(y => y.id === pid), 1)[0];
    delete p.num;
    const d = draftW(S, cat);
    d.pool.push(p); d.last = null;
    return true;
  }
  const hasCaptain = t => t.players.some(p => p.captain);
  /* Fase 1: sortea un capitán (entre los marcados con C y sin equipo) para un equipo que aún no tiene. Un capitán nunca queda en dos equipos. */
  function draftCaptain(S, cat, teamId) {
    const t = S.teams.find(x => x.id === teamId && x.cat === cat);
    const d = draftW(S, cat);
    if (!t) return 'noteam';
    if (hasCaptain(t)) return 'has';
    const caps = d.pool.filter(p => p.captain);
    if (!caps.length) return 'none';
    const p = caps[Math.floor(Math.random() * caps.length)];
    d.pool.splice(d.pool.findIndex(x => x.id === p.id), 1);
    p.num = freeNum(t, p.num);
    t.players.push(p);
    d.last = { pid: p.id, name: p.name, teamId, cap: true, ts: Date.now() };
    d.group = null;
    return 'ok';
  }
  /* Fase 2: sortea el equipo completo con los jugadores sin equipo (los capitanes no entran). Equilibrio automático:
     entre los equipos que faltan por sortear, cada uno recibe piso o techo del promedio, tanto en cantidad total como en niñas
     (se cuentan los jugadores que el equipo ya tiene, p. ej. su capitán). Se recalcula con lo que queda en cada sorteo. */
  function draftGroup(S, cat, teamId) {
    const t = S.teams.find(x => x.id === teamId && x.cat === cat);
    const d = draftW(S, cat);
    if (!t) return 0;
    const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const isF = p => p.gender === 'F';
    const elig = d.pool.filter(p => !p.captain);
    if (!elig.length) return 0;
    const done = d.done || [];
    const left = S.teams.filter(x => x.cat === cat && (x.id === teamId || !done.includes(x.id)));
    const k = left.length;
    const F = shuffle(elig.filter(isF)), R = shuffle(elig.filter(p => !isF(p)));
    const share = tot => { const base = Math.floor(tot / k), rem = tot % k; return base + (Math.random() < rem / k ? 1 : 0); };
    const have = left.reduce((n, x) => n + x.players.length, 0), haveF = left.reduce((n, x) => n + x.players.filter(isF).length, 0);
    const size = share(have + elig.length), fTarget = share(haveF + F.length);
    const tF = t.players.filter(isF).length;
    const nNew = Math.min(elig.length, Math.max(0, size - t.players.length));
    const fNew = Math.max(Math.max(0, nNew - R.length), Math.min(Math.min(nNew, F.length), Math.max(0, fTarget - tF)));
    const picked = F.slice(0, fNew).concat(R.slice(0, nNew - fNew));
    picked.forEach(p => {
      d.pool.splice(d.pool.findIndex(x => x.id === p.id), 1);
      p.num = freeNum(t, p.num);
      t.players.push(p);
    });
    d.done = done.filter(x => x !== teamId).concat(teamId);
    d.group = { teamId, pids: picked.map(p => p.id), roster: t.players.map(p => ({ id: p.id, name: p.name, cap: !!p.captain })), ts: Date.now() };
    d.last = null;
    return picked.length;
  }
  /* Deshace lo más reciente: el equipo sorteado completo o la última asignación suelta */
  function draftUndo(S, cat) {
    const d = draftW(S, cat), g = d.group, l = d.last;
    if (g && (!l || g.ts >= l.ts)) {
      const team = S.teams.find(x => x.id === g.teamId);
      g.pids.forEach(pid => { if (team && team.players.some(y => y.id === pid)) draftReturn(S, cat, pid); });
      d.done = (d.done || []).filter(x => x !== g.teamId);
      d.group = null; d.last = null;
      return true;
    }
    if (l) return draftReturn(S, cat, l.pid);
    return false;
  }

  /* Un equipo puede tener varios coaches: t.coaches es la lista; t.coach guarda los nombres unidos para compatibilidad */
  const coachList = t => (Array.isArray(t.coaches) ? t.coaches : (t.coach ? [t.coach] : []));
  function setCoaches(t, list) { t.coaches = list; t.coach = list.join(', '); }

  w.T = {
    coachList, setCoaches,
    STAGES, stageName, leagueGames, playoffGames, gameWinner, gameLoser, isoLocal, addMin, drawLeague, drawPlayoffs, advancePlayoffs,
    draft: draftOf, draftW, draftAssign, draftReturn, draftGroup, draftCaptain, hasCaptain, draftUndo,
    cloud: false, live: true, offline: false, auth: null, setStaff: () => {}, watchUsage: null,
    KEY, esc, uid, DEFAULT_CONFIG, ACTIONS, MODES,
    load, reload, mutate, subscribe, replaceAll, state: () => state, game, cfg,
    periodLen, periodLabel, remaining, fmtClock,
    onCourt, hasSubs, minutesPM, newGame, score, addEvent, undo, startClock, pauseClock, setClock, nextPeriod, finishGame, removeEvent, forfeitGame, clearForfeit, teamFouls, timeoutsUsed,
    blank, playerStats, derive, sumStats, pct, playerIndex, tournamentStats, standings
  };
})(window);
