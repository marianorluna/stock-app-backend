import mongoose from 'mongoose';

const recipeIngredientSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true
    },
    quantityInGrams: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const dishSchema = new mongoose.Schema(
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
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    recipe: {
      type: [recipeIngredientSchema],
      default: []
    },
    price: {
      type: Number
    },
    type: {
      type: String,
      enum: ['dish', 'drink', 'dessert'],
      default: 'dish'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

const Dish = mongoose.model('Dish', dishSchema);

export default Dish;

