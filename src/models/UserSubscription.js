import mongoose from 'mongoose';

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscription: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    keys: {
      p256dh: String,
      auth: String,
    },
  },
  {
    timestamps: true,
  }
);

userSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export default mongoose.model('UserSubscription', userSubscriptionSchema);
