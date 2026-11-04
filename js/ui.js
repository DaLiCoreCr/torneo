/* Piezas de interfaz compartidas: cabecera, cinta de partidos, tarjetas, selector de categoría, PIN de staff. */
(function (w) {
  'use strict';
  const { esc } = T;
  const PIN = '1234'; // solo prototipo; con Firebase se reemplaza por login real

  const initials = n => n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const fmtDate = iso => new Date(iso).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  const fmtTime = iso => new Date(iso).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
  const catName = (S, id) => (S.config.categories.find(c => c.id === id) || { name: id }).name;
  const team = (S, id) => S.teams.find(t => t.id === id) || { id, name: '—', players: [], color: '#555' };
  const badge = t => `<span class="badge" style="--c:${esc(t.color || '#c9a84c')}">${esc(initials(t.name))}</span>`;
  const byDate = (a, b) => a.date.localeCompare(b.date);

  function clockText(g) {
    return g.status === 'final' ? 'Final' : T.periodLabel(g.clock.period) + ' ' + T.fmtClock(T.remaining(g));
  }

  function renderTicker() {
    const el = document.getElementById('ticker');
    if (!el) return;
    const S = T.state();
    const items = [];
    S.games.filter(g => g.status === 'live').forEach(g => {
      items.push(`<span class="tk live"><i class="dot"></i>EN VIVO · ${esc(team(S, g.home).name)} ${g.score.h}–${g.score.a} ${esc(team(S, g.away).name)}</span>`);
    });
    S.games.filter(g => g.status === 'scheduled').sort(byDate).slice(0, 4).forEach(g => {
      items.push(`<span class="tk">Próximo · ${esc(team(S, g.home).name)} vs ${esc(team(S, g.away).name)} · ${fmtDate(g.date)} ${fmtTime(g.date)}</span>`);
    });
    if (!items.length) items.push('<span class="tk">' + esc(S.config.name) + '</span>');
    const row = items.join('');
    el.innerHTML = `<div class="tk-track">${row}${row}</div>`;
  }

  function layout(active) {
    document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="assets/logo.jpg">');
    const S = T.state();
    const links = [['index.html', 'live', 'En vivo'], ['resultados.html', 'res', 'Resultados'], ['posiciones.html', 'pos', 'Posiciones'], ['estadisticas.html', 'est', 'Estadísticas']]
      .map(([h, k, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('');
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="ticker" id="ticker"></div>
       <header class="top"><div class="wrap top-in">
         <a class="brand" href="index.html">
           <img class="brand-logo" src="assets/logo.jpg" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'brand-mark',textContent:'H'}))">
           <span class="brand-txt">HOOPZ<small>${esc(S.config.name)}</small></span>
         </a>
         <nav>${links}</nav>
       </div></header>`);
    document.body.insertAdjacentHTML('beforeend',
      `<footer class="foot"><div class="wrap">
         <span>${esc(S.config.name)} · Hoopz Academia de Baloncesto</span>
         <span class="staff">Staff: <a href="mesa.html">Mesa de anotación</a> · <a href="admin.html">Administración</a></span>
       </div></footer>`);
    if (T.offline) document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="wrap"><div class="empty" style="margin-top:16px;border-color:var(--live);color:var(--live)">No se pudo conectar con la base de datos. Revisa tu conexión y recarga la página.</div></div>');
    renderTicker();
    T.subscribe(renderTicker);
    setInterval(tick, 500);
  }

  function tick() {
    document.querySelectorAll('.clk[data-gid]').forEach(el => {
      const g = T.game(el.dataset.gid);
      if (g) el.textContent = clockText(g);
    });
  }

  /* Refresca la vista cada N segundos (solo con la pestaña visible), como lo haría el sondeo contra Firebase */
  function autoRefresh(render) {
    T.subscribe(render);
    setInterval(() => { if (!document.hidden) { T.reload(); render(); renderTicker(); } }, T.state().config.refreshSec * 1000);
  }

  function getCat(allowAll) {
    const S = T.state();
    let c = null;
    try { c = localStorage.getItem('torneo.cat'); } catch (e) { /* ignore */ }
    const ids = S.config.categories.map(x => x.id);
    if (c === 'all' && allowAll) return 'all';
    return ids.includes(c) ? c : (allowAll ? 'all' : ids[0]);
  }

  function catPicker(el, opts, onChange) {
    const S = T.state();
    let cur = getCat(opts.all);
    const draw = () => {
      const items = (opts.all ? [{ id: 'all', name: 'Todas' }] : []).concat(S.config.categories);
      el.innerHTML = items.map(c => `<button class="pill ${c.id === cur ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('');
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      cur = b.dataset.cat;
      try { localStorage.setItem('torneo.cat', cur); } catch (err) { /* ignore */ }
      draw(); onChange(cur);
    });
    draw();
    return cur;
  }

  function gameCard(g) {
    const S = T.state();
    const h = team(S, g.home), a = team(S, g.away);
    const fin = g.status === 'final', live = g.status === 'live';
    const status = live ? '<span class="chip live"><i class="dot"></i>EN VIVO</span>'
      : fin ? '<span class="chip">FINAL</span>' : `<span class="chip soft">${fmtTime(g.date)}</span>`;
    const row = (t, sc, win) => `<div class="g-row ${win ? 'win' : ''}">${badge(t)}<span class="tname">${esc(t.name)}</span><span class="sc">${g.status === 'scheduled' ? '–' : sc}</span></div>`;
    return `<a class="game ${live ? 'is-live' : ''}" href="partido.html?id=${esc(g.id)}">
      <div class="g-meta"><span>${esc(catName(S, g.cat))} · ${fmtDate(g.date)}</span>${status}</div>
      ${row(h, g.score.h, fin && g.score.h > g.score.a)}
      ${row(a, g.score.a, fin && g.score.a > g.score.h)}
      ${live ? `<div class="g-clock"><span class="clk" data-gid="${esc(g.id)}">${clockText(g)}</span></div>` : ''}
    </a>`;
  }

  function standingsTable(S, cat, compact) {
    const rows = T.standings(S, cat);
    const R = S.config.rules;
    const body = rows.map((r, i) => compact
      ? `<tr><td class="pos">${i + 1}</td><td class="tm">${badge(r.team)}<span>${esc(r.team.name)}</span></td><td>${r.pj}</td><td class="hl">${r.pts}</td></tr>`
      : `<tr><td class="pos">${i + 1}</td><td class="tm">${badge(r.team)}<span>${esc(r.team.name)}</span></td><td>${r.pj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.pf}</td><td>${r.pc}</td><td>${r.dif > 0 ? '+' : ''}${r.dif}</td><td class="hl">${r.pts}</td></tr>`).join('');
    const head = compact
      ? '<th>#</th><th class="l">Equipo</th><th>PJ</th><th>PTS</th>'
      : '<th>#</th><th class="l">Equipo</th><th title="Partidos jugados">PJ</th><th title="Ganados">G</th><th title="Empatados">E</th><th title="Perdidos">P</th><th title="Puntos a favor">PF</th><th title="Puntos en contra">PC</th><th title="Diferencia">DIF</th><th>PTS</th>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      ${compact ? '' : `<p class="note">Victoria ${R.ptsWin} pts · Empate ${R.ptsDraw} pts · Derrota (participación) ${R.ptsLoss} pt. Desempate: diferencia de puntos, luego puntos a favor.</p>`}`;
  }

  function toast(msg, kind) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.className = 'show ' + (kind || '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ''; }, 2600);
  }

  /* Acceso de staff: login con Firebase Auth en la nube, o PIN de prueba en modo local */
  function gate(root, start) {
    if (!T.auth) return pinGate(root, start);
    let started = false;
    T.auth.onChange(user => {
      if (!user) { started = false; return loginForm(root); }
      if (started) return;
      started = true; T.setStaff(true); start();
      const s = document.querySelector('.staff');
      if (s) {
        s.insertAdjacentHTML('beforeend', ` · <a href="#" id="logout">Cerrar sesión</a>`);
        document.getElementById('logout').onclick = e => { e.preventDefault(); T.auth.logout().then(() => location.reload()); };
      }
    });
  }

  function loginForm(root) {
    root.innerHTML = `<form class="gate card" id="gate"><h2>Acceso de staff</h2>
      <p class="muted">Ingresa el código de acceso de la mesa.</p>
      <input class="inp" id="pw" type="password" autocomplete="off" placeholder="Código de acceso" required autofocus>
      <button class="btn gold" type="submit">Entrar</button><p class="err" id="perr"></p></form>`;
    document.getElementById('gate').addEventListener('submit', e => {
      e.preventDefault();
      const err = document.getElementById('perr');
      err.textContent = 'Entrando…';
      T.auth.login(w.STAFF_EMAIL, document.getElementById('pw').value)
        .catch(ex => { err.textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(ex.code) ? 'Código incorrecto' : /too-many/.test(ex.code) ? 'Demasiados intentos, espera unos minutos' : 'No se pudo iniciar sesión (' + ex.code + ')'; });
    });
  }

  function pinGate(root, start) {
    let ok = false;
    try { ok = sessionStorage.getItem('torneo.auth') === '1'; } catch (e) { /* ignore */ }
    if (ok) return start();
    root.innerHTML = `<form class="gate card" id="gate"><h2>Acceso de staff</h2>
      <p class="muted">Ingresa el PIN para continuar. <small>(Prototipo local: PIN <b>${PIN}</b>. En producción esto será un inicio de sesión con Firebase.)</small></p>
      <input class="inp" id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" autofocus>
      <button class="btn gold" type="submit">Entrar</button><p class="err" id="perr"></p></form>`;
    document.getElementById('gate').addEventListener('submit', e => {
      e.preventDefault();
      if (document.getElementById('pin').value === PIN) {
        try { sessionStorage.setItem('torneo.auth', '1'); } catch (err) { /* ignore */ }
        start();
      } else document.getElementById('perr').textContent = 'PIN incorrecto';
    });
  }

  w.UI = { initials, fmtDate, fmtTime, catName, team, badge, byDate, clockText, layout, tick, autoRefresh, getCat, catPicker, gameCard, standingsTable, toast, gate };
})(window);
