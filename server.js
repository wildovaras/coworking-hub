// ============================================================
// Coworking Hub · Servidor Node + Supabase
// Becerra & Varas · UTalca · 2026
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

// Cargar .env si existe (para desarrollo local)
if (fs.existsSync('.env')) {
  const env = fs.readFileSync('.env', 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim();
    }
  });
}

const db = require('./db');
const stripeMod = require('./stripe_module');
const { generarClientes } = require('./data_warehouse');
const { trainLinearRegression, trainLogisticRegression, kmeans } = require('./ml');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// ============================================================
// MODELOS ML — entrenados al boot con datos del warehouse
// ============================================================
let modelResuscripcion, modelFrecuencia, modelVentas, clustering, segmentNames, warehouseSize = 0;

async function entrenarModelos() {
  console.log('⚙ Cargando warehouse desde Supabase...');
  let clientes = await db.todosHistoricos();

  if (clientes.length < 200) {
    console.log(`⚠ Warehouse vacío (${clientes.length}). Ejecutando seed automático...`);
    const generados = generarClientes(250);
    await db.seedHistoricos(generados);
    clientes = await db.todosHistoricos();
    console.log(`✓ Warehouse poblado con ${clientes.length} clientes`);
  } else {
    console.log(`✓ Warehouse cargado: ${clientes.length} clientes`);
  }
  warehouseSize = clientes.length;

  console.log('⚙ Entrenando modelos predictivos...');

  const featuresLogistic = c => [c.edad, c.mesesActivo, c.frecuenciaSemanal, c.satisfaccion, c.gastoCafeteriaClp, c.usaSalaReuniones ? 1 : 0, c.usaPhoneBooth ? 1 : 0, c.nps];
  const Xlog = clientes.map(featuresLogistic);
  const Ylog = clientes.map(c => c.volvioASuscribirse ? 1 : 0);
  modelResuscripcion = trainLogisticRegression(Xlog, Ylog, { iters: 3000, alpha: 0.1 });
  console.log(`  • Re-suscripción: accuracy=${(modelResuscripcion.accuracy*100).toFixed(1)}% F1=${modelResuscripcion.f1}`);

  const featuresFreq = c => [c.edad, c.mesesActivo, c.hijos, c.gastoCafeteriaClp, c.satisfaccion, c.ingresoMensualClp, c.usaSalaReuniones ? 1 : 0];
  const Xfreq = clientes.map(featuresFreq);
  const Yfreq = clientes.map(c => c.frecuenciaSemanal);
  modelFrecuencia = trainLinearRegression(Xfreq, Yfreq, { iters: 2000, alpha: 0.05 });
  console.log(`  • Frecuencia: R²=${modelFrecuencia.r2} RMSE=${modelFrecuencia.rmse} días/sem`);

  const featuresVenta = c => [c.edad, c.mesesActivo, c.frecuenciaSemanal, c.hijos, c.ingresoMensualClp, c.satisfaccion];
  const Xventa = clientes.map(featuresVenta);
  const Yventa = clientes.map(c => c.gastoCafeteriaClp);
  modelVentas = trainLinearRegression(Xventa, Yventa, { iters: 2000, alpha: 0.05 });
  console.log(`  • Ventas (cafetería): R²=${modelVentas.r2} RMSE=$${Math.round(modelVentas.rmse)}`);

  const featuresCluster = c => [c.edad, c.ingresoMensualClp, c.frecuenciaSemanal, c.gastoCafeteriaClp, c.mesesActivo];
  const Xcluster = clientes.map(featuresCluster);
  clustering = kmeans(Xcluster, 4, { maxIter: 100 });
  segmentNames = etiquetarClusters(clustering.centroidesReal);
  console.log(`  • Clustering: 4 segmentos (inertia=${clustering.inertia})`);

  // Guardar referencia a clientes para los endpoints de cluster
  clustering._clientes = clientes;
}

function etiquetarClusters(centroides) {
  return centroides.map(c => {
    const [, ingreso, freq, gasto, meses] = c;
    if (freq > 3.5 && gasto > 25000) return 'Power Users';
    if (ingreso > 1700000 && meses > 18) return 'Premium';
    if (freq < 2 && gasto < 15000) return 'Casuales';
    return 'Mid-tier';
  }).map((nombre, i, arr) => {
    const count = arr.slice(0, i + 1).filter(x => x === nombre).length;
    return count > 1 ? `${nombre} ${count}` : nombre;
  });
}

// ============================================================
// CONSTANTES DEL PROYECTO
// ============================================================
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

// ============================================================
// HELPERS
// ============================================================
function send(res, status, body, headers = {}) {
  const isString = typeof body === 'string';
  const payload = isString ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': isString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
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
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
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

async function kpisOperacionales() {
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
  const utilizacion = 0.84;
  const stats = await db.statsHistoricos();
  const calidad = (stats.promSat || 4) / 5;
  const oee = +(dispProm / 100 * utilizacion * calidad * 100).toFixed(2);
  const totalReservas = await db.contarReservas();
  const fillRate = totalReservas > 0 ? 100 : 100; // simplificado
  const otd = 96.4;
  const serviceLevel = 94.8;
  const iosaServicios = +(dispProm * 0.30 + oee * 0.25 + fillRate * 0.15 + otd * 0.15 + serviceLevel * 0.15).toFixed(1);
  return { equipos, dispProm, oee, fillRate, otd, serviceLevel, iosaServicios, utilizacion: +(utilizacion*100).toFixed(1), calidad: +(calidad*100).toFixed(1) };
}

function predominante(arr, key) {
  const counts = arr.reduce((acc, x) => { acc[x[key]] = (acc[x[key]] || 0) + 1; return acc; }, {});
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

// ============================================================
// API ROUTES
// ============================================================
const routes = {
  'GET /api/dashboard': async (req, res) => {
    const [miembros, reservasHoy, totalReservas, ingresos, stats] = await Promise.all([
      db.listarMiembros(),
      db.reservasHoy(),
      db.contarReservas(),
      db.ingresosCafeteria(),
      db.statsHistoricos()
    ]);
    send(res, 200, {
      miembros: miembros.length,
      miembrosActivos: miembros.filter(m => m.activo).length,
      reservasTotal: totalReservas,
      reservasHoy,
      ingresosCafeteria: ingresos,
      utilizacion: utilizacionEstacional(),
      capacidad: CAPACIDAD,
      warehouse: { total: warehouseSize, agregados: stats }
    });
  },

  'GET /api/miembros': async (req, res) => send(res, 200, await db.listarMiembros()),
  'POST /api/miembros': async (req, res) => {
    const b = await readBody(req);
    if (!b.nombre || !b.email) return send(res, 400, { error: 'Faltan campos: nombre, email' });
    try {
      const nuevo = await db.crearMiembro(b);
      send(res, 201, nuevo);
    } catch (e) {
      if (e.code === '23505') return send(res, 409, { error: 'Ya existe un miembro con ese email' });
      send(res, 500, { error: e.message });
    }
  },
  'DELETE /api/miembros': async (req, res) => {
    const id = parseInt(url.parse(req.url, true).query.id, 10);
    await db.eliminarMiembro(id);
    send(res, 200, { ok: true });
  },

  'GET /api/reservas': async (req, res) => send(res, 200, await db.listarReservas()),
  'POST /api/reservas': async (req, res) => {
    const b = await readBody(req);
    if (!b.recurso || !b.fecha) return send(res, 400, { error: 'Faltan campos: recurso, fecha' });
    try {
      const nueva = await db.crearReserva(b, CAPACIDAD.peakDiarioPrimavera);
      send(res, 201, nueva);
    } catch (e) {
      send(res, e.status || 500, { error: e.message });
    }
  },
  'DELETE /api/reservas': async (req, res) => {
    const id = parseInt(url.parse(req.url, true).query.id, 10);
    await db.eliminarReserva(id);
    send(res, 200, { ok: true });
  },

  'GET /api/cafeteria': async (req, res) => send(res, 200, await db.listarVentas()),
  'POST /api/cafeteria': async (req, res) => {
    const b = await readBody(req);
    if (!b.producto || !b.cantidad || !b.precio) return send(res, 400, { error: 'Faltan campos' });
    const venta = await db.crearVenta(b);
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

  // ---------- WAREHOUSE ----------
  'GET /api/warehouse/clientes': async (req, res) => {
    const q = url.parse(req.url, true).query;
    const data = await db.listarHistoricos({
      limit: parseInt(q.limit, 10) || 50,
      offset: parseInt(q.offset, 10) || 0,
      q: q.q || '',
      activo: q.activo || ''
    });
    send(res, 200, data);
  },
  'GET /api/warehouse/stats': async (req, res) => send(res, 200, await db.statsHistoricos()),

  // ---------- ML ----------
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
      metricas: { r2: modelFrecuencia.r2, rmse: modelFrecuencia.rmse }
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
    const clientes = clustering._clientes;
    const resumen = clustering.centroidesReal.map((c, i) => {
      const miembros = clientes.filter((_, idx) => clustering.asignaciones[idx] === i);
      return {
        clusterId: i, etiqueta: segmentNames[i], n: miembros.length,
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

  'GET /api/kpis-operacionales': async (req, res) => send(res, 200, await kpisOperacionales()),

  // ========== STRIPE / PAGOS ==========
  'GET /api/productos': (req, res) => {
    send(res, 200, {
      productos: stripeMod.listarProductos(),
      stripeReady: stripeMod.isReady(),
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
  },

  'POST /api/checkout/create': async (req, res) => {
    if (!stripeMod.isReady()) return send(res, 503, { error: 'Pagos no disponibles' });
    const b = await readBody(req);
    if (!b.productoId || !b.email) return send(res, 400, { error: 'Faltan campos: productoId, email' });
    try {
      const session = await stripeMod.crearCheckoutSession({
        productoId: b.productoId,
        email: b.email,
        nombre: b.nombre || '',
        baseUrl: BASE_URL
      });
      const producto = stripeMod.getProducto(b.productoId);
      // Registrar pago pendiente en BD
      await db.crearPagoPendiente({
        email: b.email,
        nombre: b.nombre || '',
        producto: producto.nombre,
        monto: producto.precioClp,
        moneda: 'clp',
        stripeSessionId: session.id,
        metadata: { productoId: producto.id, plan: producto.plan, tipo: producto.tipo }
      });
      send(res, 200, { url: session.url, sessionId: session.id });
    } catch (e) {
      console.error('Error checkout:', e.message || e);
      send(res, 500, { error: e.message || 'Error creando sesión de pago' });
    }
  },

  'GET /api/checkout/session': async (req, res) => {
    const sessionId = url.parse(req.url, true).query.id;
    if (!sessionId) return send(res, 400, { error: 'Falta session id' });
    try {
      const [session, pago] = await Promise.all([
        stripeMod.obtenerSesion(sessionId),
        db.obtenerPagoPorSession(sessionId)
      ]);
      send(res, 200, {
        status: session.payment_status,
        amount: session.amount_total,
        currency: session.currency,
        email: session.customer_email,
        producto: pago?.producto,
        estadoBD: pago?.estado
      });
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  },

  'GET /api/pagos': async (req, res) => {
    try {
      send(res, 200, await db.listarPagos());
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  }
};

// Webhook handler — se procesa fuera de routes porque necesita raw body
async function handleStripeWebhook(req, res) {
  if (!stripeMod.isReady()) return send(res, 503, 'Stripe no configurado');
  const sig = req.headers['stripe-signature'];
  const rawBody = await readRawBody(req);

  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripeMod.verificarWebhook(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Sin secret configurado: parseamos sin verificar (modo dev)
      event = JSON.parse(rawBody.toString('utf8'));
      console.warn('⚠ Webhook sin verificación de firma (configurar STRIPE_WEBHOOK_SECRET)');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return send(res, 400, `Webhook Error: ${err.message}`);
  }

  console.log('📥 Stripe event recibido:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const sessionId = session.id;
        const paymentIntent = session.payment_intent;
        const meta = session.metadata || {};

        // Marcar pago como pagado
        await db.marcarPagoPagado({ stripeSessionId: sessionId, paymentIntent });

        // Crear/activar miembro automáticamente
        if (session.customer_email && meta.plan && meta.tipo) {
          const miembro = await db.asegurarMiembroPorEmail({
            email: session.customer_email,
            nombre: meta.nombre || session.customer_details?.name || '',
            plan: meta.plan,
            tipo: meta.tipo
          });
          // Asociar pago al miembro
          await db.supabase.from('pagos').update({ miembro_id: miembro.id }).eq('stripe_session_id', sessionId);
          console.log(`✓ Miembro activado: ${miembro.email} (#${miembro.id}) plan=${meta.plan}`);
        }
        break;
      }
      case 'checkout.session.expired':
      case 'payment_intent.payment_failed': {
        const session = event.data.object;
        if (session.id) await db.marcarPagoFallido({ stripeSessionId: session.id });
        break;
      }
      default:
        console.log('  (evento ignorado)');
    }
    send(res, 200, { received: true });
  } catch (e) {
    console.error('Error procesando webhook:', e.message || e);
    send(res, 500, { error: e.message });
  }
}

// ============================================================
// SERVIDOR
// ============================================================
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // Webhook de Stripe — debe procesarse antes (raw body)
  if (req.method === 'POST' && parsed.pathname === '/api/stripe/webhook') {
    return handleStripeWebhook(req, res);
  }

  const key = `${req.method} ${parsed.pathname}`;
  if (routes[key]) {
    try { return await routes[key](req, res); }
    catch (e) {
      console.error('Error en ruta', key, '→', e.message || e);
      return send(res, 500, { error: e.message || 'Error interno' });
    }
  }
  let pathname = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveStatic(res, filePath);
  }
  send(res, 404, 'No encontrado');
});

(async () => {
  try {
    await entrenarModelos();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Coworking Hub corriendo en http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('❌ Error de inicialización:', e.message || e);
    process.exit(1);
  }
})();
