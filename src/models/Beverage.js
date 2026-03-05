import mongoose from 'mongoose';

// Mapeo de elemento SKU (2 letras) a categoryName
// Basado en SKU_ELEMENTS.md - sección Bebidas (B)
const mapSkuElementToCategoryName = (skuElement) => {
    if (!skuElement || skuElement.length !== 2) return null;

    const elementMap = {
        'BD': 'Bebidas',
        'CV': 'Copa de vino',
        'BP': 'Bebida premium',
        'BT': 'Botella'
    };

    return elementMap[skuElement.toUpperCase()] || null;
};

const beverageSchema = new mongoose.Schema(
    {
        sku: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        // ID del producto en Qamarero (UUID) para matching con tickets TPV
        productId: {
            type: String,
            trim: true,
            default: ''
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
            enum: ['u'],
            default: 'u'
        },
        stockUnitName: {
            type: String,
            trim: true,
            default: 'unidad'
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
        }
    },
    {
        timestamps: true
    }
);

// Pre-validate hook: calcular categoryName desde SKU antes de validar
beverageSchema.pre('validate', function (next) {
    if (!this.categoryName || this.isModified('sku')) {
        if (this.sku && this.sku.length >= 3) {
            // Extraer elemento: posiciones 1-2 del SKU (después del tipo 'B')
            const skuElement = this.sku.substring(1, 3);
            const categoryName = mapSkuElementToCategoryName(skuElement);
            if (categoryName) {
                this.categoryName = categoryName;
            }
        }
    }
    next();
});

// Pre-save hook: calcular categoryName desde SKU antes de guardar
beverageSchema.pre('save', function (next) {
    if (!this.categoryName || this.isModified('sku')) {
        if (!this.sku || this.sku.length < 3) {
            return next(new Error('SKU inválido: debe tener al menos 3 caracteres para extraer el elemento'));
        }

        // Extraer elemento: posiciones 1-2 del SKU (después del tipo 'B')
        const skuElement = this.sku.substring(1, 3);
        const categoryName = mapSkuElementToCategoryName(skuElement);

        if (!categoryName) {
            return next(new Error(`Elemento SKU '${skuElement}' no reconocido. SKU: ${this.sku}`));
        }

        this.categoryName = categoryName;
    }
    next();
});

beverageSchema.set('toJSON', { virtuals: true });
beverageSchema.set('toObject', { virtuals: true });

const Beverage = mongoose.model('Beverage', beverageSchema);

export default Beverage;
