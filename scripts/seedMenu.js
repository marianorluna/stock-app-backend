import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Dish from '../src/models/Dish.js';
import Ingredient from '../src/models/Ingredient.js';

dotenv.config();

const normalizeKey = (value) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const recipe = (items) => items;

const dishes = [
    {
        name: 'On Lemon Naranja',
        description: 'Refresco natural y vegano con jugo de naranja.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Cerveza Sin Alcohol',
        description: 'IPA sin alcohol ni gluten con perfil lupulado.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Cerveza Rubia',
        description: 'Cerveza rubia sin gluten, ligera y refrescante.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Clara',
        description: 'Mezcla de cerveza rubia con limonada de limon y mandarina.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Zumo de Uva y Melocoton',
        description: 'Zumo bio de uva y melocoton.',
        price: 2.0,
        type: 'drink'
    },
    {
        name: 'One Lemon Kola',
        description: 'Refresco natural sin conservantes con nuez de kola.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Zumo de Manzana',
        description: 'Zumo de manzana 100% bio.',
        price: 2.0,
        type: 'drink'
    },
    {
        name: 'Wostok Datil y Granada',
        description: 'Refresco Wostok de datil y granada.',
        price: 3.8,
        type: 'drink'
    },
    {
        name: 'Agua con gas Vichy Catalan',
        description: 'Agua mineral con gas Vichy Catalan.',
        price: 2.55,
        type: 'drink'
    },
    {
        name: 'Wostok Cardamomo',
        description: 'Refresco Wostok con cardamomo.',
        price: 3.8,
        type: 'drink'
    },
    {
        name: 'On Lemon Lima',
        description: 'Refresco natural sabor lima.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'On Lemon Matchbata',
        description: 'Refresco natural On Lemon Matchbata.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Vigo Kombucha Acai',
        description: 'Kombucha Vigo sabor acai.',
        price: 4.2,
        type: 'drink'
    },
    {
        name: 'Mama Pineapple',
        description: 'Refresco de pina natural.',
        price: 3.5,
        type: 'drink'
    },
    {
        name: 'Agua',
        description: 'Agua embotellada.',
        price: 2.0,
        type: 'drink'
    },
    {
        name: 'Tostada Mediterranea',
        description: 'Burrata sobre pan de masa madre con pesto rosso y tomates cherry.',
        price: 10.0,
        type: 'dish',
        recipe: recipe([
            { name: 'Burrata', grams: 125 },
            { name: 'Pan de masa madre', grams: 80 },
            { name: 'Pesto rosso', grams: 30 },
            { name: 'Tomates cherry', grams: 60 },
            { name: 'Frutos secos', grams: 10 }
        ])
    },
    {
        name: 'Extra Huevo',
        description: 'Suplemento de huevo.',
        price: 1.85,
        type: 'dish',
        recipe: recipe([{ name: 'Huevo', grams: 60 }])
    },
    {
        name: 'Clasica de Aguacate',
        description: 'Pan de masa madre con aguacate fresco y lima.',
        price: 7.9,
        type: 'dish',
        recipe: recipe([
            { name: 'Pan de masa madre', grams: 80 },
            { name: 'Aguacate', grams: 120 },
            { name: 'Lima', grams: 10 }
        ])
    },
    {
        name: 'Air Pancake',
        description: 'Pancakes aireados con sopa de fresas, coco y frutos rojos.',
        price: 10.0,
        type: 'dessert',
        recipe: recipe([
            { name: 'Huevo', grams: 60 },
            { name: 'Fresas', grams: 80 },
            { name: 'Frutos rojos', grams: 70 },
            { name: 'Coco rallado', grams: 20 },
            { name: 'Miel', grams: 15 }
        ])
    },
    {
        name: 'Bowl de Yogur y Granola',
        description: 'Granola de avena con yogur griego, frutos rojos y coco.',
        price: 6.5,
        type: 'dessert',
        recipe: recipe([
            { name: 'Yogur griego', grams: 150 },
            { name: 'Granola de avena', grams: 80 },
            { name: 'Frutos rojos', grams: 60 },
            { name: 'Coco rallado', grams: 15 },
            { name: 'Miel', grams: 10 }
        ])
    },
    {
        name: 'Ceviche Veggie Tropical',
        description: 'Ceviche de mango, papaya, aguacate, tofu y maiz crujiente.',
        price: 12.5,
        type: 'dish',
        recipe: recipe([
            { name: 'Mango', grams: 90 },
            { name: 'Papaya', grams: 90 },
            { name: 'Aguacate', grams: 80 },
            { name: 'Tofu', grams: 70 },
            { name: 'Maíz crujiente', grams: 30 },
            { name: 'Crudités de verduras', grams: 60 }
        ])
    },
    {
        name: 'Hummus Granada',
        description: 'Hummus con coulis de granada, crudites y pan carasau.',
        price: 8.0,
        type: 'dish',
        recipe: recipe([
            { name: 'Coulis de granada', grams: 25 },
            { name: 'Crudités de verduras', grams: 90 },
            { name: 'Pan carasau', grams: 30 },
            { name: 'Frutos secos', grams: 15 }
        ])
    },
    {
        name: 'Berenjena Asada con Especias Arabes',
        description: 'Berenjena asada con especias arabes, queso feta y pan carasau.',
        price: 8.0,
        type: 'dish'
    },
    {
        name: 'Bowl de la Huerta',
        description: 'Arroz con aguacate, verduras frescas y crudites de temporada.',
        price: 10.0,
        type: 'dish',
        recipe: recipe([
            { name: 'Arroz', grams: 120 },
            { name: 'Aguacate', grams: 80 },
            { name: 'Crudités de verduras', grams: 120 },
            { name: 'Rúcula', grams: 20 }
        ])
    },
    {
        name: 'Bowl del Mar del Norte',
        description: 'Arroz con salmon ahumado, mango, papaya y vegetales crujientes.',
        price: 12.5,
        type: 'dish',
        recipe: recipe([
            { name: 'Arroz', grams: 120 },
            { name: 'Salmón ahumado', grams: 70 },
            { name: 'Mango', grams: 60 },
            { name: 'Papaya', grams: 60 },
            { name: 'Crudités de verduras', grams: 80 }
        ])
    },
    {
        name: 'Benedict de la Casa',
        description: 'Pan de masa madre, huevo a baja temperatura, aguacate y salmon con holandesa ligera.',
        price: 13.9,
        type: 'dish',
        recipe: recipe([
            { name: 'Pan de masa madre', grams: 80 },
            { name: 'Huevo', grams: 120 },
            { name: 'Salmón ahumado', grams: 60 },
            { name: 'Salsa holandesa', grams: 40 },
            { name: 'Aguacate', grams: 50 }
        ])
    },
    {
        name: 'Tacos de Cochinita Pibil (3 uds)',
        description: 'Cochinita pibil en tortilla de maiz con cebolla encurtida y cilantro.',
        price: 12.0,
        type: 'dish'
    },
    {
        name: 'Curry Thai de Coco',
        description: 'Arroz con pollo al curry verde, vegetales y frutos secos.',
        price: 12.5,
        type: 'dish',
        recipe: recipe([
            { name: 'Arroz', grams: 120 },
            { name: 'Pollo', grams: 150 },
            { name: 'Curry verde', grams: 35 },
            { name: 'Leche de coco', grams: 120 },
            { name: 'Frutos secos', grams: 20 }
        ])
    },
    {
        name: 'Tagliata Burger',
        description: 'Burger ecologica con rucula, parmesano y balsamico.',
        price: 12.5,
        type: 'dish',
        recipe: recipe([
            { name: 'Pan de masa madre', grams: 80 },
            { name: 'Rúcula', grams: 25 },
            { name: 'Parmesano', grams: 25 },
            { name: 'Vinagre balsámico', grams: 10 }
        ])
    },
    {
        name: 'Huevos Trufados',
        description: 'Huevos a baja temperatura con holandesa, pate y aceite de trufa.',
        price: 11.0,
        type: 'dish',
        recipe: recipe([
            { name: 'Huevo', grams: 120 },
            { name: 'Salsa holandesa', grams: 40 },
            { name: 'Paté de trufa', grams: 20 },
            { name: 'Aceite de trufa', grams: 5 },
            { name: 'Pan de masa madre', grams: 60 }
        ])
    },
    {
        name: 'Puding de Chia Tropical',
        description: 'Semillas de chia con leche de almendra, mango, papaya y coco.',
        price: 5.5,
        type: 'dessert',
        recipe: recipe([
            { name: 'Semillas de chía', grams: 50 },
            { name: 'Leche de almendra', grams: 150 },
            { name: 'Mango', grams: 60 },
            { name: 'Papaya', grams: 60 },
            { name: 'Coco rallado', grams: 15 },
            { name: 'Miel', grams: 15 }
        ])
    },
    {
        name: 'Batido Postre',
        description: 'Batido dulce para acompanarlo con postre.',
        price: 4.5,
        type: 'drink'
    },
    {
        name: 'Cafe con Leche - Postre',
        description: 'Cafe con leche pensado para postre.',
        price: 4.5,
        type: 'drink'
    },
    {
        name: 'Cafe - Postre',
        description: 'Cafe espresso para acompanamiento de postre.',
        price: 4.0,
        type: 'drink'
    },
    {
        name: 'Brutal Blanc 2024 (copa)',
        description: 'Vino blanco Brutal Blanc servido por copa.',
        price: 4.5,
        type: 'drink'
    },
    {
        name: 'Pares Balta Blanc de Pacs 2024 (copa)',
        description: 'Vino blanco Pares Balta Blanc de Pacs servido por copa.',
        price: 4.2,
        type: 'drink'
    },
    {
        name: 'Brutal 2022 (copa)',
        description: 'Vino tinto Brutal 2022 servido por copa.',
        price: 4.5,
        type: 'drink'
    },
    {
        name: 'Mas Petit 2021 Pares Balta (copa)',
        description: 'Vino tinto Mas Petit 2021 Pares Balta servido por copa.',
        price: 4.5,
        type: 'drink'
    },
    {
        name: 'Pares Balta Brut (copa)',
        description: 'Cava ecologico Pares Balta Brut servido por copa.',
        price: 5.0,
        type: 'drink'
    },
    {
        name: 'Brutal Blanc 2024 (botella)',
        description: 'Blend de xarello y macabeo.',
        price: 18.0,
        type: 'drink'
    },
    {
        name: 'Pares Balta Blanc de Pacs 2024 (botella)',
        description: '46% Parellada, 34% Macabeo, 20% Xarello.',
        price: 17.0,
        type: 'drink'
    },
    {
        name: 'Brutal 2022 (botella)',
        description: 'Tempranillo, cabernet sauvignon y garnacha.',
        price: 20.0,
        type: 'drink'
    },
    {
        name: 'Mas Petit 2021 Pares Balta (botella)',
        description: 'Cabernet sauvignon y garnacha.',
        price: 19.0,
        type: 'drink'
    },
    {
        name: 'Pares Balta Brut (botella)',
        description: 'Macabeo, xarello y parellada.',
        price: 21.0,
        type: 'drink'
    },
    {
        name: 'Cafe Solo',
        description: 'Cafe espresso solo.',
        price: 1.5,
        type: 'drink'
    },
    {
        name: 'Cafe con Leche',
        description: 'Cafe con leche.',
        price: 2.0,
        type: 'drink'
    },
    {
        name: 'Cortado',
        description: 'Cafe cortado.',
        price: 1.8,
        type: 'drink'
    },
    {
        name: 'Te e Infusiones',
        description: 'Variedad de tes e infusiones.',
        price: 2.25,
        type: 'drink'
    }
];

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

    const ingredientDocuments = await Ingredient.find().lean();
    const ingredientIndex = new Map();

    ingredientDocuments.forEach((ingredient) => {
        ingredientIndex.set(ingredient.name, ingredient);
        ingredientIndex.set(normalizeKey(ingredient.name), ingredient);
    });

    const findIngredient = (name) => {
        const direct = ingredientIndex.get(name);
        if (direct) return direct;
        const normalized = ingredientIndex.get(normalizeKey(name));
        if (normalized) return normalized;
        throw new Error(`Ingredient not found: ${name}`);
    };

    const resolveRecipe = (items) =>
        items.map(({ name, grams }) => {
            const ingredientDoc = findIngredient(name);
            const conversion = ingredientDoc.conversionFactorToGrams ?? 1;
            const quantityInGrams = grams !== undefined ? grams : conversion;
            return {
                ingredient: ingredientDoc._id,
                quantityInGrams
            };
        });

    const dishesPayload = dishes.map((dish) => {
        const rawRecipe =
            dish.recipe && dish.recipe.length
                ? dish.recipe
                : dish.type === 'drink'
                    ? [{ name: dish.name, grams: undefined }]
                    : [];

        return {
            ...dish,
            recipe: resolveRecipe(rawRecipe),
            isActive: dish.isActive ?? true
        };
    });

    const operations = dishesPayload.map((dish) => ({
        updateOne: {
            filter: { name: dish.name },
            update: { $set: dish },
            upsert: true
        }
    }));

    const result = await Dish.bulkWrite(operations);
    console.log('Menu seed completed', result);
    process.exit(0);
};

seed().catch((error) => {
    console.error('Menu seed failed', error);
    process.exit(1);
});
