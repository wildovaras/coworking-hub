// ============================================================
// stripe_module.js — Catálogo de productos y wrapper Stripe
// ============================================================

const Stripe = require('stripe');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET) {
  console.warn('⚠ STRIPE_SECRET_KEY no configurada — pagos deshabilitados');
}

const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2024-11-20.acacia' }) : null;

// Catálogo de productos del coworking
// Stripe usa CLP como zero-decimal currency: el monto va en pesos directos
const PRODUCTOS = {
  'pase-diario': {
    id: 'pase-diario',
    nombre: 'Pase Diario',
    descripcion: 'Acceso por 1 día completo a hot desks, Wi-Fi y zona común',
    precioClp: 18000,
    duracionDias: 1,
    plan: 'Pase Diario',
    tipo: 'Hot Desk',
    destacado: false,
    icono: 'sun'
  },
  'membresia-mensual': {
    id: 'membresia-mensual',
    nombre: 'Membresía Mensual',
    descripcion: 'Acceso ilimitado durante 30 días · hot desks + 4h salas/mes + 20% off cafetería',
    precioClp: 240000,
    duracionDias: 30,
    plan: 'Membresía Mensual',
    tipo: 'Hot Desk',
    destacado: true,
    icono: 'calendar'
  },
  'membresia-anual': {
    id: 'membresia-anual',
    nombre: 'Membresía Anual',
    descripcion: 'Acceso ilimitado por 12 meses · escritorio dedicado + 8h salas/mes + 30% off cafetería',
    precioClp: 2400000,
    duracionDias: 365,
    plan: 'Membresía Anual',
    tipo: 'Escritorio Dedicado',
    destacado: false,
    icono: 'star'
  },
  'corporativa': {
    id: 'corporativa',
    nombre: 'Membresía Corporativa',
    descripcion: 'Para equipos de hasta 5 personas · sala dedicada + facturación corporativa',
    precioClp: 480000,
    duracionDias: 30,
    plan: 'Membresía Corporativa',
    tipo: 'Escritorio Dedicado',
    destacado: false,
    icono: 'briefcase'
  }
};

function listarProductos() {
  return Object.values(PRODUCTOS);
}

function getProducto(id) {
  return PRODUCTOS[id] || null;
}

// Crear sesión de Stripe Checkout
async function crearCheckoutSession({ productoId, email, nombre, baseUrl }) {
  if (!stripe) throw new Error('Stripe no configurado');
  const producto = getProducto(productoId);
  if (!producto) throw new Error('Producto no válido: ' + productoId);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'clp',
        product_data: {
          name: producto.nombre,
          description: producto.descripcion
        },
        unit_amount: producto.precioClp
      },
      quantity: 1
    }],
    success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/cancel.html`,
    metadata: {
      producto_id: producto.id,
      plan: producto.plan,
      tipo: producto.tipo,
      nombre: nombre || ''
    }
  });

  return session;
}

// Verificar webhook event
function verificarWebhook(rawBody, signature, secret) {
  if (!stripe) throw new Error('Stripe no configurado');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// Recuperar sesión por id (para confirmar en /success)
async function obtenerSesion(sessionId) {
  if (!stripe) throw new Error('Stripe no configurado');
  return await stripe.checkout.sessions.retrieve(sessionId);
}

module.exports = {
  PRODUCTOS,
  listarProductos,
  getProducto,
  crearCheckoutSession,
  verificarWebhook,
  obtenerSesion,
  isReady: () => !!stripe
};
