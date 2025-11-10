import mongoose from 'mongoose';

const wastagePresetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true
    },
    quantityInGrams: {
      type: Number,
      required: true,
      min: 1
    },
    reason: {
      type: String,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

const WastagePreset = mongoose.model('WastagePreset', wastagePresetSchema);

export default WastagePreset;


