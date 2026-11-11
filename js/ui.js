/* Piezas de interfaz compartidas: cabecera, cinta de partidos, tarjetas, selector de categoría, PIN de staff. */
(function (w) {
  'use strict';
  const { esc } = T;
  const PIN = '1234'; // solo prototipo; con Firebase se reemplaza por login real

  const initials = n => n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const fmtDate = iso => !iso ? 'Fecha por definir' : new Date(iso).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  const fmtTime = iso => !iso ? '' : new Date(iso).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
  const catName = (S, id) => (S.config.categories.find(c => c.id === id) || { name: id }).name;
  const team = (S, id) => S.teams.find(t => t.id === id) || { id, name: '—', players: [], color: '#555' };
  const badge = t => t.logo
    ? `<span class="badge has-img" style="--c:${esc(t.color || '#c9a84c')}"><img src="${esc(t.logo)}" alt=""></span>`
    : `<span class="badge" style="--c:${esc(t.color || '#c9a84c')}">${esc(initials(t.name))}</span>`;
  const capMark = p => (p && p.captain ? '<span class="cap" title="Capitán">C</span>' : '');
  const byDate = (a, b) => (!a.date && !b.date ? (a.order || 0) - (b.order || 0) : !a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date));

  function clockText(g) {
    return g.status === 'final' ? 'Final' : T.periodLabel(g.clock.period) + ' ' + T.fmtClock(T.remaining(g));
  }

  function renderTicker() {
    const el = document.getElementById('ticker');
    if (!el) return;
    const S = T.state();
    const items = [];
    S.games.filter(g => g.status === 'live').forEach(g => {
      items.push(`<span class="tk live"><i class="dot"></i>EN VIVO · ${esc(team(S, g.home).name)}${T.live ? ` ${g.score.h}–${g.score.a} ` : ' vs '}${esc(team(S, g.away).name)}</span>`);
    });
    const sched = S.games.filter(g => g.status === 'scheduled').sort(byDate);
    S.config.categories.flatMap(c => sched.filter(g => g.cat === c.id).slice(0, 2)).sort(byDate).forEach(g => { // 2 por categoría para que ninguna quede fuera
      items.push(`<span class="tk">Próximo · ${esc(team(S, g.home).name)} vs ${esc(team(S, g.away).name)} · ${fmtDate(g.date)} ${fmtTime(g.date)}</span>`);
    });
    if (!items.length) items.push('<span class="tk">' + esc(S.config.name) + '</span>');
    const row = items.join('');
    el.innerHTML = `<div class="tk-track">${row}${row}</div>`;
  }

  function layout(active) {
    document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="assets/logo.jpg">');
    parallax();
    const S = T.state();
    const links = [['index.html', 'live', 'En vivo'], ['resultados.html', 'res', 'Resultados'], ['posiciones.html', 'pos', 'Posiciones'], ['llaves.html', 'llaves', 'Llaves'],['estadisticas.html', 'est', 'Estadísticas']]
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
         <span>${esc(S.config.name)} · Hoopz Academia de Baloncesto · <a href="tv.html">Marcador TV</a> · <a href="#" id="install" hidden>📲 Instalar app</a></span>
         <span class="staff">Staff: <a href="mesa.html">Mesa de anotación</a> · <a href="captura.html">Captura final</a> · <a href="sorteo.html">Sorteo</a> · <a href="presentacion.html">Presentación</a> · <a href="presentacion-llaves.html">Presentación de llaves</a> · <a href="podio.html">Podio</a> · <a href="admin.html">Administración</a></span>
       </div></footer>`);
    if (T.offline) document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="wrap"><div class="empty" style="margin-top:16px;border-color:var(--live);color:var(--live)">No se pudo conectar con la base de datos. Revisa tu conexión y recarga la página.</div></div>');
    renderTicker();
    T.subscribe(renderTicker);
    setInterval(tick, 500);
    pwa();
  }

  /* Fondo fijo que se desplaza despacio mientras se baja la página (funciona también en iPhone) */
  function parallax() {
    const fx = document.createElement('div');
    fx.className = 'bg-fx'; fx.setAttribute('aria-hidden', 'true');
    document.body.prepend(fx);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let queued = false;
    const move = () => {
      queued = false;
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, scrollY / max));
      fx.style.transform = `translate3d(0, ${((0.5 - p) * 0.2 * innerHeight).toFixed(1)}px, 0)`;
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(move); } }, { passive: true });
    addEventListener('resize', move);
    move();
  }

  function tick() {
    document.querySelectorAll('.clk[data-gid]').forEach(el => {
      const g = T.game(el.dataset.gid);
      if (g) el.textContent = clockText(g);
    });
  }

  /* Refresca la vista cada N segundos (solo con la pestaña visible), como lo haría el sondeo contra Firebase */
  function autoRefresh(render) {
    const run = () => { render(); scoreFx(); };
    T.subscribe(run);
    setInterval(() => { if (!document.hidden) { T.reload(); run(); renderTicker(); } }, T.state().config.refreshSec * 1000);
    scoreFx(); // marca el punto de partida: solo se anima lo que cambie después
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
      : fin ? `<span class="chip">${g.forfeit ? 'W.O.' : 'FINAL'}</span>` : `<span class="chip soft">${fmtTime(g.date) || 'Por programar'}</span>`;
    const row = (t, sc, win, side) => `<div class="g-row ${win ? 'win' : ''}" style="--tc:${esc(t.color || '#c9a84c')}">${badge(t)}<span class="tname">${esc(t.name)}</span><span class="sc" data-sc="${esc(g.id)}:${side}">${g.status === 'scheduled' ? '–' : sc}</span></div>`;
    return `<a class="game ${live ? 'is-live' : ''}" href="partido.html?id=${esc(g.id)}">
      <div class="g-meta"><span>${esc(catName(S, g.cat))}${g.stage ? ' · ' + esc(T.stageName(g)) : ''} · ${fmtDate(g.date)}</span>${status}</div>
      ${row(h, g.score.h, fin && g.score.h > g.score.a, 'h')}
      ${row(a, g.score.a, fin && g.score.a > g.score.h, 'a')}
      ${live ? `<div class="g-clock"><span class="clk" data-gid="${esc(g.id)}">${clockText(g)}</span></div>` : ''}
    </a>`;
  }

  function standingsTable(S, cat, compact) {
    const rows = T.standings(S, cat);
    const R = S.config.rules;
    const body = rows.map((r, i) => compact
      ? `<tr style="--tc:${esc(r.team.color || '#c9a84c')}"><td class="pos">${i + 1}</td><td class="tm${i === 0 && r.pj > 0 ? ' leader' : ''}">${badge(r.team)}<span class="nm">${esc(r.team.name)}</span></td><td>${r.pj}</td><td class="hl">${r.pts}</td></tr>`
      : `<tr style="--tc:${esc(r.team.color || '#c9a84c')}"><td class="pos">${i + 1}</td><td class="tm${i === 0 && r.pj > 0 ? ' leader' : ''}">${badge(r.team)}<span class="nm">${esc(r.team.name)}</span></td><td>${r.pj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.pf}</td><td>${r.pc}</td><td>${r.dif > 0 ? '+' : ''}${r.dif}</td><td class="hl">${r.pts}</td></tr>`).join('');
    const head = compact
      ? '<th>#</th><th class="l">Equipo</th><th>PJ</th><th>PTS</th>'
      : '<th>#</th><th class="l">Equipo</th><th title="Partidos jugados">PJ</th><th title="Ganados">G</th><th title="Empatados">E</th><th title="Perdidos">P</th><th title="Puntos a favor">PF</th><th title="Puntos en contra">PC</th><th title="Diferencia">DIF</th><th>PTS</th>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      ${compact ? '' : `<p class="note">Victoria ${R.ptsWin} pts · Empate ${R.ptsDraw} pts · Derrota (participación) ${R.ptsLoss} pt. Desempate: diferencia de puntos, luego puntos a favor.</p>`}`;
  }

  /* Destello y "+N" flotante cuando sube un marcador (elementos con data-sc="partido:lado") */
  const lastScore = {};
  function scoreFx() {
    document.querySelectorAll('[data-sc]').forEach(el => {
      const k = el.dataset.sc, v = parseInt(el.textContent, 10);
      if (isNaN(v)) return;
      const prev = lastScore[k];
      lastScore[k] = v;
      if (prev !== undefined && v > prev) {
        el.classList.add('bump');
        el.insertAdjacentHTML('beforeend', `<i class="plus">+${v - prev}</i>`);
        setTimeout(() => { el.classList.remove('bump'); const p = el.querySelector('.plus'); if (p) p.remove(); }, 1400);
      }
    });
  }

  /* Instalar como app (Android) o instrucciones (iPhone) y copia sin conexión */
  function pwa() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sin soporte */ });
    const link = document.getElementById('install');
    if (!link || matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
    let deferred = null;
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; link.hidden = false; });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) link.hidden = false;
    link.addEventListener('click', e => {
      e.preventDefault();
      if (deferred) { deferred.prompt(); deferred = null; link.hidden = true; }
      else toast('En iPhone: toca Compartir y luego "Añadir a pantalla de inicio".');
    });
  }

  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  /* Tarjeta del resultado como imagen, para compartir por WhatsApp (o descargar en computador) */
  async function shareResult(gid) {
    const S = T.state(), g = T.game(gid);
    if (!g) return;
    const h = team(S, g.home), a = team(S, g.away);
    try { await Promise.all([document.fonts.load('120px "Bebas Neue"'), document.fonts.load('600 30px Inter')]); } catch (e) { /* fuentes del sistema */ }
    const W = 1080, H = 1350, BEB = '"Bebas Neue", Impact, sans-serif', INT = 'Inter, system-ui, sans-serif';
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, W, H);
    const rg = x.createRadialGradient(W / 2, 680, 40, W / 2, 680, 860);
    rg.addColorStop(0, 'rgba(201,168,76,.30)'); rg.addColorStop(1, 'rgba(10,10,10,0)');
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
    x.fillStyle = '#c9a84c'; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10);
    const logo = await loadImg('assets/logo.jpg');
    if (logo) { const lw = 230, lh = lw * logo.height / logo.width; x.globalCompositeOperation = 'lighten'; x.drawImage(logo, (W - lw) / 2, 48, lw, lh); x.globalCompositeOperation = 'source-over'; }
    x.textAlign = 'center';
    const text = (t, px, y, font, color, max) => {
      const f = s => (font === BEB ? '' : '600 ') + s + 'px ' + font;
      let size = px;
      x.font = f(size);
      while (max && x.measureText(t).width > max && size > 14) { size -= 2; x.font = f(size); }
      x.fillStyle = color; x.fillText(t, W / 2, y);
    };
    const fin = g.status === 'final', live = g.status === 'live';
    text(S.config.name.toUpperCase(), 66, 370, BEB, '#f5f5f5', 900);
    text((catName(S, g.cat) + ' · ' + fmtDate(g.date)).toUpperCase(), 28, 418, INT, '#c9a84c', 900);
    text(fin ? 'FINAL' : live ? 'EN VIVO · ' + T.periodLabel(g.clock.period) + ' ' + T.fmtClock(T.remaining(g)) : 'PRÓXIMO PARTIDO', 58, 492, BEB, fin ? '#f5f5f5' : '#e53935');

    const drawBadge = async (t, cx, cy, r) => {
      x.save();
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.closePath();
      x.fillStyle = '#000'; x.fill(); x.lineWidth = 8; x.strokeStyle = t.color || '#c9a84c'; x.stroke();
      const img = t.logo ? await loadImg(t.logo) : null;
      if (img) {
        x.clip();
        const k = Math.min(2 * r * 0.92 / img.width, 2 * r * 0.92 / img.height);
        x.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k);
      } else {
        x.fillStyle = '#f5f5f5'; x.font = Math.round(r * 0.95) + 'px ' + BEB; x.textBaseline = 'middle';
        x.fillText(initials(t.name), cx, cy + 4);
      }
      x.restore();
    };
    const L = 270, Rr = 810;
    await drawBadge(h, L, 680, 140); await drawBadge(a, Rr, 680, 140);
    x.textBaseline = 'alphabetic';
    const names = (t, cx) => { let s = 76; x.font = s + 'px ' + BEB; while (x.measureText(t.name.toUpperCase()).width > 460 && s > 30) { s -= 2; x.font = s + 'px ' + BEB; } x.fillStyle = '#f5f5f5'; x.fillText(t.name.toUpperCase(), cx, 900); };
    names(h, L); names(a, Rr);
    const hw = fin && g.score.h > g.score.a, aw = fin && g.score.a > g.score.h;
    x.font = '280px ' + BEB;
    x.fillStyle = hw ? '#c9a84c' : '#f5f5f5'; x.fillText(g.status === 'scheduled' ? '–' : String(g.score.h), L, 1130);
    x.fillStyle = aw ? '#c9a84c' : '#f5f5f5'; x.fillText(g.status === 'scheduled' ? '–' : String(g.score.a), Rr, 1130);
    x.fillStyle = '#9a9a9a'; x.font = '150px ' + BEB; x.fillText('–', W / 2, 1100);

    const idx = T.playerIndex(S);
    const top = side => {
      const st = T.playerStats(g.events.filter(e => e.team === side));
      const best = Object.keys(st).filter(id => idx[id]).sort((p, q) => st[q].pts - st[p].pts)[0];
      return best && st[best].pts > 0 ? `Máx.: ${idx[best].p.name} · ${st[best].pts} pts` : '';
    };
    // máximo anotador de cada equipo, centrado bajo su marcador
    const under = (t, cx, y) => {
      if (!t) return;
      let s = 28; x.font = '600 ' + s + 'px ' + INT;
      while (x.measureText(t).width > 470 && s > 16) { s--; x.font = '600 ' + s + 'px ' + INT; }
      x.fillStyle = '#c9a84c'; x.fillText(t, cx, y);
    };
    under(top('h'), L, 1200); under(top('a'), Rr, 1200);
    x.fillStyle = '#9a9a9a'; x.font = '600 26px ' + INT; x.fillText('HOOPZ · ACADEMIA DE BALONCESTO', W / 2, 1296);

    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    const name = ('resultado-' + h.name + '-vs-' + a.name + '.jpg').replace(/\s+/g, '-').toLowerCase();
    const file = new File([blob], name, { type: 'image/jpeg' });
    const msg = `${h.name} ${g.score.h} - ${g.score.a} ${a.name} · ${S.config.name}`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: S.config.name, text: msg }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Imagen descargada');
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
      <p class="note">Modo: <b>nube (Firebase)</b>. El PIN 1234 solo sirve en modo local: abre esta página con <b>?local=1</b> al final de la dirección.</p>
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

  /* Cuadro de llaves de una categoría: semifinales → final (y tercer lugar). Lo que aún no se define se muestra como "Por definir". */
  function bracketView(S, cat) {
    const g = st => S.games.filter(x => x.cat === cat && x.stage === st).sort((a, b) => a.slot - b.slot);
    const sf = g('sf'), fin = g('final')[0], third = g('third')[0];
    const table = T.standings(S, cat);
    const bd = (S.config.bracketDates || {})[cat] || {};
    const when = d => (d ? ' · ' + fmtDate(d) + ' ' + fmtTime(d) : '');
    const ph = (title, a, b, d) => `<div class="game bk-ph"><div class="g-meta"><span>${esc(title)}${when(d)}</span><span class="chip soft">Por definir</span></div>
      <div class="g-row"><span class="tname">${esc(a)}</span></div><div class="g-row"><span class="tname">${esc(b)}</span></div></div>`;
    const hasPoints = T.leagueGames(S, cat).some(x => x.status === 'final'); // sin partidos jugados no hay clasificación: no se muestran equipos
    const seed = n => (hasPoints ? n + '.º · ' + (table[n - 1] ? table[n - 1].team.name : '—') : n + '.º de la tabla de posiciones');
    const hasSF = sf.length > 0, direct = !hasSF && !!fin;
    const wantsThird = !!third || (!direct && (!sf.length || sf[0].thirdPlace)); // el partido por el tercer lugar se muestra siempre (por definir hasta las semifinales)
    const semis = hasSF ? sf.map(gameCard) : direct ? [] : [ph('Semifinal 1', seed(1), seed(4), bd.sf1), ph('Semifinal 2', seed(2), seed(3), bd.sf2)];
    const finalCard = fin ? gameCard(fin) : ph('Final', direct ? seed(1) : 'Ganador semifinal 1', direct ? seed(2) : 'Ganador semifinal 2', bd.final);
    const thirdCard = third ? gameCard(third) : wantsThird ? ph('Tercer lugar', 'Perdedor semifinal 1', 'Perdedor semifinal 2', bd.third) : '';
    const champId = fin ? T.gameWinner(fin) : null;
    const champ = champId ? `<div class="bk-champ">🏆 Campeón: <b>${esc(team(S, champId).name)}</b> · <a href="podio.html?cat=${esc(cat)}" style="color:var(--gold)">Ver podio →</a></div>` : '';
    return `${champ}<div class="bracket ${semis.length ? '' : 'one'}">
      ${semis.length ? `<div class="bk-col"><h3 class="bk-h">Semifinales</h3>${semis.join('')}</div>` : ''}
      <div class="bk-col"><h3 class="bk-h">Final</h3>${finalCard}${thirdCard ? `<h3 class="bk-h" style="margin-top:8px">Tercer lugar</h3>${thirdCard}` : ''}</div></div>
      ${!hasSF && !fin ? `<p class="note">${hasPoints ? 'Las llaves se definen al terminar la fase regular, con los mejores de la tabla de posiciones. Lo que ves arriba es provisional según la tabla actual.' : 'Las llaves se definen con la tabla de posiciones; aparecerán cuando se jueguen los partidos de la fase regular.'}</p>` : ''}`;
  }

  /* Pantallas de presentación en TV: si el contenido no cabe en la altura, se reduce el zoom para que se vea todo sin desplazarse */
  function fitTV() {
    if (innerWidth < 1200) return;
    const m = document.querySelector('main');
    if (!m) return;
    m.style.zoom = '';
    let z = parseFloat(getComputedStyle(m).zoom) || 1;
    for (let i = 0; i < 3; i++) {
      const h = document.documentElement.scrollHeight;
      if (h <= innerHeight + 2) break;
      z = Math.max(0.55, z * (innerHeight / h) * 0.985); m.style.zoom = z;
    }
  }
  addEventListener('resize', () => { if (document.body.classList.contains('tv')) fitTV(); });

  w.UI = { fitTV, initials, fmtDate, fmtTime, catName, team, badge, capMark, byDate, clockText, layout, tick, autoRefresh, getCat, catPicker, gameCard, bracketView, standingsTable, toast, gate, scoreFx, shareResult };
})(window);
