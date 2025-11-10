import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const roles = ['owner', 'staff'];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: roles,
      default: 'owner'
    },
    name: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

userSchema.methods.setPassword = async function setPassword(password) {
  const saltRounds = 10;
  this.passwordHash = await bcrypt.hash(password, saltRounds);
};

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

export default User;
export { roles as USER_ROLES };

