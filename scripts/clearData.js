/**
 * Script para borrar todos los datos de colecciones de negocio.
 * NO borra: Users, Roles, Permissions, Config, Notifications, UserSubscriptions.
 * Uso: node scripts/clearData.js
 * ⚠️ Destructivo: borra dishes, ingredients, beverages, purchases, sales, suppliers, wastages, wastagepresets, processedinvoices, qmareroimports
 */

import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Dish from '../src/models/Dish.js';
import Ingredient from '../src/models/Ingredient.js';
import Beverage from '../src/models/Beverage.js';
import Purchase from '../src/models/Purchase.js';
import Sale from '../src/models/Sale.js';
import Supplier from '../src/models/Supplier.js';
import Wastage from '../src/models/Wastage.js';
import WastagePreset from '../src/models/WastagePreset.js';
import ProcessedInvoice from '../src/models/ProcessedInvoice.js';
import QmareroImport from '../src/models/QmareroImport.js';

dotenv.config();

const COLLECTIONS = [
  { name: 'dishes', model: Dish },
  { name: 'ingredients', model: Ingredient },
  { name: 'beverages', model: Beverage },
  { name: 'purchases', model: Purchase },
  { name: 'sales', model: Sale },
  { name: 'suppliers', model: Supplier },
  { name: 'wastages', model: Wastage },
  { name: 'wastagepresets', model: WastagePreset },
  { name: 'processedinvoices', model: ProcessedInvoice },
  { name: 'qmareroimports', model: QmareroImport }
];

const clearData = async () => {
  const mongoUri =
    process.env.NODE_ENV === 'production'
      ? (process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI)
      : process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI is not defined in environment variables');
  }

  if (process.env.NODE_ENV === 'production' && process.env.FORCE_CLEAR !== 'true') {
    throw new Error('Clear aborted in production. Set FORCE_CLEAR=true to override.');
  }

  await connectDatabase(mongoUri);

  for (const { name, model } of COLLECTIONS) {
    const result = await model.deleteMany({});
    console.log(`✅ ${name}: deleted ${result.deletedCount} documents`);
  }

  console.log('🎉 Clear completed');
  process.exit(0);
};

clearData().catch((error) => {
  console.error('Clear failed', error);
  process.exit(1);
});
