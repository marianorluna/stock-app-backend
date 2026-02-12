import mongoose from 'mongoose';

//modelo de usuario actualizado para usar Firebase Auth
const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

//índice compuesto para búsquedas rápidas
userSchema.index({ firebaseUid: 1, isActive: 1 });

const User = mongoose.model('User', userSchema);

export default User;

