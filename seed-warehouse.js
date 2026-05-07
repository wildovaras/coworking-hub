// Carga los 250 clientes históricos en Supabase (idempotente: usa upsert)
// Ejecutar: node seed-warehouse.js

require('dotenv').config?.();
// fallback manual de .env si no está dotenv
if (!process.env.SUPABASE_URL) {
  try {
    const fs = require('fs');
    const env = fs.readFileSync('.env', 'utf8');
    env.split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
  } catch (_) {}
}

const { generarClientes } = require('./data_warehouse');
const { seedHistoricos } = require('./db');

(async () => {
  console.log('🌱 Generando 250 clientes históricos...');
  const clientes = generarClientes(250);
  console.log(`✓ Generados ${clientes.length} clientes con seed reproducible`);

  console.log('📤 Insertando en Supabase (upsert por id)...');
  try {
    const n = await seedHistoricos(clientes);
    console.log(`✅ ${n} clientes cargados en clientes_historicos`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message || e);
    process.exit(1);
  }
})();
