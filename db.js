// ============================================================
// db.js — Cliente Supabase y operaciones de BD
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = !!(SUPABASE_URL && SERVICE_KEY);
if (!configured) {
  console.error('⚠ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY — server arrancará en modo degradado');
}

const supabase = configured
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  : null;

function requireDb() {
  if (!supabase) {
    const err = new Error('Base de datos no disponible (Supabase no configurado o inalcanzable)');
    err.status = 503;
    throw err;
  }
}

// ============================================================
// MIEMBROS
// ============================================================
async function listarMiembros() {
  const { data, error } = await supabase
    .from('miembros')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data.map(m => ({ ...m, ingreso: m.ingreso ? m.ingreso.slice(0, 10) : null }));
}

async function crearMiembro(payload) {
  const { data, error } = await supabase
    .from('miembros')
    .insert({
      rut: payload.rut || '',
      nombre: payload.nombre,
      email: payload.email,
      plan: payload.plan || 'Pase Diario',
      tipo: payload.tipo || 'Hot Desk',
      activo: true
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function eliminarMiembro(id) {
  const { error } = await supabase.from('miembros').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// RESERVAS
// ============================================================
async function listarReservas() {
  const { data, error } = await supabase
    .from('reservas')
    .select('*, miembros(nombre)')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    miembroId: r.miembro_id,
    recurso: r.recurso,
    fecha: r.fecha,
    bloque: r.bloque,
    estado: r.estado,
    miembro: r.miembros?.nombre || 'Walk-in'
  }));
}

async function reservasHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('reservas')
    .select('*', { count: 'exact', head: true })
    .eq('fecha', hoy);
  if (error) throw error;
  return count || 0;
}

async function contarReservas() {
  const { count, error } = await supabase
    .from('reservas')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function crearReserva(payload, capacidadPeak) {
  // Verificar capacidad: máx N puestos simultáneos en bloque para hot desk / dedicado
  if (payload.recurso === 'Hot Desk' || payload.recurso === 'Escritorio Dedicado') {
    const { count, error: ec } = await supabase
      .from('reservas')
      .select('*', { count: 'exact', head: true })
      .eq('fecha', payload.fecha)
      .eq('bloque', payload.bloque || 'Día completo')
      .in('recurso', ['Hot Desk', 'Escritorio Dedicado']);
    if (ec) throw ec;
    if (count >= capacidadPeak) {
      const e = new Error(`Capacidad agotada en ese bloque (máx ${capacidadPeak}).`);
      e.status = 409;
      throw e;
    }
  }
  const { data, error } = await supabase
    .from('reservas')
    .insert({
      miembro_id: payload.miembroId ? parseInt(payload.miembroId, 10) : null,
      recurso: payload.recurso,
      fecha: payload.fecha,
      bloque: payload.bloque || 'Día completo',
      estado: 'Confirmada'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function eliminarReserva(id) {
  const { error } = await supabase.from('reservas').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CAFETERÍA
// ============================================================
async function listarVentas() {
  const { data, error } = await supabase
    .from('cafeteria')
    .select('*')
    .order('id', { ascending: false });
  if (error) throw error;
  return data.map(v => ({
    id: v.id,
    fecha: v.fecha,
    producto: v.producto,
    cantidad: v.cantidad,
    precio: v.precio,
    total: v.total,
    miembroId: v.miembro_id
  }));
}

async function crearVenta(payload) {
  const cantidad = parseInt(payload.cantidad, 10);
  const precio = parseInt(payload.precio, 10);
  const { data, error } = await supabase
    .from('cafeteria')
    .insert({
      fecha: new Date().toISOString().slice(0, 10),
      producto: payload.producto,
      cantidad,
      precio,
      total: cantidad * precio,
      miembro_id: payload.miembroId ? parseInt(payload.miembroId, 10) : null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function ingresosCafeteria() {
  // Sumar todos los totales — Supabase no tiene sum() directo, hacemos rpc o select
  const { data, error } = await supabase.from('cafeteria').select('total');
  if (error) throw error;
  return data.reduce((s, v) => s + (v.total || 0), 0);
}

// ============================================================
// WAREHOUSE (clientes históricos)
// ============================================================
async function listarHistoricos({ limit = 50, offset = 0, q = '', activo = '' }) {
  let query = supabase.from('clientes_historicos').select('*', { count: 'exact' });
  if (q) {
    query = query.or(`nombre.ilike.%${q}%,profesion.ilike.%${q}%,industria.ilike.%${q}%,ciudad.ilike.%${q}%,tipo_membresia.ilike.%${q}%`);
  }
  if (activo === 'true') query = query.eq('activo', true);
  if (activo === 'false') query = query.eq('activo', false);
  query = query.order('id', { ascending: true }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return {
    total: count || 0,
    pagina: data.map(toClienteCamel),
    limit, offset
  };
}

async function todosHistoricos() {
  // Para entrenamiento de modelos ML: traemos todo (250)
  const { data, error } = await supabase
    .from('clientes_historicos')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data.map(toClienteCamel);
}

async function statsHistoricos() {
  const clientes = await todosHistoricos();
  return aggregate(clientes);
}

function toClienteCamel(c) {
  return {
    id: c.id,
    nombre: c.nombre,
    edad: c.edad,
    genero: c.genero,
    profesion: c.profesion,
    industria: c.industria,
    estadoCivil: c.estado_civil,
    hijos: c.hijos,
    ingresoMensualClp: c.ingreso_mensual_clp,
    ciudad: c.ciudad,
    tipoMembresia: c.tipo_membresia,
    mesesActivo: c.meses_activo,
    frecuenciaSemanal: parseFloat(c.frecuencia_semanal),
    gastoCafeteriaClp: c.gasto_cafeteria_clp,
    usaSalaReuniones: c.usa_sala_reuniones,
    usaPhoneBooth: c.usa_phone_booth,
    satisfaccion: c.satisfaccion,
    nps: c.nps,
    fechaAlta: c.fecha_alta,
    fechaBaja: c.fecha_baja,
    activo: c.activo,
    motivoBaja: c.motivo_baja,
    ltvClp: c.ltv_clp,
    volvioASuscribirse: c.volvio_a_suscribirse
  };
}

function aggregate(clientes) {
  const total = clientes.length;
  if (total === 0) return { total: 0 };
  const activos = clientes.filter(c => c.activo).length;
  const churnRate = +((1 - activos / total) * 100).toFixed(1);
  const reSuscripcionRate = +(clientes.filter(c => c.volvioASuscribirse).length / total * 100).toFixed(1);
  const promFreq = +(clientes.reduce((s, c) => s + c.frecuenciaSemanal, 0) / total).toFixed(2);
  const promNps = +(clientes.reduce((s, c) => s + c.nps, 0) / total).toFixed(1);
  const promSat = +(clientes.reduce((s, c) => s + c.satisfaccion, 0) / total).toFixed(2);
  const promLtv = Math.round(clientes.reduce((s, c) => s + c.ltvClp, 0) / total);
  const promGastoCafe = Math.round(clientes.reduce((s, c) => s + c.gastoCafeteriaClp, 0) / total);
  const promotores = clientes.filter(c => c.nps >= 9).length;
  const detractores = clientes.filter(c => c.nps <= 6).length;
  const npsScore = +((promotores - detractores) / total * 100).toFixed(1);
  const groupCount = (key) => clientes.reduce((acc, c) => { acc[c[key]] = (acc[c[key]] || 0) + 1; return acc; }, {});
  return {
    total, activos, inactivos: total - activos, churnRate, reSuscripcionRate,
    promFreq, promNps, promSat, promLtv, promGastoCafe, npsScore,
    promotores, pasivos: total - promotores - detractores, detractores,
    porMembresia: groupCount('tipoMembresia'),
    porProfesion: groupCount('profesion'),
    porIndustria: groupCount('industria'),
    porCiudad: groupCount('ciudad')
  };
}

// ============================================================
// SEED del warehouse — bulk insert de 250 clientes
// ============================================================
async function seedHistoricos(clientes) {
  // Upsert para que sea idempotente
  const rows = clientes.map(c => ({
    id: c.id, nombre: c.nombre, edad: c.edad, genero: c.genero,
    profesion: c.profesion, industria: c.industria,
    estado_civil: c.estadoCivil, hijos: c.hijos,
    ingreso_mensual_clp: c.ingresoMensualClp, ciudad: c.ciudad,
    tipo_membresia: c.tipoMembresia, meses_activo: c.mesesActivo,
    frecuencia_semanal: c.frecuenciaSemanal,
    gasto_cafeteria_clp: c.gastoCafeteriaClp,
    usa_sala_reuniones: c.usaSalaReuniones,
    usa_phone_booth: c.usaPhoneBooth,
    satisfaccion: c.satisfaccion, nps: c.nps,
    fecha_alta: c.fechaAlta, fecha_baja: c.fechaBaja,
    activo: c.activo, motivo_baja: c.motivoBaja,
    ltv_clp: c.ltvClp, volvio_a_suscribirse: c.volvioASuscribirse
  }));
  // Insertamos en lotes de 100
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const { error } = await supabase.from('clientes_historicos').upsert(slice, { onConflict: 'id' });
    if (error) throw error;
  }
  return rows.length;
}

async function existeWarehouse() {
  const { count, error } = await supabase
    .from('clientes_historicos')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return (count || 0) >= 200;
}

// ============================================================
// PAGOS (Stripe)
// ============================================================
async function crearPagoPendiente(payload) {
  const { data, error } = await supabase
    .from('pagos')
    .insert({
      miembro_id: payload.miembroId || null,
      email: payload.email,
      nombre: payload.nombre || null,
      producto: payload.producto,
      monto: payload.monto,
      moneda: payload.moneda || 'clp',
      stripe_session_id: payload.stripeSessionId,
      estado: 'pending',
      metadata: payload.metadata || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function marcarPagoPagado({ stripeSessionId, paymentIntent }) {
  const { data, error } = await supabase
    .from('pagos')
    .update({ estado: 'paid', stripe_payment_intent: paymentIntent, paid_at: new Date().toISOString() })
    .eq('stripe_session_id', stripeSessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function marcarPagoFallido({ stripeSessionId }) {
  const { error } = await supabase
    .from('pagos')
    .update({ estado: 'failed' })
    .eq('stripe_session_id', stripeSessionId);
  if (error) throw error;
}

async function obtenerPagoPorSession(stripeSessionId) {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('stripe_session_id', stripeSessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listarPagos() {
  const { data, error } = await supabase
    .from('pagos')
    .select('*, miembros(nombre)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map(p => ({
    id: p.id,
    miembroId: p.miembro_id,
    miembroNombre: p.miembros?.nombre || null,
    email: p.email,
    nombre: p.nombre,
    producto: p.producto,
    monto: p.monto,
    moneda: p.moneda,
    estado: p.estado,
    stripeSessionId: p.stripe_session_id,
    createdAt: p.created_at,
    paidAt: p.paid_at,
    metadata: p.metadata
  }));
}

async function asegurarMiembroPorEmail({ email, nombre, plan, tipo }) {
  // Si existe miembro con ese email, lo activa y actualiza plan; si no, lo crea
  const { data: existente, error: e1 } = await supabase
    .from('miembros').select('*').eq('email', email).maybeSingle();
  if (e1) throw e1;
  if (existente) {
    const { data: actualizado, error: e2 } = await supabase
      .from('miembros')
      .update({ plan, tipo, activo: true })
      .eq('id', existente.id)
      .select().single();
    if (e2) throw e2;
    return actualizado;
  }
  const { data: nuevo, error: e3 } = await supabase
    .from('miembros')
    .insert({ email, nombre: nombre || email.split('@')[0], plan, tipo, activo: true })
    .select().single();
  if (e3) throw e3;
  return nuevo;
}

// ============================================================
// PUESTOS — feature de ocupación en tiempo real (P6-P7)
// Requiere migración sql/001_puestos.sql ejecutada en Supabase.
// ============================================================

// Lista todos los puestos con info enriquecida (vía vista v_puestos_live).
async function listarPuestos() {
  const { data, error } = await supabase
    .from('v_puestos_live')
    .select('*');
  if (error) throw error;
  return data || [];
}

// Cambia el estado del puesto y registra evento. Estados válidos:
// libre | reservado | ocupado | por_liberar | fuera_de_servicio
async function cambiarEstadoPuesto(id, nuevoEstado, extras = {}) {
  const ESTADOS = ['libre', 'reservado', 'ocupado', 'por_liberar', 'fuera_de_servicio'];
  if (!ESTADOS.includes(nuevoEstado)) {
    const e = new Error(`Estado inválido: ${nuevoEstado}. Válidos: ${ESTADOS.join(', ')}`);
    e.status = 400;
    throw e;
  }
  const patch = { estado: nuevoEstado };
  if (extras.miembro_id !== undefined) patch.miembro_id = extras.miembro_id;
  if (extras.reserva_id !== undefined) patch.reserva_id = extras.reserva_id;
  if (extras.notas !== undefined) patch.notas = extras.notas;

  const { data, error } = await supabase
    .from('puestos')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Check-in: el miembro empieza a usar el puesto (reservado → ocupado).
async function checkinPuesto(id, { miembro_id, reserva_id } = {}) {
  return cambiarEstadoPuesto(id, 'ocupado', { miembro_id, reserva_id });
}

// Check-out: el puesto vuelve a estar libre (ocupado → libre).
async function checkoutPuesto(id) {
  return cambiarEstadoPuesto(id, 'libre', { miembro_id: null, reserva_id: null });
}

// Liberar puesto en no-show. Marca reserva asociada como cancelada si existe.
async function liberarPuesto(id, motivo = 'no_show') {
  const { data: puesto } = await supabase.from('puestos').select('reserva_id').eq('id', id).single();
  if (puesto?.reserva_id) {
    await supabase.from('reservas').update({ estado: motivo }).eq('id', puesto.reserva_id);
  }
  return cambiarEstadoPuesto(id, 'libre', { miembro_id: null, reserva_id: null, notas: `Liberado por ${motivo}` });
}

// Llama a la función SQL fn_marcar_no_shows() — corre cada 60s desde el server.
async function marcarNoShows() {
  const { data, error } = await supabase.rpc('fn_marcar_no_shows', { minutos_gracia: 15 });
  if (error) throw error;
  return data || 0;
}

// Resumen agregado para topbar del staff: contador por estado y por tipo.
async function resumenOcupacion() {
  const { data, error } = await supabase.from('v_puestos_live').select('tipo, estado');
  if (error) throw error;
  const totales = { total: data.length, libre: 0, reservado: 0, ocupado: 0, por_liberar: 0, fuera_de_servicio: 0 };
  const porTipo = {};
  data.forEach(p => {
    totales[p.estado] = (totales[p.estado] || 0) + 1;
    if (!porTipo[p.tipo]) porTipo[p.tipo] = { total: 0, libre: 0, ocupado: 0 };
    porTipo[p.tipo].total++;
    if (p.estado === 'libre') porTipo[p.tipo].libre++;
    if (p.estado === 'ocupado') porTipo[p.tipo].ocupado++;
  });
  return { totales, porTipo };
}

module.exports = {
  supabase,
  listarMiembros, crearMiembro, eliminarMiembro,
  listarReservas, crearReserva, eliminarReserva, reservasHoy, contarReservas,
  listarVentas, crearVenta, ingresosCafeteria,
  listarHistoricos, todosHistoricos, statsHistoricos, aggregate,
  seedHistoricos, existeWarehouse,
  crearPagoPendiente, marcarPagoPagado, marcarPagoFallido, obtenerPagoPorSession,
  listarPagos, asegurarMiembroPorEmail,
  // Puestos / ocupación
  listarPuestos, cambiarEstadoPuesto, checkinPuesto, checkoutPuesto,
  liberarPuesto, marcarNoShows, resumenOcupacion
};
