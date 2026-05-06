// Sistema de Gestión Coworking - Becerra & Varas
// Servidor HTTP nativo de Node (sin dependencias)
// Capítulos 4 y 5 del avance + Data Warehouse + ML

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { loadWarehouse, aggregate } = require('./data_warehouse');
const { trainLinearRegression, trainLogisticRegression, kmeans } = require('./ml');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- OLTP (tiempo real, estilo SAP) ----------
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return seedData(); }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8'); }
function seedData() {
  const seed = {
    miembros: [
      { id: 1, rut: '12.345.678-9', nombre: 'Camila Rojas', email: 'camila@startup.cl', plan: 'Membresía Mensual', tipo: 'Hot Desk', activo: true, ingreso: '2026-03-01' },
      { id: 2, rut: '15.111.222-3', nombre: 'Diego Soto',   email: 'diego@consult.cl',  plan: 'Membresía Mensual', tipo: 'Escritorio Dedicado', activo: true, ingreso: '2026-02-15' },
      { id: 3, rut: '18.999.111-K', nombre: 'María Pérez',  email: 'maria@design.cl',   plan: 'Pase Diario',       tipo: 'Hot Desk', activo: true, ingreso: '2026-04-20' }
    ],
    reservas: [
      { id: 1, miembroId: 1, recurso: 'Hot Desk',           fecha: new Date().toISOString().slice(0,10), bloque: '09:00-13:00', estado: 'En curso' },
      { id: 2, miembroId: 2, recurso: 'Escritorio Dedicado',fecha: new Date().toISOString().slice(0,10), bloque: 'Día completo', estado: 'En curso' },
      { id: 3, miembroId: 3, recurso: 'Sala de Reunión',    fecha: new Date().toISOString().slice(0,10), bloque: '15:00-17:00', estado: 'Confirmada' }
    ],
    cafeteria: [
      { id: 1, fecha: new Date().toISOString().slice(0,10), producto: 'Café espresso', cantidad: 2, precio: 2200, total: 4400, miembroId: 1 },
      { id: 2, fecha: new Date().toISOString().slice(0,10), producto: 'Sándwich pollo', cantidad: 1, precio: 5200, total: 5200, miembroId: 2 }
    ],
    nextId: { miembro: 4, reserva: 4, cafe: 3 }
  };
  saveData(seed); return seed;
}
let DB = loadData();

// ---------- Data Warehouse (estilo Redshift) ----------
const WH = loadWarehouse();
console.log(`✓ Data warehouse cargado: ${WH.clientes.length} clientes históricos`);

// ---------- Modelos ML pre-entrenados al boot ----------
console.log('⚙ Entrenando modelos predictivos...');

// 1) Logistic regression — predecir re-suscripción
const featuresLogistic = c => [c.edad, c.mesesActivo, c.frecuenciaSemanal, c.satisfaccion, c.gastoCafeteriaClp, c.usaSalaReuniones ? 1 : 0, c.usaPhoneBooth ? 1 : 0, c.nps];
const Xlog = WH.clientes.map(featuresLogistic);
const Ylog = WH.clientes.map(c => c.volvioASuscribirse ? 1 : 0);
const modelResuscripcion = trainLogisticRegression(Xlog, Ylog, { iters: 3000, alpha: 0.1 });
console.log(`  • Re-suscripción: accuracy=${(modelResuscripcion.accuracy*100).toFixed(1)}% F1=${modelResuscripcion.f1}`);

// 2) Regresión lineal — predecir frecuencia semanal
const featuresFreq = c => [c.edad, c.mesesActivo, c.hijos, c.gastoCafeteriaClp, c.satisfaccion, c.ingresoMensualClp, c.usaSalaReuniones ? 1 : 0];
const Xfreq = WH.clientes.map(featuresFreq);
const Yfreq = WH.clientes.map(c => c.frecuenciaSemanal);
const modelFrecuencia = trainLinearRegression(Xfreq, Yfreq, { iters: 2000, alpha: 0.05 });
console.log(`  • Frecuencia: R²=${modelFrecuencia.r2} RMSE=${modelFrecuencia.rmse} días/sem`);

// 3) Regresión lineal — predecir ventas (gasto cafetería)
const featuresVenta = c => [c.edad, c.mesesActivo, c.frecuenciaSemanal, c.hijos, c.ingresoMensualClp, c.satisfaccion];
const Xventa = WH.clientes.map(featuresVenta);
const Yventa = WH.clientes.map(c => c.gastoCafeteriaClp);
const modelVentas = trainLinearRegression(Xventa, Yventa, { iters: 2000, alpha: 0.05 });
console.log(`  • Ventas (cafetería): R²=${modelVentas.r2} RMSE=$${Math.round(modelVentas.rmse)}`);

// 4) K-means — segmentación
const featuresCluster = c => [c.edad, c.ingresoMensualClp, c.frecuenciaSemanal, c.gastoCafeteriaClp, c.mesesActivo];
const Xcluster = WH.clientes.map(featuresCluster);
const clustering = kmeans(Xcluster, 4, { maxIter: 100 });
const segmentNames = etiquetarClusters(clustering.centroidesReal);
console.log(`  • Clustering: 4 segmentos (inertia=${clustering.inertia})`);

function etiquetarClusters(centroides) {
  // Etiquetar por características dominantes — orden: edad, ingreso, freq, gasto, meses
  return centroides.map((c, i) => {
    const [edad, ingreso, freq, gasto, meses] = c;
    if (freq > 3.5 && gasto > 25000) return 'Power Users';
    if (ingreso > 1700000 && meses > 18) return 'Premium';
    if (freq < 2 && gasto < 15000) return 'Casuales';
    return 'Mid-tier';
  }).map((nombre, i, arr) => {
    // Asegurar nombres únicos
    const count = arr.slice(0, i + 1).filter(x => x === nombre).length;
    return count > 1 ? `${nombre} ${count}` : nombre;
  });
}

// ---------- KPIs Operacionales ----------
function kpisOperacionales() {
  // Disponibilidad de sistemas (simulada con leve variación diaria)
  const seedDay = new Date().getDate();
  const noise = (s) => 1 - ((seedDay + s) % 7) * 0.005;
  const equipos = [
    { sistema: 'Wi-Fi (TP-Link Omada)', disponibilidad: +(99.6 * noise(1)).toFixed(2), mtbf_h: 720,  mttr_min: 18 },
    { sistema: 'POS (Sunmi P2 Pro)',    disponibilidad: +(99.9 * noise(2)).toFixed(2), mtbf_h: 1440, mttr_min: 12 },
    { sistema: 'Climatización',          disponibilidad: +(98.5 * noise(3)).toFixed(2), mtbf_h: 600,  mttr_min: 90 },
    { sistema: 'Cámaras seguridad',      disponibilidad: +(99.8 * noise(4)).toFixed(2), mtbf_h: 2160, mttr_min: 45 },
    { sistema: 'Software (OfficeRnD)',   disponibilidad: +(99.95 * noise(5)).toFixed(2), mtbf_h: 4320, mttr_min: 8 },
    { sistema: 'Salas de reunión AV',    disponibilidad: +(97.2 * noise(6)).toFixed(2), mtbf_h: 360,  mttr_min: 30 }
  ];
  const dispProm = +(equipos.reduce((s, e) => s + e.disponibilidad, 0) / equipos.length).toFixed(2);

  // OEE adaptado a servicios = Disponibilidad × Eficiencia (utilización) × Calidad (satisfacción/5)
  const utilizacion = 0.84;
  const calidad = aggregate(WH.clientes).promSat / 5;
  const oee = +(dispProm / 100 * utilizacion * calidad * 100).toFixed(2);

  // Fill rate = reservas atendidas / reservas solicitadas (proxy: reservas confirmadas/total)
  const fillRate = DB.reservas.length > 0
    ? +((DB.reservas.filter(r => r.estado !== 'Cancelada').length / DB.reservas.length) * 100).toFixed(1)
    : 100;

  // OTD - On Time Delivery (proxy: % reservas que iniciaron en su bloque) — simulado
  const otd = 96.4;

  // Customer Service Level — % de demanda atendida sin desbordes
  const serviceLevel = 94.8;

  // Score "IOSA" adaptado: índice compuesto de auditoría operacional (0-100)
  const iosaServicios = +(
    dispProm * 0.30 +
    oee * 0.25 +
    fillRate * 0.15 +
    otd * 0.15 +
    serviceLevel * 0.15
  ).toFixed(1);

  return {
    equipos,
    dispProm,
    oee,
    fillRate,
    otd,
    serviceLevel,
    iosaServicios,
    utilizacion: +(utilizacion * 100).toFixed(1),
    calidad: +(calidad * 100).toFixed(1)
  };
}

// ---------- Datos estáticos del proyecto (Cap 4 y 5) ----------
const EQUIPOS = [
  { categoria: 'Computadores',                 elegido: 'Dell OptiPlex 7010 SFF',  puntaje: 9.7,  precio: 950000,  cantidad: 3, justificacion: 'Mejor garantía (3 años) y equilibrio precio/desempeño.' },
  { categoria: 'Sistema de Pago (POS)',        elegido: 'Sunmi P2 Pro',            puntaje: 10.0, precio: 299990,  cantidad: 2, justificacion: 'Menor comisión (1,49%), mejor conectividad y RAM.' },
  { categoria: 'Cámaras de Seguridad',         elegido: 'Ezviz C3W Pro',           puntaje: 9.3,  precio: 119990,  cantidad: 6, justificacion: 'Mayor almacenamiento en nube (32 GB) y garantía 3 años.' },
  { categoria: 'Router/AP Wi-Fi',              elegido: 'TP-Link Omada EAP670',    puntaje: 8.7,  precio: 189990,  cantidad: 3, justificacion: 'Mejor relación velocidad/garantía (5 años).' },
  { categoria: 'Sillas Ergonómicas',           elegido: 'Steelcase Series 1',      puntaje: 8.4,  precio: 549000,  cantidad: 8, justificacion: 'Equilibrio precio/garantía (10 años) y carga 158 kg.' },
  { categoria: 'Pantallas Salas Reunión',      elegido: 'Samsung QM55C',           puntaje: 9.7,  precio: 1199000, cantidad: 2, justificacion: 'Conectividad alta, UHD 4K, garantía 3 años.' },
  { categoria: 'Aire Acondicionado',           elegido: 'Samsung WindFree 24K',    puntaje: 9.2,  precio: 999990,  cantidad: 2, justificacion: 'SEER 21, 38 dB y garantía 10 años.' },
  { categoria: 'Software de Gestión (PMS)',    elegido: 'OfficeRnD Flex',          puntaje: 9.4,  precio: 1812000, cantidad: 1, justificacion: '80 integraciones, soporte alto, mejor precio anual.' }
];

const PROCESOS = {
  puestos: {
    titulo: 'Servicio de puestos de trabajo (hot desk / escritorio dedicado)',
    visibles: ['Ingresar reserva (web/app/presencial)','Pedir datos personales','Resolver dudas','Solicitar pago','Confirmar reserva','Recibir en recepción','Validar membresía o pase','Asignar puesto','Registrar salida','Despedir al cliente'],
    invisibles: ['Revisar disponibilidad','Crear registro del cliente','Tomar apuntes de preferencias','Registrar pago','Preparar puesto y verificar red','Revisar estado del puesto','Liberar reserva en sistema'],
    riesgosFallo: ['Errores de registro','Caída del sistema de reservas','Fallas Wi-Fi','Mobiliario en mal estado','Descoordinación de áreas'],
    riesgosEspera: ['Registro inicial en horarios peak','Validación de membresía','Asignación de puesto en mañanas de primavera','Salidas simultáneas']
  },
  salas: {
    titulo: 'Servicio de salas de reunión y phone booths',
    visibles: ['Solicitar espacio (web/app/recepción)','Verificar disponibilidad','Confirmar bloque horario','Acceder a sala','Usar equipamiento AV','Liberar espacio'],
    invisibles: ['Sistema de reservas','Pre-chequeo equipo AV','Sanitización entre usos','Actualización de disponibilidad'],
    riesgosFallo: ['Asignación duplicada','Falla de videoconferencia','Aislamiento acústico deficiente','Sanitización incompleta'],
    riesgosEspera: ['Solicitud presencial sin reserva','Liberación tardía del usuario previo','Cambios de bloque horario']
  },
  cafeteria: {
    titulo: 'Servicio de cafetería',
    visibles: ['Solicitud de pedido en barra','Cobro al barista','Preparación','Entrega','Consumo en barra/puesto/zona común','Retiro de elementos'],
    invisibles: ['Registro de pedido en POS','Asociar a cuenta de membresía','Reposición de insumos','Sanitización de utensilios'],
    riesgosFallo: ['Errores en pedido','Temperatura inadecuada','Falla en POS','Inventario desactualizado'],
    riesgosEspera: ['Pedidos simultáneos en receso','Preparación de café especialidad','Rotación de mesas en peak']
  }
};

const CAPACIDAD = {
  peakDiarioPrimavera: 8,
  usuariosDiaAnuales: 2000,
  estaciones: [
    { nombre: 'Verano',    factor: 0.55, atencionesDia: 4 },
    { nombre: 'Otoño',     factor: 0.85, atencionesDia: 7 },
    { nombre: 'Invierno',  factor: 1.00, atencionesDia: 8 },
    { nombre: 'Primavera', factor: 1.00, atencionesDia: 8 }
  ]
};

// ---------- Helpers HTTP ----------
function send(res, status, body, headers = {}) {
  const isString = typeof body === 'string';
  const payload = isString ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': isString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers));
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'No encontrado');
    res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- Cola M/M/1 ----------
function mm1(lambda, mu) {
  if (mu <= lambda) return { rho: 1, Lq: Infinity, Wq: Infinity, L: Infinity, W: Infinity, estable: false };
  const rho = lambda / mu;
  return { rho, Lq: (rho*rho)/(1-rho), Wq: (rho*rho)/(1-rho)/lambda, L: rho/(1-rho), W: 1/(mu-lambda), estable: true };
}
function utilizacionEstacional() {
  return CAPACIDAD.estaciones.map(e => ({
    estacion: e.nombre, usuariosDia: e.atencionesDia, capacidadDia: CAPACIDAD.peakDiarioPrimavera,
    utilizacion: +(e.atencionesDia / CAPACIDAD.peakDiarioPrimavera).toFixed(3),
    holgura: CAPACIDAD.peakDiarioPrimavera - e.atencionesDia
  }));
}

// ---------- API Routes ----------
const routes = {
  'GET /api/dashboard': (req, res) => {
    const ingresos = DB.cafeteria.reduce((s,c)=>s+c.total,0);
    const reservasHoy = DB.reservas.filter(r => r.fecha === new Date().toISOString().slice(0,10)).length;
    send(res, 200, {
      miembros: DB.miembros.length,
      miembrosActivos: DB.miembros.filter(m=>m.activo).length,
      reservasTotal: DB.reservas.length,
      reservasHoy,
      ingresosCafeteria: ingresos,
      utilizacion: utilizacionEstacional(),
      capacidad: CAPACIDAD,
      warehouse: { total: WH.clientes.length, agregados: aggregate(WH.clientes) }
    });
  },
  'GET /api/miembros': (req, res) => send(res, 200, DB.miembros),
  'POST /api/miembros': async (req, res) => {
    const b = await readBody(req);
    if (!b.nombre || !b.email) return send(res, 400, { error: 'Faltan campos: nombre, email' });
    const nuevo = { id: DB.nextId.miembro++, rut: b.rut||'', nombre: b.nombre, email: b.email, plan: b.plan||'Pase Diario', tipo: b.tipo||'Hot Desk', activo: true, ingreso: new Date().toISOString().slice(0,10) };
    DB.miembros.push(nuevo); saveData(DB);
    send(res, 201, nuevo);
  },
  'DELETE /api/miembros': async (req, res) => {
    const id = parseInt(url.parse(req.url, true).query.id, 10);
    DB.miembros = DB.miembros.filter(m => m.id !== id);
    saveData(DB); send(res, 200, { ok: true });
  },
  'GET /api/reservas': (req, res) => {
    const data = DB.reservas.map(r => ({...r, miembro: (DB.miembros.find(m=>m.id===r.miembroId)||{}).nombre || 'Walk-in' }));
    send(res, 200, data);
  },
  'POST /api/reservas': async (req, res) => {
    const b = await readBody(req);
    if (!b.recurso || !b.fecha) return send(res, 400, { error: 'Faltan campos: recurso, fecha' });
    const ocupacion = DB.reservas.filter(r => r.fecha === b.fecha && r.bloque === b.bloque && (r.recurso === 'Hot Desk' || r.recurso === 'Escritorio Dedicado')).length;
    if ((b.recurso === 'Hot Desk' || b.recurso === 'Escritorio Dedicado') && ocupacion >= CAPACIDAD.peakDiarioPrimavera) {
      return send(res, 409, { error: `Capacidad agotada (máx ${CAPACIDAD.peakDiarioPrimavera}).` });
    }
    const nueva = { id: DB.nextId.reserva++, miembroId: b.miembroId ? parseInt(b.miembroId,10) : null, recurso: b.recurso, fecha: b.fecha, bloque: b.bloque || 'Día completo', estado: 'Confirmada' };
    DB.reservas.push(nueva); saveData(DB);
    send(res, 201, nueva);
  },
  'DELETE /api/reservas': async (req, res) => {
    const id = parseInt(url.parse(req.url, true).query.id,10);
    DB.reservas = DB.reservas.filter(r => r.id !== id);
    saveData(DB); send(res, 200, { ok: true });
  },
  'GET /api/cafeteria': (req, res) => send(res, 200, DB.cafeteria),
  'POST /api/cafeteria': async (req, res) => {
    const b = await readBody(req);
    if (!b.producto || !b.cantidad || !b.precio) return send(res, 400, { error: 'Faltan campos' });
    const venta = { id: DB.nextId.cafe++, fecha: new Date().toISOString().slice(0,10), producto: b.producto, cantidad: parseInt(b.cantidad,10), precio: parseInt(b.precio,10), total: parseInt(b.cantidad,10) * parseInt(b.precio,10), miembroId: b.miembroId ? parseInt(b.miembroId,10) : null };
    DB.cafeteria.push(venta); saveData(DB);
    send(res, 201, venta);
  },
  'GET /api/equipos': (req, res) => send(res, 200, EQUIPOS),
  'GET /api/procesos': (req, res) => send(res, 200, PROCESOS),
  'GET /api/colas': (req, res) => {
    const q = url.parse(req.url, true).query;
    const lambda = parseFloat(q.lambda) || 6;
    const mu = parseFloat(q.mu) || 10;
    const escenarios = [
      { nombre: 'Recepción - hora valle',  lambda: 3,  mu: 10 },
      { nombre: 'Recepción - hora peak',   lambda: 8,  mu: 10 },
      { nombre: 'Cafetería - desayuno',    lambda: 12, mu: 18 },
      { nombre: 'Cafetería - almuerzo',    lambda: 16, mu: 18 }
    ].map(e => ({ ...e, ...mm1(e.lambda, e.mu) }));
    send(res, 200, {
      consultaActual: { lambda, mu, ...mm1(lambda, mu) },
      escenarios,
      utilizacionEstacional: utilizacionEstacional(),
      formula: 'Heizer Cap. 13: ρ=λ/μ, Lq=ρ²/(1-ρ), Wq=Lq/λ'
    });
  },
  'GET /api/inversion': (req, res) => {
    const detalle = EQUIPOS.map(e => ({...e, subtotal: e.precio * e.cantidad}));
    send(res, 200, { detalle, total: detalle.reduce((s,e)=>s+e.subtotal,0), moneda: 'CLP' });
  },

  // ---------- DATA WAREHOUSE ----------
  'GET /api/warehouse/clientes': (req, res) => {
    const q = url.parse(req.url, true).query;
    const limit = parseInt(q.limit, 10) || 50;
    const offset = parseInt(q.offset, 10) || 0;
    const filtro = (q.q || '').toLowerCase();
    let data = WH.clientes;
    if (filtro) data = data.filter(c =>
      c.nombre.toLowerCase().includes(filtro) ||
      c.profesion.toLowerCase().includes(filtro) ||
      c.industria.toLowerCase().includes(filtro) ||
      c.ciudad.toLowerCase().includes(filtro) ||
      c.tipoMembresia.toLowerCase().includes(filtro)
    );
    if (q.activo === 'true') data = data.filter(c => c.activo);
    if (q.activo === 'false') data = data.filter(c => !c.activo);
    send(res, 200, {
      total: data.length,
      pagina: data.slice(offset, offset + limit),
      limit, offset
    });
  },
  'GET /api/warehouse/stats': (req, res) => {
    send(res, 200, aggregate(WH.clientes));
  },

  // ---------- ML PREDICCIONES ----------
  'POST /api/predict/resuscripcion': async (req, res) => {
    const b = await readBody(req);
    const x = [
      parseFloat(b.edad)||30, parseFloat(b.mesesActivo)||6, parseFloat(b.frecuenciaSemanal)||3,
      parseFloat(b.satisfaccion)||3, parseFloat(b.gastoCafeteriaClp)||15000,
      b.usaSalaReuniones ? 1 : 0, b.usaPhoneBooth ? 1 : 0, parseFloat(b.nps)||7
    ];
    const prob = modelResuscripcion.predictProb(x);
    send(res, 200, {
      probabilidad: +prob.toFixed(4),
      prediccion: prob >= 0.5 ? 'Volverá a suscribirse' : 'Riesgo de baja',
      confianza: +(Math.abs(prob - 0.5) * 200).toFixed(1),
      metricas: { accuracy: modelResuscripcion.accuracy, precision: modelResuscripcion.precision, recall: modelResuscripcion.recall, f1: modelResuscripcion.f1, confusion: modelResuscripcion.confusion },
      coeficientes: modelResuscripcion.theta
    });
  },
  'POST /api/predict/frecuencia': async (req, res) => {
    const b = await readBody(req);
    const x = [
      parseFloat(b.edad)||30, parseFloat(b.mesesActivo)||6, parseFloat(b.hijos)||0,
      parseFloat(b.gastoCafeteriaClp)||15000, parseFloat(b.satisfaccion)||3,
      parseFloat(b.ingresoMensualClp)||1000000, b.usaSalaReuniones ? 1 : 0
    ];
    const pred = modelFrecuencia.predict(x);
    send(res, 200, {
      frecuenciaPredicha: +Math.max(0, Math.min(7, pred)).toFixed(2),
      unidad: 'días por semana',
      metricas: { r2: modelFrecuencia.r2, rmse: modelFrecuencia.rmse },
      historiaCosto: modelFrecuencia.history
    });
  },
  'POST /api/predict/ventas': async (req, res) => {
    const b = await readBody(req);
    const x = [
      parseFloat(b.edad)||30, parseFloat(b.mesesActivo)||6, parseFloat(b.frecuenciaSemanal)||3,
      parseFloat(b.hijos)||0, parseFloat(b.ingresoMensualClp)||1000000, parseFloat(b.satisfaccion)||3
    ];
    const pred = modelVentas.predict(x);
    send(res, 200, {
      gastoMensualPredicho: Math.max(0, Math.round(pred)),
      unidad: 'CLP/mes en cafetería',
      metricas: { r2: modelVentas.r2, rmse: modelVentas.rmse }
    });
  },
  'GET /api/predict/segmentos': (req, res) => {
    // Resumen de cada cluster
    const resumen = clustering.centroidesReal.map((c, i) => {
      const miembros = WH.clientes.filter((_, idx) => clustering.asignaciones[idx] === i);
      return {
        clusterId: i,
        etiqueta: segmentNames[i],
        n: miembros.length,
        edadProm: +(miembros.reduce((s,m)=>s+m.edad,0)/miembros.length).toFixed(1),
        ingresoProm: Math.round(miembros.reduce((s,m)=>s+m.ingresoMensualClp,0)/miembros.length),
        frecuenciaProm: +(miembros.reduce((s,m)=>s+m.frecuenciaSemanal,0)/miembros.length).toFixed(2),
        gastoCafeProm: Math.round(miembros.reduce((s,m)=>s+m.gastoCafeteriaClp,0)/miembros.length),
        mesesActivosProm: +(miembros.reduce((s,m)=>s+m.mesesActivo,0)/miembros.length).toFixed(1),
        membresiaPredominante: predominante(miembros, 'tipoMembresia'),
        retencion: +((miembros.filter(m=>m.activo).length/miembros.length)*100).toFixed(1)
      };
    });
    send(res, 200, { segmentos: resumen, inertia: clustering.inertia, k: clustering.k });
  },

  // ---------- KPIs OPERACIONALES ----------
  'GET /api/kpis-operacionales': (req, res) => send(res, 200, kpisOperacionales())
};

function predominante(arr, key) {
  const counts = arr.reduce((acc, x) => { acc[x[key]] = (acc[x[key]] || 0) + 1; return acc; }, {});
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const key = `${req.method} ${parsed.pathname}`;
  if (routes[key]) {
    try { return await routes[key](req, res); }
    catch (e) { return send(res, 500, { error: e.message }); }
  }
  let pathname = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveStatic(res, filePath);
  }
  send(res, 404, 'No encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Coworking Hub corriendo en http://localhost:${PORT}`);
});
