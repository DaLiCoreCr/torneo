/* Datos de ejemplo (inventados) para probar el prototipo. Generados con un RNG fijo: siempre salen igual. */
(function (w) {
  'use strict';

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const GIRLS = ['Valeria', 'Camila', 'Sofía', 'Daniela', 'Isabella', 'Mariana', 'Luciana', 'Ximena', 'Renata', 'Paula'];
  const BOYS = ['Mateo', 'Santiago', 'Diego', 'Emiliano', 'Sebastián', 'Gael', 'Thiago', 'Lucas', 'Andrés', 'Nicolás'];
  const LAST = ['Rojas', 'Mora', 'Vargas', 'Castro', 'Jiménez', 'Solís', 'Araya', 'Brenes', 'Quesada', 'Chaves', 'Salas', 'Méndez', 'Campos', 'Ulate'];
  const NAMES = {
    u12: ['Rayos', 'Halcones', 'Pumas', 'Tigres'],
    plus12: ['Lobos', 'Dragones', 'Panteras', 'Toros']
  };
  const COLORS = ['#c9a84c', '#e53935', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00', '#00acc1', '#d81b60'];
  const COACHES = ['Coach Ricardo M.', 'Coach Andrea L.', 'Coach Esteban V.', 'Coach Paola R.'];
  const STRENGTH = [0.62, 0.5, 0.46, 0.38];
  const USAGE = [5, 5, 4, 4, 3, 2, 1];
  const WEIGHTS = [['P2', 22], ['P3', 7], ['P1', 8], ['M2', 20], ['M3', 14], ['M1', 4], ['DREB', 14], ['OREB', 6], ['STL', 5], ['TO', 7], ['BLK', 3], ['FOUL', 10], ['FD', 7]];

  function pick(r, pairs) {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let x = r() * total;
    for (const [v, w8] of pairs) { if ((x -= w8) < 0) return v; }
    return pairs[0][0];
  }

  function buildTeams(r) {
    const teams = [];
    let n = 0;
    Object.keys(NAMES).forEach(cat => {
      NAMES[cat].forEach((name, i) => {
        const nums = [4, 7, 8, 10, 11, 12, 21, 23, 33].sort(() => r() - 0.5).slice(0, 7);
        const players = nums.map((num, k) => {
          const girl = r() < 0.5;
          const list = girl ? GIRLS : BOYS;
          return { id: 'p' + (++n), num, name: list[Math.floor(r() * list.length)] + ' ' + LAST[Math.floor(r() * LAST.length)], gender: girl ? 'F' : 'M' };
        });
        teams.push({ id: cat + '-t' + i, cat, name, coach: COACHES[i], color: COLORS[(i + (cat === 'plus12' ? 4 : 0)) % COLORS.length], str: STRENGTH[i], players });
      });
    });
    return teams;
  }

  function simulate(r, g, th, ta, periods, lastRemaining) {
    const evs = [];
    const len = T.periodLen;
    const court = { h: th.players.slice(0, 5).map(p => p.id), a: ta.players.slice(0, 5).map(p => p.id) };
    ['h', 'a'].forEach(k => court[k].forEach(pid => evs.push({ id: 's' + pid + g.id, p: 1, c: len(1), team: k, pid, type: 'SUB_IN', ts: 0 })));
    for (let p = 1; p <= periods; p++) {
      const segStart = evs.length;
      const n = 28 + Math.floor(r() * 10);
      const times = [];
      const floor = p === periods && lastRemaining != null ? lastRemaining : 0;
      for (let i = 0; i < n; i++) times.push(Math.round(floor + r() * (len(p) - floor)));
      times.sort((a, b) => b - a);
      times.forEach(c => {
        const team = r() < 0.5 + (th.str - ta.str) * 0.6 ? 'h' : 'a';
        const roster = (team === 'h' ? th : ta).players;
        const pl = () => roster[pick(r, roster.map((x, i) => [i, USAGE[i] || 1]))];
        const type = pick(r, WEIGHTS);
        const who = pl();
        evs.push({ id: 'e' + evs.length + g.id, p, c, team, pid: who.id, type, ts: 0 });
        if ((type === 'P2' || type === 'P3') && r() < 0.4) {
          const ast = pl();
          if (ast.id !== who.id) evs.push({ id: 'a' + evs.length + g.id, p, c, team, pid: ast.id, type: 'AST', ts: 0 });
        }
        if (type === 'FOUL' || type === 'M2' || type === 'M3') { /* rebote tras tiro fallado */
          if (type !== 'FOUL') {
            const other = r() < 0.55 ? (team === 'h' ? 'a' : 'h') : team;
            const rr = (other === 'h' ? th : ta).players;
            evs.push({ id: 'r' + evs.length + g.id, p, c, team: other, pid: rr[Math.floor(r() * rr.length)].id, type: other === team ? 'OREB' : 'DREB', ts: 0 });
          }
        }
      });
      if (r() < 0.8) {
        evs.push({ id: 'tm1' + p + g.id, p, c: Math.round(floor + (len(p) - floor) * 0.4), team: 'h', pid: null, type: 'TMO', ts: 0 });
      }
      if (r() < 0.6) {
        evs.push({ id: 'tm2' + p + g.id, p, c: Math.round(floor + (len(p) - floor) * 0.3), team: 'a', pid: null, type: 'TMO', ts: 0 });
      }
      /* un cambio por equipo a mitad de cada período */
      const mid = Math.round(floor + (len(p) - floor) * 0.5);
      ['h', 'a'].forEach(k => {
        const roster = (k === 'h' ? th : ta).players.map(x => x.id);
        const bench = roster.filter(id => !court[k].includes(id));
        if (!bench.length) return;
        const out = court[k][Math.floor(r() * court[k].length)], inn = bench[Math.floor(r() * bench.length)];
        court[k] = court[k].filter(id => id !== out).concat(inn);
        evs.push({ id: 'so' + k + p + g.id, p, c: mid, team: k, pid: out, type: 'SUB_OUT', ts: 0 });
        evs.push({ id: 'si' + k + p + g.id, p, c: mid, team: k, pid: inn, type: 'SUB_IN', ts: 0 });
      });
      evs.push(...evs.splice(segStart).sort((a, b) => b.c - a.c));
    }
    return evs;
  }

  function build() {
    const r = rng(2026);
    const config = JSON.parse(JSON.stringify(T.DEFAULT_CONFIG));
    const teams = buildTeams(r);
    const games = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const at = (days, h, m) => { const d = new Date(today); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0); return d; };
    const iso = d => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

    config.categories.forEach((c, ci) => {
      const ts = teams.filter(t => t.cat === c.id);
      pairs.forEach(([a, b], k) => {
        const th = ts[a], ta = ts[b];
        const g = T.newGame({ cat: c.id, home: th.id, away: ta.id, date: iso(at(0, 0)), mode: 2 });
        if (k < 3) {
          g.date = iso(at(-3 + k, 16 + ci * 2, 0));
          g.events = simulate(r, g, th, ta, 4);
          g.score = T.score(g.events);
          let period = 4;
          if (g.score.h === g.score.a) {
            g.events.push({ id: 'ot' + g.id, p: 5, c: 120000, team: 'h', pid: th.players[0].id, type: 'P2', ts: 0 });
            period = 5; g.score = T.score(g.events);
          }
          g.status = 'final';
          g.clock = { period, running: false, remainingMs: 0, startedAt: null };
        } else if (k === 3 && ci === 0) {
          g.date = iso(new Date());
          g.events = simulate(r, g, th, ta, 3, 312000);
          g.score = T.score(g.events);
          g.status = 'live';
          g.clock = { period: 3, running: true, remainingMs: 312000, startedAt: Date.now() };
        } else {
          g.date = iso(at(k === 3 ? 0 : k - 3, k === 3 ? 19 : 16 + ci * 2, 0));
        }
        games.push(g);
      });
    });
    return { v: 1, config, teams, games, draft: {} };
  }

  /* Configuración real del torneo: categorías, equipos, listas de jugadores sin equipo (con capitanes marcados, refuerzos y coaches por sortear), sin partidos ni estadísticas. */
  function real(base) {
      const cats = [
        { id: 'u12', name: 'U12', teams: [['Mickey', '#e53935'], ['Olaf', '#00acc1'], ['Woody', '#8d6e63'], ['Nemo', '#fb8c00']] },
        { id: 'plus12', name: 'Plus 12', teams: [['Rayo', '#d81b60'], ['Buzz', '#8e24aa'], ['Mike', '#43a047'], ['Simba', '#c9a84c'], ['Stitch', '#1e88e5'], ['Donald', '#3949ab']] }
      ];
      const config = Object.assign({}, base, { name: 'Torneo interno Hoopz', categories: cats.map(c => ({ id: c.id, name: c.name })) });
      const teams = cats.flatMap(c => c.teams.map(([n, color]) => ({ id: T.uid('t'), cat: c.id, name: 'Team ' + n, coach: '', color, players: [] })));
      /* Listas de jugadores sin equipo (para el sorteo). El género se deduce del nombre; se deja vacío si es ambiguo (ajustable en la pestaña Jugadores). */
      const FEM = new Set(['Sara', 'Valentina', 'Elizabeth', 'Luciana', 'Mariana', 'Naomy', 'Krisna', 'Liah', 'Maria', 'Lucia', 'Amanda', 'Celeste', 'Mia', 'Sareth', 'Dana', 'Calissa', 'Victoria', 'Fernanda']);
      const MAS = new Set(['Ben', 'Mateo', 'Diego', 'Bastian', 'Connor', 'Luka', 'Santiago', 'Liang', 'Thiago', 'Gael', 'Jonathan', 'Dylan', 'James', 'Julian', 'Ismael', 'Mathias', 'Joao', 'Samir', 'Ian', 'Luis', 'Mauricio', 'Juan', 'Jhon', 'Itay', 'Hudson', 'Samuel', 'David', 'Derek', 'Sam', 'River', 'Lucas', 'Noah', 'Leo', 'Hans', 'Benjamin', 'Ethan', 'Xavier', 'Emmanuel', 'Gabriel', 'Jeremy', 'Erick']);
      const gender = n => { const f = n.split(' ')[0].normalize('NFD').replace(/\p{M}/gu, ''); return FEM.has(f) ? 'F' : MAS.has(f) ? 'M' : ''; };
      const LISTS = {
        u12: ['Ben Kenigsvain', 'Sara Roldán', 'Mateo Fernández', 'Valentina Pérez', 'Diego Hernández', 'Elizabeth Cordero', 'Luciana Chacón', 'Connor Pladl', 'Mariana Quesada', 'Luka Miranda', 'Santiago Marín', 'Liang Mora', 'Thiago Duran', 'Gael Rivera', 'Jonathan Zenan Ocean', 'Dylan Araya', 'Dana Zúñiga Meléndez', 'Lucas Varela Charpentier', 'Calissa', 'Noah', 'Leo', 'Hans', 'Benjamin', 'Ethan'],
        plus12: ['Naomy Amen Obando', 'Sam O Neill Sweet', 'James Wilfong Valverde', 'Krisna Naranjo Chacón', 'Gael Morales Mora', 'Julián Fernández Chacón', 'Liah Quesada Agüero', 'Ismael Fonseca Ugalde', 'Mathias Herrera Vargas', 'Joao Navas Cordero', 'Samir Fernández Mora', 'Santiago Sibaja Salas', 'Ian Oguilve Agüero', 'Luis Correa Fernández', 'María F Mora Elizondo', 'Dylan Quesada Rivera', 'Mauricio Castillo Arce', 'Lucía Amen Valverde', 'Jhon Burgos Araya', 'Sareth Jiménez Mena', 'River Hermance Jiménez', 'Julián Fernández Brenes', 'Amanda Segura Acuña', 'Ismael O Neill Sweet', 'Itay Kenigsvain', 'Celeste Gonzales Guisao', 'Hudson Oconnor', 'Luis Acuña Acuña', 'Mia Azcurra', 'Mathias Castillo Mena', 'Samuel Madrigal Solano', 'David Padilla Fallas', 'Mathias Torres Fonseca', 'Xavier Robles', 'Emmanuel Vargas', 'Gabriel Hernández', 'Jeremy Martínez', 'Victoria Fallas', 'Fernanda Mata', 'Santiago Picado Ureña', 'Erick Acosta']
      };
      const CAPS = new Set(['Ben Kenigsvain', 'Sara Roldán', 'Valentina Pérez', 'Connor Pladl', 'Mathias Castillo Mena', 'Hudson Oconnor', 'Gabriel Hernández', 'David Padilla Fallas', 'Lucía Amen Valverde', 'Celeste Gonzales Guisao', 'Amanda Segura Acuña', 'Krisna Naranjo Chacón', 'Luis Correa Fernández', 'Itay Kenigsvain', 'Jhon Burgos Araya', 'Samuel Madrigal Solano']);
      /* Refuerzos: jugadores de U12 que también pueden jugar en Plus 12 (copia en su lista, marcada como refuerzo) */
      const REINF = { plus12: ['Ben Kenigsvain', 'Sara Roldán', 'Valentina Pérez'] };
      /* Coaches por categoría, para sortear en el Paso 3. U12: jugadores de Plus 12 (en 4 grupos: Lucía/Luis Correa/Dylan · Jhon/Samuel/David Padilla/Luis Acuña · Amanda/Sareth/Naomy/James · Mia/Celeste/Julián/Itay). Plus 12: 6 adultos. */
      const COACHES = {
        u12: ['Lucía Amen Valverde', 'Luis Correa Fernández', 'Dylan Quesada Rivera', 'Jhon Burgos Araya', 'Samuel Madrigal Solano', 'David Padilla Fallas', 'Luis Acuña Acuña', 'Amanda Segura Acuña', 'Sareth Jiménez Mena', 'Naomy Amen Obando', 'James Wilfong Valverde', 'Mia Azcurra', 'Celeste Gonzales Guisao', 'Julián Fernández Brenes', 'Itay Kenigsvain', 'Liah Quesada Agüero'],
        plus12: ['Daniel Hernández', 'David Zúñiga', 'Carlos Fernández Muñoz', 'Kleiber', 'Verónica Serrano', 'Fernando Quesada']
      };
      const draft = {};
      Object.keys(LISTS).forEach(k => {
        const mk = (n, re) => Object.assign({ id: T.uid('p'), name: n, gender: gender(n), captain: !re && CAPS.has(n) }, re ? { reinforce: true } : {});
        draft[k] = { pool: LISTS[k].map(n => mk(n)).concat((REINF[k] || []).map(n => mk(n, true))), parents: COACHES[k].map(n => ({ id: T.uid('c'), name: n })), last: null, group: null, done: [] };
      });
    config.captainsByCat = { u12: 1, plus12: 2 }; /* U12: un capitán por equipo; Plus 12: dos */
    return { v: 1, config, teams, games: [], draft };
  }

  w.Seed = { build, real };
})(window);
