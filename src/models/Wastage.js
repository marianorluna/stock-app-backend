import mongoose from 'mongoose';

const wastageItemSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true
    },
    quantityInGrams: {
      type: Number,
      required: true
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

