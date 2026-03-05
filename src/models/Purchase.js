import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema(
  {
    // Para ingredientes
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: function() {
        return !this.beverage && !this.unmatchedItem; // Requerido si no hay beverage ni unmatchedItem
      }
    },
    quantityInGrams: {
      type: Number,
      required: function() {
        return !!this.ingredient; // Requerido si hay ingredient
      }
    },
    // Para bebidas
    beverage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Beverage',
      required: function() {
        return !this.ingredient && !this.unmatchedItem; // Requerido si no hay ingredient ni unmatchedItem
      }
    },
    quantityInUnits: {
      type: Number,
      required: function() {
        return !!this.beverage; // Requerido si hay beverage
      }
    },
    // Para items sin match (sin ingrediente ni bebida existente)
    unmatchedItem: {
      type: new mongoose.Schema({
        codigoArticulo: { type: String, required: true },
        descripcionArticulo: { type: String, default: null },
        cantidadFactura: { type: Number, default: 0 },
        cantidadTotalGramos: { type: Number, default: 0 },
        unidadFactura: { type: String, default: null },
        razon: { type: String, default: 'No se encontró ningún ingrediente ni bebida con este código' }
      }, { _id: false }),
      required: function() {
        return !this.ingredient && !this.beverage; // Requerido si no hay ingredient ni beverage
      }
    },
    // Precio unitario (común para todos)
    unitPrice: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    supplier: {
      type: String,
      trim: true
    },
    invoiceNumber: {
      type: String,
      trim: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    items: {
      type: [purchaseItemSchema],
      required: true
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

const Purchase = mongoose.model('Purchase', purchaseSchema);

export default Purchase;

