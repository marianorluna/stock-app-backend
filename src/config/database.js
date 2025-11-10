import mongoose from 'mongoose';
import logger from './logger.js';

const connectDatabase = async (uri) => {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000
    });
    logger.info('Connected to MongoDB successfully 🚀');
  } catch (error) {
    logger.error('MongoDB connection error 🚨', { error });
    process.exit(1);
  }
};

export default connectDatabase;

