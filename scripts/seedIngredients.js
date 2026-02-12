import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Ingredient from '../src/models/Ingredient.js';

dotenv.config();

const deriveProductUnit = (_category, purchaseUnit) => {
    const normalizedPurchaseUnit = purchaseUnit?.trim().toLowerCase() ?? '';

    if (normalizedPurchaseUnit.includes('kg') || normalizedPurchaseUnit.includes('g')) {
        return 'g';
    }

    if (
        normalizedPurchaseUnit.includes('ml') ||
        normalizedPurchaseUnit.includes('l ') ||
        normalizedPurchaseUnit.endsWith('l') ||
        normalizedPurchaseUnit.includes('litro')
    ) {
        return 'ml';
    }

    if (normalizedPurchaseUnit.includes('unidad') || normalizedPurchaseUnit.includes('unidades')) {
        return 'unidad';
    }

    if (normalizedPurchaseUnit.includes('botella')) {
        return 'botella';
    }
    if (normalizedPurchaseUnit.includes('lata')) {
        return 'lata';
    }
    if (normalizedPurchaseUnit.includes('vaso')) {
        return 'vaso';
    }
    if (
        normalizedPurchaseUnit.includes('bloque') ||
        normalizedPurchaseUnit.includes('pechuga') ||
        normalizedPurchaseUnit.includes('caja') ||
        normalizedPurchaseUnit.includes('bandeja') ||
        normalizedPurchaseUnit.includes('bolsa') ||
        normalizedPurchaseUnit.includes('paquete')
    ) {
        return 'unidad';
    }

    if (normalizedPurchaseUnit.length === 0) {
        return 'g';
    }

    return purchaseUnit.trim();
};

const ingredients = [
    {
        name: 'Burrata',
        sku: 'BUR001',
        stockInGrams: 1000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 125,
        reorderPointInGrams: 250,
        allergens: ['lácteos']
    },
    {
        name: 'Pan de masa madre',
        sku: 'PAN001',
        stockInGrams: 5000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 80,
        reorderPointInGrams: 500,
        allergens: ['gluten']
    },
    {
        name: 'Pesto rosso',
        sku: 'PES001',
        stockInGrams: 2000,
        purchaseUnit: 'frasco',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 300,
        allergens: ['frutos secos']
    },
    {
        name: 'Tomates cherry',
        sku: 'TOM001',
        stockInGrams: 3000,
        purchaseUnit: 'bandeja',
        conversionFactorToGrams: 250,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Aguacate',
        sku: 'AGU001',
        stockInGrams: 4000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 200,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Lima',
        sku: 'LIM001',
        stockInGrams: 1000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 80,
        reorderPointInGrams: 200,
        allergens: []
    },
    {
        name: 'Fresas',
        sku: 'FRE001',
        stockInGrams: 2500,
        purchaseUnit: 'bandeja',
        conversionFactorToGrams: 300,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Coco rallado',
        sku: 'COC001',
        stockInGrams: 1500,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 200,
        reorderPointInGrams: 300,
        allergens: []
    },
    {
        name: 'Frutos rojos',
        sku: 'FRU001',
        stockInGrams: 2000,
        purchaseUnit: 'bandeja',
        conversionFactorToGrams: 250,
        reorderPointInGrams: 400,
        allergens: []
    },
    {
        name: 'Granola de avena',
        sku: 'GRA001',
        stockInGrams: 3000,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 500,
        reorderPointInGrams: 600,
        allergens: ['gluten']
    },
    {
        name: 'Yogur griego',
        sku: 'YOG001',
        stockInGrams: 2000,
        purchaseUnit: 'vaso',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 300,
        allergens: ['lácteos']
    },
    {
        name: 'Mango',
        sku: 'MAN001',
        stockInGrams: 3000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 300,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Papaya',
        sku: 'PAP001',
        stockInGrams: 3000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 400,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Tofu',
        sku: 'TOF001',
        stockInGrams: 2000,
        purchaseUnit: 'bloque',
        conversionFactorToGrams: 250,
        reorderPointInGrams: 300,
        allergens: ['soja']
    },
    {
        name: 'Maíz crujiente',
        sku: 'MAI001',
        stockInGrams: 1500,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 200,
        reorderPointInGrams: 300,
        allergens: []
    },
    {
        name: 'Coulis de granada',
        sku: 'COU001',
        stockInGrams: 1000,
        purchaseUnit: 'frasco',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 200,
        allergens: []
    },
    {
        name: 'Crudités de verduras',
        sku: 'CRU001',
        stockInGrams: 3000,
        purchaseUnit: 'bandeja',
        conversionFactorToGrams: 500,
        reorderPointInGrams: 600,
        allergens: []
    },
    {
        name: 'Pan carasau',
        sku: 'CAR001',
        stockInGrams: 2000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 100,
        reorderPointInGrams: 300,
        allergens: ['gluten']
    },
    {
        name: 'Queso feta',
        sku: 'FET001',
        stockInGrams: 1500,
        purchaseUnit: 'bloque',
        conversionFactorToGrams: 200,
        reorderPointInGrams: 300,
        allergens: ['lácteos']
    },
    {
        name: 'Arroz',
        sku: 'ARR001',
        stockInGrams: 5000,
        purchaseUnit: 'kg',
        conversionFactorToGrams: 1000,
        reorderPointInGrams: 1000,
        allergens: []
    },
    {
        name: 'Salmón ahumado',
        sku: 'SAL001',
        stockInGrams: 2000,
        purchaseUnit: 'paquete',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 300,
        allergens: ['pescado']
    },
    {
        name: 'Huevo',
        sku: 'HUE001',
        stockInGrams: 3000,
        purchaseUnit: 'unidad',
        conversionFactorToGrams: 60,
        reorderPointInGrams: 600,
        allergens: ['huevo']
    },
    {
        name: 'Salsa holandesa',
        sku: 'HOL001',
        stockInGrams: 1000,
        purchaseUnit: 'frasco',
        conversionFactorToGrams: 200,
        reorderPointInGrams: 300,
        allergens: ['huevo', 'lácteos']
    },
    {
        name: 'Pollo',
        sku: 'POL001',
        stockInGrams: 4000,
        purchaseUnit: 'pechuga',
        conversionFactorToGrams: 250,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Curry verde',
        sku: 'CUR001',
        stockInGrams: 1000,
        purchaseUnit: 'frasco',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 200,
        allergens: []
    },
    {
        name: 'Leche de coco',
        sku: 'LEC001',
        stockInGrams: 2000,
        purchaseUnit: 'lata',
        conversionFactorToGrams: 400,
        reorderPointInGrams: 500,
        allergens: []
    },
    {
        name: 'Frutos secos',
        sku: 'FRS001',
        stockInGrams: 2000,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 250,
        reorderPointInGrams: 300,
        allergens: ['frutos secos']
    },
    {
        name: 'Rúcula',
        sku: 'RUC001',
        stockInGrams: 1000,
        purchaseUnit: 'bandeja',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 200,
        allergens: []
    },
    {
        name: 'Parmesano',
        sku: 'PAR001',
        stockInGrams: 1500,
        purchaseUnit: 'bloque',
        conversionFactorToGrams: 200,
        reorderPointInGrams: 300,
        allergens: ['lácteos']
    },
    {
        name: 'Vinagre balsámico',
        sku: 'VIN001',
        stockInGrams: 1000,
        purchaseUnit: 'botella',
        conversionFactorToGrams: 500,
        reorderPointInGrams: 300,
        allergens: []
    },
    {
        name: 'Paté de trufa',
        sku: 'PAT001',
        stockInGrams: 1000,
        purchaseUnit: 'frasco',
        conversionFactorToGrams: 150,
        reorderPointInGrams: 200,
        allergens: []
    },
    {
        name: 'Aceite de trufa',
        sku: 'ACE001',
        stockInGrams: 1000,
        purchaseUnit: 'botella',
        conversionFactorToGrams: 500,
        reorderPointInGrams: 300,
        allergens: []
    },
    {
        name: 'Semillas de chía',
        sku: 'CHI001',
        stockInGrams: 2000,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 250,
        reorderPointInGrams: 300,
        allergens: []
    },
    {
        name: 'Leche de almendra',
        sku: 'LEA001',
        stockInGrams: 2000,
        purchaseUnit: 'botella',
        conversionFactorToGrams: 1000,
        reorderPointInGrams: 500,
        allergens: ['frutos secos']
    },
    {
        name: 'Miel',
        sku: 'MIE001',
        stockInGrams: 1500,
        purchaseUnit: 'frasco',
        conversionFactorToGrams: 500,
        reorderPointInGrams: 300,
        allergens: []
    },
    {
        name: 'On Lemon Naranja',
        sku: 'BEV001',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Cerveza Sin Alcohol',
        sku: 'BEV002',
        stockInGrams: 96,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: ['gluten'],
        category: 'beverage'
    },
    {
        name: 'Cerveza Rubia',
        sku: 'BEV003',
        stockInGrams: 96,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: ['gluten'],
        category: 'beverage'
    },
    {
        name: 'Clara',
        sku: 'BEV004',
        stockInGrams: 96,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: ['gluten'],
        category: 'beverage'
    },
    {
        name: 'Zumo de Uva y Melocoton',
        sku: 'BEV005',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'One Lemon Kola',
        sku: 'BEV006',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Zumo de Manzana',
        sku: 'BEV007',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Wostok Dátil y Granada',
        sku: 'BEV008',
        stockInGrams: 96,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Agua con gas Vichy Catalan',
        sku: 'BEV009',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Wostok Cardamomo',
        sku: 'BEV010',
        stockInGrams: 96,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'On Lemon Lima',
        sku: 'BEV011',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'On Lemon Matchbata',
        sku: 'BEV012',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Vigo Kombucha Açaí',
        sku: 'BEV013',
        stockInGrams: 80,
        purchaseUnit: 'caja (12u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Mama Pineapple',
        sku: 'BEV014',
        stockInGrams: 120,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 24,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Agua',
        sku: 'BEV015',
        stockInGrams: 200,
        purchaseUnit: 'caja (24u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 36,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Batido Postre',
        sku: 'BEV016',
        stockInGrams: 80,
        purchaseUnit: 'caja (12u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Café con leche',
        sku: 'CAF001',
        stockInGrams: 300,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 80,
        allergens: ['lácteos'],
        category: 'coffee'
    },
    {
        name: 'Café solo',
        sku: 'CAF002',
        stockInGrams: 300,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 80,
        allergens: [],
        category: 'coffee'
    },
    {
        name: 'Cortado',
        sku: 'CAF003',
        stockInGrams: 300,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 80,
        allergens: ['lácteos'],
        category: 'coffee'
    },
    {
        name: 'Té e Infusiones',
        sku: 'BEV017',
        stockInGrams: 200,
        purchaseUnit: 'caja (50u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 40,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Cafe con Leche - Postre',
        sku: 'CAF004',
        stockInGrams: 200,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 60,
        allergens: ['lácteos'],
        category: 'coffee'
    },
    {
        name: 'Cafe - Postre',
        sku: 'CAF005',
        stockInGrams: 200,
        purchaseUnit: 'bolsa',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 60,
        allergens: [],
        category: 'coffee'
    },
    {
        name: 'Brutal Blanc 2024 (copa)',
        sku: 'BEV018',
        stockInGrams: 60,
        purchaseUnit: 'botella (750ml)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Pares Balta Blanc de Pacs 2024 (copa)',
        sku: 'BEV019',
        stockInGrams: 60,
        purchaseUnit: 'botella (750ml)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Brutal 2022 (copa)',
        sku: 'BEV020',
        stockInGrams: 60,
        purchaseUnit: 'botella (750ml)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Mas Petit 2021 Pares Balta (copa)',
        sku: 'BEV021',
        stockInGrams: 60,
        purchaseUnit: 'botella (750ml)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Pares Balta Brut (copa)',
        sku: 'BEV022',
        stockInGrams: 60,
        purchaseUnit: 'botella (750ml)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 12,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Brutal Blanc 2024 (botella)',
        sku: 'BEV023',
        stockInGrams: 24,
        purchaseUnit: 'caja (6u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 6,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Pares Balta Blanc de Pacs 2024 (botella)',
        sku: 'BEV024',
        stockInGrams: 24,
        purchaseUnit: 'caja (6u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 6,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Brutal 2022 (botella)',
        sku: 'BEV025',
        stockInGrams: 24,
        purchaseUnit: 'caja (6u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 6,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Mas Petit 2021 Pares Balta (botella)',
        sku: 'BEV026',
        stockInGrams: 24,
        purchaseUnit: 'caja (6u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 6,
        allergens: [],
        category: 'beverage'
    },
    {
        name: 'Pares Balta Brut (botella)',
        sku: 'BEV027',
        stockInGrams: 24,
        purchaseUnit: 'caja (6u)',
        conversionFactorToGrams: 1,
        reorderPointInGrams: 6,
        allergens: [],
        category: 'beverage'
    }
].map(
    ({
        stockInGrams,
        reorderPointInGrams,
        stock,
        reorderPoint,
        conversionFactorToGrams,
        category,
        productUnit,
        purchaseUnit,
        ...rest
    }) => {
        const normalizedCategory = category ?? 'ingredient';
        const normalizedPurchaseUnit = purchaseUnit?.trim();
        const resolvedProductUnit =
            productUnit ?? deriveProductUnit(normalizedCategory, normalizedPurchaseUnit);

        return {
            ...rest,
            purchaseUnit: normalizedPurchaseUnit ?? 'unidad',
            productUnit: resolvedProductUnit,
            stock: stock ?? stockInGrams ?? 0,
            reorderPoint: reorderPoint ?? reorderPointInGrams ?? 0,
            conversionFactorToGrams: conversionFactorToGrams ?? 1,
            category: normalizedCategory
        };
    }
);

const seed = async () => {
    const NODE_ENV = process.env.NODE_ENV ?? 'development';
    const getDatabaseUri = () => {
        if (NODE_ENV === 'production') {
            return process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI;
        }
        return process.env.MONGODB_URI;
    };

    const mongoUri = getDatabaseUri();
    if (!mongoUri) {
        throw new Error('MongoDB URI is not defined in environment variables');
    }

    await connectDatabase(mongoUri);

    const operations = ingredients.map((ingredient) => ({
        updateOne: {
            filter: { name: ingredient.name },
            update: { $set: ingredient },
            upsert: true
        }
    }));

    const result = await Ingredient.bulkWrite(operations);
    console.log('Ingredient seed completed', result);
    process.exit(0);
};

seed().catch((error) => {
    console.error('Ingredient seed failed', error);
    process.exit(1);
});

