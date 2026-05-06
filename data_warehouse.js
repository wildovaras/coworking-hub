// Data Warehouse simulado (estilo Amazon Redshift)
// Genera 250 clientes históricos con 21 atributos correlacionados de forma realista
// para alimentar dashboards analíticos y modelos predictivos.

const fs = require('fs');
const path = require('path');

const NOMBRES_M = ['Juan','Diego','Felipe','Matías','Nicolás','Tomás','Sebastián','Cristóbal','Andrés','Vicente','Lucas','Joaquín','Benjamín','Martín','Ignacio','Rodrigo','Pablo','Gonzalo','Esteban','Camilo'];
const NOMBRES_F = ['Camila','María','Valentina','Catalina','Sofía','Antonia','Javiera','Constanza','Daniela','Macarena','Florencia','Isidora','Trinidad','Magdalena','Fernanda','Paula','Carolina','Bárbara','Andrea','Francisca'];
const APELLIDOS = ['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras','Silva','Martínez','Sepúlveda','Morales','Rodríguez','López','Fuentes','Hernández','Torres','Araya','Flores','Espinoza','Valenzuela'];

const PROFESIONES = [
  { nombre: 'Ingeniero',         freqBase: 3.5, ingresoBase: 1800000 },
  { nombre: 'Diseñador/a',       freqBase: 4.0, ingresoBase: 950000 },
  { nombre: 'Desarrollador/a',   freqBase: 4.2, ingresoBase: 1700000 },
  { nombre: 'Consultor/a',       freqBase: 2.8, ingresoBase: 1500000 },
  { nombre: 'Abogado/a',         freqBase: 2.5, ingresoBase: 1900000 },
  { nombre: 'Contador/a',        freqBase: 2.2, ingresoBase: 1100000 },
  { nombre: 'Marketing Digital', freqBase: 3.8, ingresoBase: 1200000 },
  { nombre: 'Periodista',        freqBase: 3.0, ingresoBase: 850000 },
  { nombre: 'Emprendedor/a',     freqBase: 4.5, ingresoBase: 1400000 },
  { nombre: 'Arquitecto/a',      freqBase: 3.2, ingresoBase: 1300000 },
  { nombre: 'Psicólogo/a',       freqBase: 2.8, ingresoBase: 1100000 },
  { nombre: 'Estudiante',        freqBase: 3.5, ingresoBase: 350000  }
];

const INDUSTRIAS = ['Tecnología','Servicios profesionales','Retail','Educación','Finanzas','Salud','Marketing','Consultoría','Construcción','Audiovisual'];
const CIUDADES   = ['Santiago','Valparaíso','Viña del Mar','Concepción','Talca','Curicó','Rancagua','Temuco','La Serena','Antofagasta'];
const ESTADOS    = ['Soltero/a','Casado/a','Conviviente','Divorciado/a'];
const MEMBRESIAS = ['Mensual','Anual','Pase Diario','Corporativa'];
const MOTIVOS_BAJA = ['Cambio de ciudad','Encontró oficina propia','Razones económicas','Insatisfacción con el servicio','Cambio de modalidad de trabajo','—'];

// PRNG con semilla — reproducibilidad
function PRNG(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
const rnd = PRNG(20260506);

const pick   = arr   => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const noise  = sigma => (rnd() + rnd() + rnd() - 1.5) * sigma;
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fechaDiasAtras(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function generarCliente(id) {
  const genero = rnd() < 0.48 ? 'F' : (rnd() < 0.95 ? 'M' : 'O');
  const nombre = (genero === 'F' ? pick(NOMBRES_F) : pick(NOMBRES_M)) + ' ' + pick(APELLIDOS) + ' ' + pick(APELLIDOS);
  const edad = clamp(Math.round(28 + noise(8) + (rnd() < 0.15 ? 18 : 0)), 22, 65);
  const profesion = pick(PROFESIONES);
  const industria = pick(INDUSTRIAS);
  const ciudad = rnd() < 0.55 ? 'Santiago' : pick(CIUDADES);
  const estadoCivil = edad < 28 ? (rnd() < 0.85 ? 'Soltero/a' : 'Conviviente') : pick(ESTADOS);
  const hijos = estadoCivil === 'Soltero/a' && edad < 30 ? 0 : (rnd() < 0.45 ? between(0, 3) : 0);
  const ingresoMensual = Math.round(profesion.ingresoBase * (1 + noise(0.25)));
  const tipoMembresia = (() => {
    const r = rnd();
    if (ingresoMensual > 1500000 && r < 0.5) return 'Anual';
    if (ingresoMensual > 1200000 && r < 0.7) return 'Mensual';
    if (industria === 'Tecnología' && r < 0.3) return 'Corporativa';
    return r < 0.4 ? 'Pase Diario' : 'Mensual';
  })();
  const mesesActivo = between(1, 36);

  // Frecuencia influida por profesión, edad e hijos
  let frecuencia = profesion.freqBase + noise(0.6) - (edad - 35) * 0.02 - hijos * 0.3;
  if (tipoMembresia === 'Pase Diario') frecuencia *= 0.55;
  if (tipoMembresia === 'Anual')       frecuencia *= 1.15;
  frecuencia = clamp(+frecuencia.toFixed(2), 0.5, 5.0);

  // Gasto cafetería correlacionado con frecuencia y hijos
  const gastoCafeteria = Math.round((4500 * frecuencia + hijos * 1200 + noise(2000) + 8000) / 100) * 100;
  const usaSala = rnd() < (industria === 'Consultoría' ? 0.7 : 0.35);
  const usaPhoneBooth = rnd() < (profesion.nombre === 'Consultor/a' || profesion.nombre === 'Marketing Digital' ? 0.6 : 0.25);

  // Satisfacción (1-5) influida por frecuencia y meses activos
  const satisfaccion = clamp(Math.round(3.5 + frecuencia * 0.25 - (rnd() < 0.1 ? 1.5 : 0) + noise(0.3)), 1, 5);
  const nps = clamp(Math.round(6 + (satisfaccion - 3) * 1.4 + noise(1.2)), 0, 10);

  // Volvió a suscribirse: depende de satisfacción, frecuencia, NPS, antigüedad
  const score = (satisfaccion - 3) * 0.6 + (frecuencia - 2.5) * 0.3 + (nps - 7) * 0.15 + (mesesActivo > 12 ? 0.4 : -0.2) + noise(0.4);
  const volvioASuscribirse = score > 0;

  const fechaAlta = fechaDiasAtras(mesesActivo * 30 + between(0, 25));
  const activo = rnd() < 0.62; // 62% activos
  const fechaBaja = activo ? null : fechaDiasAtras(between(1, 120));
  const motivoBaja = activo ? '—' : pick(MOTIVOS_BAJA.slice(0, 5));
  const ltvClp = Math.round((tipoMembresia === 'Anual' ? 2400000 : tipoMembresia === 'Mensual' ? 240000 * mesesActivo : 18000 * frecuencia * 4 * mesesActivo) + gastoCafeteria * 4 * mesesActivo / 1000);

  return {
    id,
    nombre,
    edad,
    genero,
    profesion: profesion.nombre,
    industria,
    estadoCivil,
    hijos,
    ingresoMensualClp: ingresoMensual,
    ciudad,
    tipoMembresia,
    mesesActivo,
    frecuenciaSemanal: frecuencia,
    gastoCafeteriaClp: gastoCafeteria,
    usaSalaReuniones: usaSala,
    usaPhoneBooth,
    satisfaccion,
    nps,
    fechaAlta,
    fechaBaja,
    activo,
    motivoBaja,
    ltvClp,
    volvioASuscribirse
  };
}

function buildWarehouse(n = 250) {
  const clientes = [];
  for (let i = 1; i <= n; i++) clientes.push(generarCliente(i));
  return { clientes, generadoEn: new Date().toISOString(), version: '1.0', total: n };
}

const WH_FILE = path.join(__dirname, 'warehouse.json');
function loadWarehouse() {
  try {
    const wh = JSON.parse(fs.readFileSync(WH_FILE, 'utf8'));
    if (wh.clientes && wh.clientes.length >= 200) return wh;
  } catch (_) {}
  const wh = buildWarehouse(250);
  fs.writeFileSync(WH_FILE, JSON.stringify(wh, null, 2));
  return wh;
}

// Agregaciones para dashboard analítico
function aggregate(clientes) {
  const total = clientes.length;
  const activos = clientes.filter(c => c.activo).length;
  const churnRate = +((1 - activos / total) * 100).toFixed(1);
  const reSuscripcionRate = +(clientes.filter(c => c.volvioASuscribirse).length / total * 100).toFixed(1);
  const promFreq = +(clientes.reduce((s, c) => s + c.frecuenciaSemanal, 0) / total).toFixed(2);
  const promNps = +(clientes.reduce((s, c) => s + c.nps, 0) / total).toFixed(1);
  const promSat = +(clientes.reduce((s, c) => s + c.satisfaccion, 0) / total).toFixed(2);
  const promLtv = Math.round(clientes.reduce((s, c) => s + c.ltvClp, 0) / total);
  const promGastoCafe = Math.round(clientes.reduce((s, c) => s + c.gastoCafeteriaClp, 0) / total);

  // NPS bucketización (Detractores 0-6, Pasivos 7-8, Promotores 9-10)
  const promotores = clientes.filter(c => c.nps >= 9).length;
  const detractores = clientes.filter(c => c.nps <= 6).length;
  const npsScore = +((promotores - detractores) / total * 100).toFixed(1);

  // Distribuciones
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

module.exports = { loadWarehouse, aggregate, buildWarehouse };
