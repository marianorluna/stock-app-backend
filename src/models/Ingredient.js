import mongoose from 'mongoose';

const resolveProductUnit = (category, purchaseUnit) => {
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
    if ((category ?? 'ingredient') === 'ingredient') {
      return 'g';
    }
    return 'unidad';
  }

  return purchaseUnit.trim();
};

const ensureProductUnitField = (category, purchaseUnit, productUnit) => {
  if (productUnit && productUnit.trim().length > 0) {
    return productUnit.trim();
  }
  return resolveProductUnit(category, purchaseUnit);
};

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
      trim: true
    },
    stock: {
      type: Number,
      required: true,
      default: 0
    },
    purchaseUnit: {
      type: String,
      required: true,
      trim: true
    },
    productUnit: {
      type: String,
      required: true,
      trim: true,
      default() {
        const category = this && this.category ? this.category : 'ingredient';
        const purchaseUnit = this && this.purchaseUnit ? this.purchaseUnit : undefined;
        return resolveProductUnit(category, purchaseUnit);
      }
    },
    conversionFactorToGrams: {
      type: Number,
      required: true,
      default: 1
    },
    reorderPoint: {
      type: Number,
      required: true,
      default: 0
    },
    category: {
      type: String,
      enum: ['ingredient', 'beverage', 'coffee'],
      default: 'ingredient'
    },
    allergens: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

ingredientSchema.virtual('stockDisplay').get(function stockDisplay() {
  if (this.category === 'ingredient') {
    return {
      amount: this.stock,
      unit: 'g',
      reorderPoint: this.reorderPoint,
      conversionFactorToGrams: this.conversionFactorToGrams
    };
  }

  return {
    amount: this.stock,
    unit: this.productUnit ?? 'unidad',
    reorderPoint: this.reorderPoint,
    conversionFactorToGrams: 1
  };
});

ingredientSchema.pre('validate', function ensureProductUnit(next) {
  if (!this.productUnit || this.productUnit.trim().length === 0) {
    const category = this && this.category ? this.category : 'ingredient';
    const purchaseUnit = this && this.purchaseUnit ? this.purchaseUnit : undefined;
    this.productUnit = resolveProductUnit(category, purchaseUnit);
  }
  next();
});

const transformWithProductUnit = (_, ret) => {
  const category = ret?.category ?? 'ingredient';
  const purchaseUnit = ret?.purchaseUnit;
  ret.productUnit = ensureProductUnitField(category, purchaseUnit, ret.productUnit);
  return ret;
};

ingredientSchema.set('toJSON', { virtuals: true, transform: transformWithProductUnit });
ingredientSchema.set('toObject', { virtuals: true, transform: transformWithProductUnit });

const Ingredient = mongoose.model('Ingredient', ingredientSchema);

export default Ingredient;

