// Coworking Hub v3 — frontend SPA con admin UI
// 100% Vanilla JS · gráficos Canvas nativo · modales · dropdowns · iconos SVG inline

const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const fmtCLP = n => '$' + (n || 0).toLocaleString('es-CL');
const fmtPct = n => (n || 0).toFixed(1) + '%';
const today  = () => new Date().toISOString().slice(0, 10);

const TITLES = {
  dashboard:    ['Dashboard', 'Dashboard'],
  reservas:     ['Reservas', 'Reservas'],
  miembros:     ['Miembros', 'Miembros'],
  cafeteria:    ['Cafetería', 'Cafetería'],
  membresias:   ['Membresías', 'Membresías'],
  pagos:        ['Pagos', 'Pagos'],
  warehouse:    ['Histórico clientes', 'Warehouse'],
  predicciones: ['Predicciones IA', 'Predicciones'],
  segmentos:    ['Segmentación', 'Segmentación'],
  kpis:         ['KPIs operacionales', 'KPIs'],
  colas:        ['Teoría de colas', 'Colas'],
  procesos:     ['Procesos (Cap.4)', 'Procesos'],
  equipos:      ['Equipamiento (Cap.5)', 'Equipos'],
  inversion:    ['Inversión CAPEX', 'CAPEX']
};

// Iconos para los planes (mapping nombre → SVG)
const PLAN_ICONS = {
  sun:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  calendar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  star:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>'
};

// ============================================================ ROUTING
function setView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === name));
  $('#bcCurrent').textContent = (TITLES[name] || [name])[1];
  loaders[name] && loaders[name]();
  window.scrollTo(0, 0);
}
$$('.nav-item').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  if (a.dataset.view) setView(a.dataset.view);
}));

// ============================================================ API
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || 'Error');
  }
  return r.json();
}

// ============================================================ MODALES
function openModal(id) { $('#' + id).classList.add('open'); }
function closeModal(modal) { modal.classList.remove('open'); }
$$('[data-modal]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.modal)));
$$('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m); });
  $$('[data-close]', m).forEach(b => b.addEventListener('click', () => closeModal(m)));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $$('.modal-backdrop.open').forEach(closeModal);
});

// ============================================================ DROPDOWN (delegated)
document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-dropdown-trigger]');
  if (trigger) {
    e.stopPropagation();
    const dd = trigger.closest('.dropdown');
    $$('.dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
    dd.classList.toggle('open');
    return;
  }
  if (!e.target.closest('.dropdown-menu')) {
    $$('.dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// ============================================================ CANVAS CHARTS (puro JS)
const COLORS = {
  primary: '#2563eb', accent: '#f59e0b', success: '#10b981',
  danger: '#ef4444', purple: '#8b5cf6', teal: '#14b8a6',
  warning: '#f59e0b', muted: '#94a3b8'
};
const PALETTE = [COLORS.primary, COLORS.accent, COLORS.success, COLORS.purple, COLORS.teal, COLORS.danger, COLORS.warning, '#ec4899', '#06b6d4', '#84cc16'];

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

// Bar chart with comparison capacity
function drawBarChart(canvas, data, opts = {}) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 50, padR = 16, padT = 14, padB = 36;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const maxVal = opts.maxVal || Math.max(...data.map(d => d.value), 1);
  const ySteps = 4;

  // Grid + Y axis
  ctx.strokeStyle = '#f1f5f9';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= ySteps; i++) {
    const y = padT + chartH * (1 - i / ySteps);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
    ctx.fillText(((maxVal * i / ySteps) | 0).toString(), padL - 8, y);
  }

  // Bars
  const barW = chartW / data.length * 0.55;
  const gap  = chartW / data.length * 0.45;
  data.forEach((d, i) => {
    const x = padL + (chartW / data.length) * i + gap / 2;
    // Capacity (bg)
    if (opts.cap) {
      const ch = chartH * (opts.cap / maxVal);
      ctx.fillStyle = '#e2e8f0';
      roundRect(ctx, x, padT + chartH - ch, barW, ch, 5); ctx.fill();
    }
    // Value
    const bh = chartH * (d.value / maxVal);
    const grad = ctx.createLinearGradient(0, padT + chartH - bh, 0, padT + chartH);
    grad.addColorStop(0, COLORS.primary);
    grad.addColorStop(1, COLORS.accent);
    ctx.fillStyle = grad;
    roundRect(ctx, x, padT + chartH - bh, barW, bh, 5); ctx.fill();

    // Value label on top
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label2 || d.value, x + barW / 2, padT + chartH - bh - 8);

    // X label
    ctx.fillStyle = '#64748b';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(d.label, x + barW / 2, padT + chartH + 18);
  });
}

// Donut chart
function drawDonutChart(canvas, data, opts = {}) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return;

  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - 12;
  const innerR = r * 0.6;
  let start = -Math.PI / 2;

  data.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.fillStyle = d.color || PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(start) * innerR, cy + Math.sin(start) * innerR);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.lineTo(cx + Math.cos(start + angle) * innerR, cy + Math.sin(start + angle) * innerR);
    ctx.arc(cx, cy, innerR, start + angle, start, true);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  // Center text
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.centerValue || total, cx, cy - 6);
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText(opts.centerLabel || 'total', cx, cy + 14);
}

// Horizontal bar chart for distributions
function drawHBarChart(canvas, data) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 130, padR = 50, padT = 8, padB = 8;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barH = Math.min(20, chartH / data.length - 6);
  const step = chartH / data.length;

  data.forEach((d, i) => {
    const y = padT + step * i + (step - barH) / 2;
    // Label
    ctx.fillStyle = '#475569';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, padL - 10, y + barH / 2);
    // Track
    ctx.fillStyle = '#f1f5f9';
    roundRect(ctx, padL, y, chartW, barH, barH/2); ctx.fill();
    // Fill
    const fillW = chartW * (d.value / maxVal);
    const grad = ctx.createLinearGradient(padL, 0, padL + chartW, 0);
    grad.addColorStop(0, COLORS.primary);
    grad.addColorStop(1, COLORS.accent);
    ctx.fillStyle = grad;
    roundRect(ctx, padL, y, fillW, barH, barH/2); ctx.fill();
    // Value
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.value, padL + chartW + 8, y + barH / 2);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < 0) h = 0;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============================================================ SVG ICONS
const ICONS = {
  edit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  trash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  more:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>',
  view:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alert:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
};

function actionDropdown(id, options) {
  const items = options.map(o => `<button class="${o.danger ? 'danger' : ''}" data-action="${o.action}" data-id="${id}">${o.icon || ''} ${o.label}</button>`).join('');
  return `<div class="dropdown">
    <button class="btn btn-sm btn-ghost btn-icon" data-dropdown-trigger title="Acciones">${ICONS.more}</button>
    <div class="dropdown-menu">${items}</div>
  </div>`;
}

// ============================================================ LOADERS
const loaders = {
  async dashboard() {
    const d = await api('GET', '/api/dashboard');
    $('#kpiMiembros').textContent = d.miembrosActivos;
    $('#kpiReservasHoy').textContent = d.reservasHoy;
    $('#kpiIngresos').textContent = fmtCLP(d.ingresosCafeteria);
    $('#kpiHistorico').textContent = d.warehouse.total;
    $('#kpiNPS').textContent = d.warehouse.agregados.npsScore;
    $('#kpiChurn').textContent = fmtPct(d.warehouse.agregados.churnRate);

    // Bar chart estaciones
    const dataEst = d.utilizacion.map(e => ({
      label: e.estacion,
      value: e.usuariosDia,
      label2: `${(e.utilizacion * 100).toFixed(0)}%`
    }));
    drawBarChart($('#chartEstaciones'), dataEst, { cap: d.capacidad.peakDiarioPrimavera, maxVal: d.capacidad.peakDiarioPrimavera });

    // Donut membresías
    const m = d.warehouse.agregados.porMembresia;
    const dataMembresias = Object.entries(m).map(([k,v], i) => ({ label: k, value: v, color: PALETTE[i] }));
    drawDonutChart($('#chartDonutMembresias'), dataMembresias, { centerValue: d.warehouse.total, centerLabel: 'clientes' });
    $('#legendMembresias').innerHTML = dataMembresias.map(x => `<div class="legend-item"><div class="legend-swatch" style="background:${x.color}"></div>${x.label}: <b>${x.value}</b></div>`).join('');

    // Reservas hoy
    const reservas = await api('GET', '/api/reservas');
    const hoy = today();
    const filtradas = reservas.filter(r => r.fecha === hoy);
    $('#tablaResHoy tbody').innerHTML = filtradas.length === 0
      ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">Sin reservas registradas para hoy.</td></tr>'
      : filtradas.map(r => `<tr><td><span class="table-id">#${r.id}</span></td><td class="table-name">${r.miembro}</td><td>${r.recurso}</td><td>${r.bloque}</td><td>${pillEstado(r.estado)}</td></tr>`).join('');
  },

  async reservas() {
    const [reservas, miembros] = await Promise.all([api('GET','/api/reservas'), api('GET','/api/miembros')]);
    $('#selectMiembro').innerHTML = '<option value="">— Walk-in / Pase diario —</option>' +
      miembros.map(m => `<option value="${m.id}">${m.nombre} (${m.plan})</option>`).join('');

    const filt = ($('#filterReservas').value || '').toLowerCase();
    const sx   = ($('#searchReservas').value || '').toLowerCase();
    const data = reservas.filter(r =>
      (!filt || r.recurso.toLowerCase() === filt) &&
      (!sx || r.miembro.toLowerCase().includes(sx) || r.recurso.toLowerCase().includes(sx))
    );

    const tbody = $('#tablaReservas tbody');
    tbody.innerHTML = data.length === 0
      ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">Sin reservas que coincidan.</td></tr>'
      : data.map(r => `<tr>
          <td><span class="table-id">#${r.id}</span></td>
          <td class="table-name">${r.miembro}</td>
          <td>${r.recurso}</td>
          <td>${r.fecha}</td>
          <td>${r.bloque}</td>
          <td>${pillEstado(r.estado)}</td>
          <td style="text-align:right">${actionDropdown(r.id, [{ action:'del-reserva', label:'Eliminar', icon: ICONS.trash, danger: true }])}</td>
        </tr>`).join('');

    if (!$('#formReserva input[name=fecha]').value) $('#formReserva input[name=fecha]').value = today();
  },

  async miembros() {
    const miembros = await api('GET','/api/miembros');
    const sx = ($('#searchMiembros').value || '').toLowerCase();
    const data = miembros.filter(m => !sx || m.nombre.toLowerCase().includes(sx) || m.email.toLowerCase().includes(sx));
    $('#tablaMiembros tbody').innerHTML = data.length === 0
      ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px">Sin miembros que coincidan.</td></tr>'
      : data.map(m => `<tr>
          <td><span class="table-id">#${m.id}</span></td>
          <td>${m.rut}</td>
          <td class="table-name">${m.nombre}</td>
          <td><span class="table-meta">${m.email}</span></td>
          <td><span class="badge badge-primary">${m.plan}</span></td>
          <td>${m.tipo}</td>
          <td><span class="table-meta">${m.ingreso}</span></td>
          <td style="text-align:right">${actionDropdown(m.id, [{ action:'del-miembro', label:'Eliminar', icon: ICONS.trash, danger: true }])}</td>
        </tr>`).join('');
  },

  async cafeteria() {
    const [ventas, miembros] = await Promise.all([api('GET','/api/cafeteria'), api('GET','/api/miembros')]);
    $('#selectMiembroCafe').innerHTML = '<option value="">— Walk-in —</option>' +
      miembros.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');
    $('#tablaCafe tbody').innerHTML = ventas.map(v => {
      const miembro = miembros.find(m => m.id === v.miembroId);
      return `<tr>
        <td><span class="table-id">#${v.id}</span></td>
        <td><span class="table-meta">${v.fecha}</span></td>
        <td class="table-name">${v.producto}</td>
        <td>${v.cantidad}</td>
        <td>${fmtCLP(v.precio)}</td>
        <td><b>${fmtCLP(v.total)}</b></td>
        <td>${miembro ? miembro.nombre : '<span class="table-meta">Walk-in</span>'}</td>
      </tr>`;
    }).join('');
    const total = ventas.reduce((s, v) => s + v.total, 0);
    $('#totalCafeBadge').textContent = fmtCLP(total);
  },

  async warehouse() {
    const stats = await api('GET','/api/warehouse/stats');
    $('#whT').textContent = stats.total;
    $('#whAI').textContent = `${stats.activos} / ${stats.inactivos}`;
    $('#whResusc').textContent = fmtPct(stats.reSuscripcionRate);
    $('#whLTV').textContent = fmtCLP(stats.promLtv);
    $('#whFreq').textContent = stats.promFreq + ' d/sem';
    $('#whSat').textContent = stats.promSat + ' / 5';

    const profEntries = Object.entries(stats.porProfesion).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label: k, value: v }));
    drawHBarChart($('#chartProfesion'), profEntries);
    const ciudadEntries = Object.entries(stats.porCiudad).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label: k, value: v }));
    drawHBarChart($('#chartCiudad'), ciudadEntries);

    await loaders.consultarWarehouse();
  },

  async consultarWarehouse() {
    const q = $('#whSearch').value.trim();
    const e = $('#whEstado').value;
    const params = new URLSearchParams({ limit: 50, q, activo: e });
    const data = await api('GET','/api/warehouse/clientes?' + params);
    $('#tablaWarehouse tbody').innerHTML = data.pagina.map(c => `
      <tr>
        <td><span class="table-id">#${c.id}</span></td>
        <td class="table-name">${c.nombre}</td>
        <td>${c.edad}</td>
        <td>${c.profesion}</td>
        <td><span class="table-meta">${c.industria}</span></td>
        <td>${c.hijos}</td>
        <td>${badgeMembresia(c.tipoMembresia)}</td>
        <td>${c.frecuenciaSemanal}</td>
        <td>${c.satisfaccion}/5</td>
        <td>${c.nps}</td>
        <td><b>${fmtCLP(c.ltvClp)}</b></td>
        <td>${c.activo ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Baja</span>'}</td>
      </tr>`).join('');
    $('#whResultStats').textContent = `${data.pagina.length} de ${data.total} registros`;
  },

  async predicciones() {
    const r = await api('POST','/api/predict/resuscripcion', { edad: 30, mesesActivo: 12, frecuenciaSemanal: 3, satisfaccion: 4, gastoCafeteriaClp: 20000, nps: 8 });
    $('#metAcc').textContent = (r.metricas.accuracy * 100).toFixed(1) + '%';
    $('#metF1').textContent = r.metricas.f1;
    const f = await api('POST','/api/predict/frecuencia', { edad: 30, mesesActivo: 6, hijos: 0, gastoCafeteriaClp: 15000, satisfaccion: 4, ingresoMensualClp: 1500000 });
    $('#metR2f').textContent = f.metricas.r2;
    const v = await api('POST','/api/predict/ventas', { edad: 30, mesesActivo: 6, frecuenciaSemanal: 3, hijos: 0, ingresoMensualClp: 1500000, satisfaccion: 4 });
    $('#metR2v').textContent = v.metricas.r2;
  },

  async segmentos() {
    const d = await api('GET','/api/predict/segmentos');
    $('#kmInertia').textContent = `Inertia: ${d.inertia}`;
    $('#segmentosCards').innerHTML = d.segmentos.map((s, i) => `
      <div class="segmento-card s${i}">
        <h4>${s.etiqueta} <span class="badge badge-muted">#${s.clusterId}</span></h4>
        <div class="seg-stat"><span>N clientes</span><b>${s.n}</b></div>
        <div class="seg-stat"><span>Edad prom.</span><b>${s.edadProm} años</b></div>
        <div class="seg-stat"><span>Ingreso</span><b>${fmtCLP(s.ingresoProm)}</b></div>
        <div class="seg-stat"><span>Frecuencia</span><b>${s.frecuenciaProm} d/sem</b></div>
        <div class="seg-stat"><span>Gasto cafe</span><b>${fmtCLP(s.gastoCafeProm)}</b></div>
        <div class="seg-stat"><span>Antigüedad</span><b>${s.mesesActivosProm} m</b></div>
        <div class="seg-stat"><span>Membresía</span><b>${s.membresiaPredominante}</b></div>
        <div class="seg-stat"><span>Retención</span><b style="color:${s.retencion>70?'var(--success)':s.retencion>50?'var(--warning)':'var(--danger)'}">${s.retencion}%</b></div>
      </div>`).join('');
    $('#tablaSegmentos tbody').innerHTML = d.segmentos.map(s => `
      <tr>
        <td><span class="table-id">#${s.clusterId}</span></td>
        <td class="table-name">${s.etiqueta}</td>
        <td>${s.n}</td>
        <td>${s.edadProm}</td>
        <td>${fmtCLP(s.ingresoProm)}</td>
        <td>${s.frecuenciaProm}</td>
        <td>${fmtCLP(s.gastoCafeProm)}</td>
        <td>${s.mesesActivosProm}</td>
        <td>${badgeMembresia(s.membresiaPredominante)}</td>
        <td><b>${s.retencion}%</b></td>
      </tr>`).join('');
  },

  async kpis() {
    const d = await api('GET','/api/kpis-operacionales');
    $('#kpiIOSA').textContent = d.iosaServicios;
    $('#kpiOEE').textContent  = d.oee + '%';
    $('#kpiDisp').textContent = d.dispProm + '%';
    $('#kpiFill').textContent = d.fillRate + '%';
    $('#kpiOTD').textContent  = d.otd + '%';
    $('#kpiSL').textContent   = d.serviceLevel + '%';

    $('#tablaDisp tbody').innerHTML = d.equipos.map(e => {
      const cls = e.disponibilidad >= 99.5 ? 'success' : e.disponibilidad >= 98 ? 'warning' : 'danger';
      const txt = e.disponibilidad >= 99.5 ? 'Óptimo'  : e.disponibilidad >= 98 ? 'Aceptable' : 'Crítico';
      return `<tr>
        <td class="table-name">${e.sistema}</td>
        <td><b>${e.disponibilidad}%</b></td>
        <td>${e.mtbf_h}</td>
        <td>${e.mttr_min}</td>
        <td><span class="badge badge-${cls}">${txt}</span></td>
      </tr>`;
    }).join('');
  },

  async colas(lambda, mu) {
    const params = lambda && mu ? `?lambda=${lambda}&mu=${mu}` : '';
    const d = await api('GET','/api/colas' + params);
    const c = d.consultaActual;
    $('#colaResult').innerHTML = `
      <div class="stat"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/></svg></div><div class="stat-body"><div class="stat-label">ρ Utilización</div><div class="stat-value">${(c.rho * 100).toFixed(1)}%</div><div class="stat-trend ${c.estable?'up':'down'}">${c.estable ? '✓ estable' : '⚠ saturado'}</div></div></div>
      <div class="stat success"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg></div><div class="stat-body"><div class="stat-label">Lq (clientes)</div><div class="stat-value">${c.estable ? c.Lq.toFixed(2) : '∞'}</div><div class="stat-trend neutral">en cola promedio</div></div></div>
      <div class="stat warning"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-body"><div class="stat-label">Wq (espera)</div><div class="stat-value">${c.estable ? (c.Wq * 60).toFixed(1) : '∞'}</div><div class="stat-trend neutral">minutos</div></div></div>
      <div class="stat purple"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8L12 14.7l-3-3L4 16.7"/></svg></div><div class="stat-body"><div class="stat-label">L (en sistema)</div><div class="stat-value">${c.estable ? c.L.toFixed(2) : '∞'}</div><div class="stat-trend neutral">total</div></div></div>`;

    $('#tablaColas tbody').innerHTML = d.escenarios.map(e => `
      <tr><td class="table-name">${e.nombre}</td><td>${e.lambda}</td><td>${e.mu}</td>
      <td>${e.estable ? (e.rho * 100).toFixed(1) + '%' : '≥100%'}</td>
      <td>${e.estable ? e.Lq.toFixed(2) : '∞'}</td>
      <td>${e.estable ? e.Wq.toFixed(3) : '∞'}</td>
      <td><b>${e.estable ? (e.Wq * 60).toFixed(1) : '∞'}</b></td>
      <td>${e.estable ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>'}</td></tr>`).join('');
    $('#tablaUtilizacion tbody').innerHTML = d.utilizacionEstacional.map(u => `
      <tr><td class="table-name">${u.estacion}</td><td>${u.usuariosDia}</td><td>${u.capacidadDia}</td>
      <td><b style="color:${u.utilizacion>0.8?'var(--danger)':u.utilizacion>0.6?'var(--warning)':'var(--success)'}">${(u.utilizacion*100).toFixed(1)}%</b></td>
      <td>${u.holgura}</td></tr>`).join('');
  },

  async procesos() {
    const p = await api('GET','/api/procesos');
    const tarjetas = ['puestos','salas','cafeteria'].map(k => {
      const x = p[k];
      return `<div class="proceso">
        <h4>${x.titulo}</h4>
        <div class="lst">
          <b>Acciones visibles</b>${x.visibles.map(i => '· ' + i).join('<br>')}
          <b>Acciones invisibles</b>${x.invisibles.map(i => '· ' + i).join('<br>')}
          <b>Riesgos de fallo (F)</b>${x.riesgosFallo.map(i => '· ' + i).join('<br>')}
          <b>Riesgos de espera (E)</b>${x.riesgosEspera.map(i => '· ' + i).join('<br>')}
        </div></div>`;
    });
    $('#procesosCards').innerHTML = `<div class="row-2">${tarjetas[0]}${tarjetas[1]}</div>${tarjetas[2]}`;
  },

  async equipos() {
    const e = await api('GET','/api/equipos');
    $('#tablaEquipos tbody').innerHTML = e.map(x => `
      <tr>
        <td class="table-name">${x.categoria}</td>
        <td>${x.elegido}</td>
        <td><span class="badge badge-success">${x.puntaje.toFixed(1)}</span></td>
        <td>${fmtCLP(x.precio)}</td>
        <td>${x.cantidad}</td>
        <td><b>${fmtCLP(x.precio * x.cantidad)}</b></td>
        <td><span class="table-meta">${x.justificacion}</span></td>
      </tr>`).join('');
  },

  async membresias() {
    const d = await api('GET','/api/productos');
    const grid = $('#planesGrid');
    if (!d.stripeReady) {
      grid.innerHTML = `<div class="card"><div class="card-body"><b>⚠ Stripe no configurado en este servidor.</b><br><small class="muted">Agrega STRIPE_SECRET_KEY a las variables de entorno.</small></div></div>`;
      return;
    }
    grid.innerHTML = d.productos.map(p => `
      <div class="plan-card ${p.destacado ? 'destacado' : ''}">
        <div class="plan-icon">${PLAN_ICONS[p.icono] || PLAN_ICONS.calendar}</div>
        <div class="plan-name">${p.nombre}</div>
        <div class="plan-desc">${p.descripcion}</div>
        <div class="plan-price">${fmtCLP(p.precioClp)}<small>CLP</small></div>
        <div class="plan-period">${p.duracionDias === 1 ? 'pago único' : p.duracionDias + ' días de acceso'}</div>
        <button class="btn btn-primary" data-buy="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h2"/></svg>
          Suscribirse
        </button>
      </div>
    `).join('');
  },

  async pagos() {
    const pagos = await api('GET','/api/pagos');
    const ok    = pagos.filter(p => p.estado === 'paid').length;
    const pend  = pagos.filter(p => p.estado === 'pending').length;
    const fail  = pagos.filter(p => p.estado === 'failed').length;
    const total = pagos.filter(p => p.estado === 'paid').reduce((s, p) => s + (p.monto || 0), 0);
    $('#pagosOk').textContent = ok;
    $('#pagosPend').textContent = pend;
    $('#pagosFail').textContent = fail;
    $('#pagosTotal').textContent = fmtCLP(total);
    $('#pagosCount').textContent = `${pagos.length} en total`;
    $('#tablaPagos tbody').innerHTML = pagos.length === 0
      ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">Aún no hay pagos registrados. Ve a Membresías y compra una para probar.</td></tr>'
      : pagos.map(p => {
        const cls = p.estado === 'paid' ? 'success' : p.estado === 'pending' ? 'warning' : 'danger';
        const fecha = new Date(p.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<tr>
          <td><span class="table-id">#${p.id}</span></td>
          <td><span class="table-meta">${fecha}</span></td>
          <td>${p.email}${p.miembroNombre ? '<br><span class="table-meta">→ ' + p.miembroNombre + '</span>' : ''}</td>
          <td class="table-name">${p.producto}</td>
          <td><b>${fmtCLP(p.monto)}</b></td>
          <td><span class="badge badge-${cls}">${p.estado}</span></td>
          <td><code style="font-size:10px">${(p.stripeSessionId || '').slice(0,18)}…</code></td>
        </tr>`;
      }).join('');
  },

  async inversion() {
    const d = await api('GET','/api/inversion');
    $('#tablaInversion tbody').innerHTML = d.detalle.map(x => `
      <tr><td class="table-name">${x.categoria}</td><td>${x.elegido}</td>
      <td>${fmtCLP(x.precio)}</td><td>${x.cantidad}</td>
      <td><b>${fmtCLP(x.subtotal)}</b></td></tr>`).join('');
    $('#totalInversion').textContent = fmtCLP(d.total);
  }
};

// ============================================================ HELPERS render
function pillEstado(estado) {
  const cls = estado === 'En curso' ? 'primary' : estado === 'Cancelada' ? 'danger' : 'success';
  return `<span class="badge badge-${cls}">${estado}</span>`;
}
function badgeMembresia(t) {
  const map = { 'Anual':'purple', 'Mensual':'primary', 'Corporativa':'warning', 'Pase Diario':'success' };
  return `<span class="badge badge-${map[t]||'muted'}">${t}</span>`;
}

// ============================================================ FORM HANDLERS
$('#formReserva').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const msg = $('#reservaMsg'); msg.classList.add('hidden');
  try {
    await api('POST', '/api/reservas', fd);
    e.target.reset(); $('#formReserva input[name=fecha]').value = today();
    closeModal($('#modalReserva'));
    loaders.reservas();
  } catch (err) {
    msg.className = 'alert error';
    msg.innerHTML = ICONS.alert + ' ' + err.message;
    msg.classList.remove('hidden');
  }
});

$('#formMiembro').addEventListener('submit', async e => {
  e.preventDefault();
  await api('POST','/api/miembros', Object.fromEntries(new FormData(e.target)));
  e.target.reset(); closeModal($('#modalMiembro'));
  loaders.miembros();
});

$('#formCafe').addEventListener('submit', async e => {
  e.preventDefault();
  await api('POST','/api/cafeteria', Object.fromEntries(new FormData(e.target)));
  e.target.reset(); $('#inputPrecio').value = $('#selProducto').selectedOptions[0].dataset.precio;
  closeModal($('#modalCafe'));
  loaders.cafeteria();
});

$('#selProducto').addEventListener('change', e => {
  $('#inputPrecio').value = e.target.selectedOptions[0].dataset.precio || '';
});
$('#inputPrecio').value = $('#selProducto').selectedOptions[0].dataset.precio;

$('#formCola').addEventListener('submit', e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  loaders.colas(fd.lambda, fd.mu);
});

// Predicciones
$('#formResusc').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  body.usaSalaReuniones = fd.has('usaSalaReuniones');
  body.usaPhoneBooth = fd.has('usaPhoneBooth');
  const r = await api('POST','/api/predict/resuscripcion', body);
  const div = $('#resultResusc');
  const ok = r.probabilidad >= 0.5;
  div.className = 'prediction-result ' + (ok ? 'success' : 'danger');
  div.classList.remove('hidden');
  div.innerHTML = `
    <div class="pred-meta">${ok ? '✓' : '⚠'} Predicción</div>
    <div class="pred-big">${r.prediccion}</div>
    <div class="pred-meta" style="font-size:13px;color:var(--text);text-transform:none">Probabilidad: <b>${(r.probabilidad*100).toFixed(1)}%</b> · Confianza: <b>${r.confianza}%</b></div>
    <div class="confidence-bar"><div style="width:${(r.probabilidad*100).toFixed(1)}%"></div></div>
    <div class="pred-meta" style="margin-top:8px;text-transform:none;font-weight:500">Modelo: regresión logística · Accuracy <b>${(r.metricas.accuracy*100).toFixed(1)}%</b> · F1 <b>${r.metricas.f1}</b></div>`;
});

$('#formFreq').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  body.usaSalaReuniones = fd.has('usaSalaReuniones');
  const r = await api('POST','/api/predict/frecuencia', body);
  const div = $('#resultFreq');
  div.className = 'prediction-result success';
  div.classList.remove('hidden');
  div.innerHTML = `
    <div class="pred-meta">📅 Asistencia esperada</div>
    <div class="pred-big">${r.frecuenciaPredicha} días/semana</div>
    <div class="pred-meta" style="text-transform:none;font-weight:500">Modelo: regresión lineal · R² <b>${r.metricas.r2}</b> · RMSE <b>${r.metricas.rmse}</b> días</div>`;
});

$('#formVentas').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await api('POST','/api/predict/ventas', Object.fromEntries(new FormData(e.target)));
  const div = $('#resultVentas');
  div.className = 'prediction-result success';
  div.classList.remove('hidden');
  div.innerHTML = `
    <div class="pred-meta">💸 Gasto mensual estimado en cafetería</div>
    <div class="pred-big">${fmtCLP(r.gastoMensualPredicho)}</div>
    <div class="pred-meta" style="text-transform:none;font-weight:500">Modelo: regresión lineal · R² <b>${r.metricas.r2}</b> · RMSE $<b>${Math.round(r.metricas.rmse).toLocaleString('es-CL')}</b></div>`;
});

// Filtros tabla
$('#searchReservas').addEventListener('input', () => loaders.reservas());
$('#filterReservas').addEventListener('change', () => loaders.reservas());
$('#searchMiembros').addEventListener('input', () => loaders.miembros());
$('#whBtnFiltrar').addEventListener('click', () => loaders.consultarWarehouse());
$('#whSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loaders.consultarWarehouse(); });
$('#whEstado').addEventListener('change', () => loaders.consultarWarehouse());

// Acciones (delegated)
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'del-reserva') {
      if (!confirm('¿Eliminar la reserva #' + id + '?')) return;
      await api('DELETE', '/api/reservas?id=' + id);
      loaders.reservas();
    } else if (action === 'del-miembro') {
      if (!confirm('¿Eliminar el miembro #' + id + '?')) return;
      await api('DELETE', '/api/miembros?id=' + id);
      loaders.miembros();
    }
    return;
  }

  // Botón "Suscribirse" → abre Stripe Checkout
  const buy = e.target.closest('[data-buy]');
  if (buy) {
    e.preventDefault();
    const productoId = buy.dataset.buy;
    const email = prompt('Ingresa tu email para asociar la membresía:');
    if (!email) return;
    if (!email.includes('@')) { alert('Email inválido'); return; }
    const nombre = prompt('Nombre (opcional, para el registro):') || '';
    buy.disabled = true;
    buy.textContent = 'Redirigiendo...';
    try {
      const r = await api('POST', '/api/checkout/create', { productoId, email, nombre });
      window.location.href = r.url; // redirige a Stripe Checkout
    } catch (err) {
      alert('⚠ ' + err.message);
      buy.disabled = false;
      buy.textContent = 'Suscribirse';
    }
  }
});

// Reloj
function tickClock() {
  const d = new Date();
  $('#hora').textContent = d.toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}
setInterval(tickClock, 1000); tickClock();

// Resize handler para charts
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    const active = $('.view.active');
    if (active && active.id) {
      const name = active.id.replace('view-','');
      loaders[name] && loaders[name]();
    }
  }, 200);
});

// Init
setView('dashboard');
