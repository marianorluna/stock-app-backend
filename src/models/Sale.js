import mongoose from 'mongoose';

const saleLineSchema = new mongoose.Schema(
  {
    dish: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dish',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    }
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ['manual', 'pos', 'test'],
      default: 'manual'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    lines: {
      type: [saleLineSchema],
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

const Sale = mongoose.model('Sale', saleSchema);

export default Sale;

