/**
 * Script para crear proveedores en la base de datos.
 * Lee desde stockcontrol.suppliers.json
 * Uso: node scripts/seedSuppliers.js
 * Orden: seedRoles -> seedIngredients -> seedMenu -> seedSuppliers -> seedEvents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Supplier from '../src/models/Supplier.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const seed = async () => {
  const mongoUri = process.env.NODE_ENV === 'production'
    ? (process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI)
    : process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI is not defined in environment variables');
  }

  const suppliers = JSON.parse(
    readFileSync(join(__dirname, 'stockcontrol.suppliers.json'), 'utf-8')
  );

  await connectDatabase(mongoUri);

  const operations = suppliers.map((supplier) => ({
    updateOne: {
      filter: { $or: [{ sku: supplier.sku }, { name: supplier.name }] },
      update: { $set: supplier },
      upsert: true
    }
  }));

  const result = await Supplier.bulkWrite(operations);
  console.log('Supplier seed completed', { inserted: result.upsertedCount ?? 0, modified: result.modifiedCount ?? 0 });
  process.exit(0);
};

seed().catch((error) => {
  console.error('Supplier seed failed', error);
  process.exit(1);
});
