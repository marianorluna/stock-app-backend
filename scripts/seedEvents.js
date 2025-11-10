import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Dish from '../src/models/Dish.js';
import Ingredient from '../src/models/Ingredient.js';
import Sale from '../src/models/Sale.js';
import Purchase from '../src/models/Purchase.js';
import Wastage from '../src/models/Wastage.js';
import stockService from '../src/services/stockService.js';

dotenv.config();

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateSales = (dishes, count) => {
  const sales = [];
  for (let i = 0; i < count; i += 1) {
    const linesCount = randomBetween(1, Math.min(3, dishes.length));
    const selected = [...dishes].sort(() => 0.5 - Math.random()).slice(0, linesCount);
    sales.push({
      source: 'manual',
      timestamp: new Date(Date.now() - randomBetween(0, 7) * 24 * 60 * 60 * 1000),
      lines: selected.map((dish) => ({
        dish: dish._id,
        quantity: randomBetween(1, 3)
      })),
      metadata: {
        note: `seed-sale-${i + 1}`
      }
    });
  }
  return sales;
};

const toConversion = (ingredient) =>
  ingredient.conversionFactorToGrams && ingredient.conversionFactorToGrams > 0
    ? ingredient.conversionFactorToGrams
    : 1;

const generatePurchases = (ingredients, count) => {
  const purchases = [];
  for (let i = 0; i < count; i += 1) {
    const itemsCount = randomBetween(2, Math.min(4, ingredients.length));
    const selected = [...ingredients].sort(() => 0.5 - Math.random()).slice(0, itemsCount);
    purchases.push({
      supplier: `Proveedor ${i + 1}`,
      invoiceNumber: `INV-${String(i + 1).padStart(3, '0')}`,
      timestamp: new Date(Date.now() - randomBetween(0, 10) * 24 * 60 * 60 * 1000),
      items: selected.map((ingredient) => {
        const isBulk = ingredient.category === 'ingredient';
        const conversion = toConversion(ingredient);
        const quantityInGrams = isBulk
          ? randomBetween(500, 3000)
          : randomBetween(1, 12) * conversion;
        const unitPrice = Number((Math.random() * 15 + 5).toFixed(2));
        return {
          ingredient: ingredient._id,
          quantityInGrams,
          unitPrice
        };
      }),
      metadata: {
        note: `seed-purchase-${i + 1}`
      }
    });
  }
  return purchases;
};

const generateWastage = (ingredients, count) => {
  const wastage = [];
  for (let i = 0; i < count; i += 1) {
    const itemsCount = randomBetween(1, Math.min(3, ingredients.length));
    const selected = [...ingredients].sort(() => 0.5 - Math.random()).slice(0, itemsCount);
    wastage.push({
      timestamp: new Date(Date.now() - randomBetween(0, 5) * 24 * 60 * 60 * 1000),
      items: selected.map((ingredient) => {
        const isBulk = ingredient.category === 'ingredient';
        const conversion = toConversion(ingredient);
        const quantityInGrams = isBulk
          ? randomBetween(100, 600)
          : randomBetween(1, 6) * conversion;
        return {
          ingredient: ingredient._id,
          quantityInGrams,
          reason: `Merma de ${ingredient.name.toLowerCase()}`
        };
      }),
      metadata: {
        note: `seed-wastage-${i + 1}`
      }
    });
  }
  return wastage;
};

const seed = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  await connectDatabase(mongoUri);

  const dishes = await Dish.find({ isActive: true }).lean();
  const ingredients = await Ingredient.find().lean();

  if (!dishes.length) {
    throw new Error('No dishes found. Seed dishes before running this script.');
  }
  if (!ingredients.length) {
    throw new Error('No ingredients found. Seed ingredients before running this script.');
  }

  const salesPayload = generateSales(dishes, 10);
  const purchasesPayload = generatePurchases(ingredients, 5);
  const wastagePayload = generateWastage(ingredients, 15);

  console.log('Seeding purchases...');
  for (const purchaseData of purchasesPayload) {
    const purchase = await Purchase.create(purchaseData);
    await stockService.applyPurchaseToStock(purchase);
  }

  console.log('Seeding sales...');
  for (const saleData of salesPayload) {
    const sale = await Sale.create(saleData);
    await stockService.applySaleToStock(sale);
  }

  console.log('Seeding wastage...');
  for (const wastageData of wastagePayload) {
    const wastage = await Wastage.create(wastageData);
    await stockService.applyWastageToStock(wastage);
  }

  console.log('Seed completed', {
    sales: salesPayload.length,
    purchases: purchasesPayload.length,
    wastage: wastagePayload.length
  });
  process.exit(0);
};

seed().catch((error) => {
  console.error('Seed failed', error);
  process.exit(1);
});

