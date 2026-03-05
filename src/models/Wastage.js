import mongoose from 'mongoose';

const wastageItemSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: false,
      default: undefined
    },
    beverage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Beverage',
      required: false,
      default: undefined
    },
    quantityInGrams: {
      type: Number,
      required: false,
      default: undefined
    },
    quantityInUnits: {
      type: Number,
      required: false,
      default: undefined
    },
    reason: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

const wastageSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now
    },
    items: {
      type: [wastageItemSchema],
      required: true
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedAt: {
      type: Date
    },
    isDeleted: {
      type: Boolean,
      default: false
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

const Wastage = mongoose.model('Wastage', wastageSchema);

export default Wastage;

