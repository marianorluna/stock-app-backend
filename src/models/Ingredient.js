import mongoose from 'mongoose';

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    stock: {
      type: Number,
      required: true,
      default: 0
    },
    stockUnit: {
      type: String,
      required: true,
      trim: true,
      enum: ['u', 'g', 'ml'],
      default: 'g'
    },
    purchaseUnit: {
      type: String,
      required: true,
      trim: true
    },
    conversionFactor: {
      type: Number,
      required: true,
      default: 1
    },
    conversionUnit: {
      type: String,
      required: true,
      trim: true,
      enum: ['u', 'g', 'ml'],
      default: 'g'
    },
    reorderPoint: {
      type: Number,
      required: true,
      default: 0
    },
    category: {
      type: String,
      enum: ['bebida', 'cafe', 'condimentos', 'frutas', 'cereales', 'lacteos', 'otros', 'proteinas', 'vegetales'],
      required: true
    },
    allergens: {
      type: [String],
      default: []
    },
    codeArticlePurchase: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Virtual para compatibilidad con código existente que usa productUnit
ingredientSchema.virtual('productUnit').get(function productUnit() {
  return this.stockUnit;
});

// Virtual para compatibilidad con código existente que usa conversionFactorToGrams
// El conversionFactorToGrams representa cuántas unidades de stockUnit equivalen a 1 unidad de purchaseUnit en gramos
// Para simplificar, usamos conversionFactor directamente cuando conversionUnit es 'g'
// Para otros casos, asumimos que conversionFactor ya representa la conversión correcta
ingredientSchema.virtual('conversionFactorToGrams').get(function conversionFactorToGrams() {
  // Si conversionUnit es 'g', el factor ya está en gramos
  if (this.conversionUnit === 'g') {
    return this.conversionFactor;
  }
  
  // Si conversionUnit es 'u' o 'ml', el factor representa unidades/ml por unidad de compra
  // Para mantener compatibilidad, devolvemos el factor directamente
  // El código que lo use deberá considerar la unidad correcta
  return this.conversionFactor;
});

ingredientSchema.virtual('stockDisplay').get(function stockDisplay() {
  // Para categorías que tradicionalmente usaban 'ingredient', mostrar en gramos
  const isBulkCategory = ['condimentos', 'frutas', 'cereales', 'lacteos', 'otros', 'proteinas', 'vegetales'].includes(this.category);
  
  if (isBulkCategory && this.stockUnit === 'g') {
    return {
      amount: this.stock,
      unit: 'g',
      reorderPoint: this.reorderPoint,
      conversionFactorToGrams: this.conversionFactorToGrams
    };
  }

  return {
    amount: this.stock,
    unit: this.stockUnit ?? 'u',
    reorderPoint: this.reorderPoint,
    conversionFactorToGrams: this.conversionFactorToGrams
  };
});

// Transform para mantener compatibilidad con código existente
const transformForCompatibility = (doc, ret) => {
  // Agregar campos virtuales para compatibilidad
  ret.productUnit = ret.stockUnit || ret.productUnit;
  
  // Calcular conversionFactorToGrams si no está disponible como virtual
  if (!ret.conversionFactorToGrams && ret.conversionFactor !== undefined) {
    if (ret.conversionUnit === 'g') {
      ret.conversionFactorToGrams = ret.conversionFactor;
    } else {
      ret.conversionFactorToGrams = ret.conversionFactor;
    }
  }
  
  return ret;
};

ingredientSchema.set('toJSON', { virtuals: true, transform: transformForCompatibility });
ingredientSchema.set('toObject', { virtuals: true, transform: transformForCompatibility });

const Ingredient = mongoose.model('Ingredient', ingredientSchema);

export default Ingredient;

