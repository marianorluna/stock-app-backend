import mongoose from 'mongoose';

// Mapeo de elemento SKU (2 letras) a categoryName (con mayúscula inicial)
// Basado en SKU_ELEMENTS.md - sección Ingredientes (I)
const mapSkuElementToCategoryName = (skuElement) => {
  if (!skuElement || skuElement.length !== 2) return null;

  const elementMap = {
    'LV': 'Lacteos',
    'GR': 'Cereales',
    'CO': 'Condimentos',
    'VG': 'Vegetales',
    'FR': 'Frutas',
    'PR': 'Proteinas',
    'GS': 'Gases',
    'LI': 'Liquidos',
    'CF': 'Cafe',
    'AC': 'Aceites',
    'FS': 'Frutos secos',
    'DL': 'Dulces'
  };

  return elementMap[skuElement.toUpperCase()] || null;
};

const ingredientSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    categoryName: {
      type: String,
      trim: true,
      required: true
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
      enum: ['g'],
      default: 'g'
    },
    stockUnitName: {
      type: String,
      trim: true,
      default: 'gramo'
    },
    factorMermaNat: {
      type: Number,
      required: true,
      default: 0
    },
    reorderPoint: {
      type: Number,
      required: true,
      default: 0
    },
    allergens: {
      type: [String],
      default: []
    },
    codeArticlePurchase: {
      type: String,
      trim: true,
      default: ''
    },
    pesoUnitarioGramos: {
      type: Number,
      required: true,
      default: 0
    },
    stockMerma: {
      type: Number,
      required: true,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Pre-validate hook: calcular categoryName desde SKU antes de validar
ingredientSchema.pre('validate', function (next) {
  if (!this.categoryName || this.isModified('sku')) {
    if (this.sku && this.sku.length >= 3) {
      const skuElement = this.sku.substring(1, 3);
      const categoryName = mapSkuElementToCategoryName(skuElement);
      if (categoryName) {
        this.categoryName = categoryName;
      }
    }
  }
  next();
});

// Pre-save hook: calcular categoryName desde SKU y stockMerma antes de guardar
ingredientSchema.pre('save', function (next) {
  // Calcular categoryName desde SKU si es necesario
  // Si categoryName ya existe pero no coincide con el SKU, recalcularlo
  if (!this.categoryName || this.isModified('sku')) {
    if (!this.sku || this.sku.length < 3) {
      return next(new Error('SKU inválido: debe tener al menos 3 caracteres para extraer el elemento'));
    }

    const skuElement = this.sku.substring(1, 3);
    const categoryName = mapSkuElementToCategoryName(skuElement);

    if (!categoryName) {
      return next(new Error(`Elemento SKU '${skuElement}' no reconocido. SKU: ${this.sku}`));
    }

    this.categoryName = categoryName;
  } else {
    // Si categoryName existe, validar que coincida con el SKU
    if (this.sku && this.sku.length >= 3) {
      const skuElement = this.sku.substring(1, 3);
      const expectedCategoryName = mapSkuElementToCategoryName(skuElement);
      if (expectedCategoryName && this.categoryName !== expectedCategoryName) {
        // Si no coincide, usar el calculado desde el SKU (el SKU es la fuente de verdad)
        this.categoryName = expectedCategoryName;
      }
    }
  }

  // Calcular stockMerma: si factorMermaNat es 0, stockMerma = stock; si no, stockMerma = stock - (stock * factorMermaNat)
  if (this.isModified('stock') || this.isModified('factorMermaNat') || this.isNew) {
    if (this.factorMermaNat === 0 || this.factorMermaNat == null) {
      this.stockMerma = this.stock;
    } else {
      this.stockMerma = this.stock - (this.stock * this.factorMermaNat);
    }
  }

  next();
});

ingredientSchema.set('toJSON', { virtuals: true });
ingredientSchema.set('toObject', { virtuals: true });

const Ingredient = mongoose.model('Ingredient', ingredientSchema);

export default Ingredient;
