import mongoose from 'mongoose';

const configSchema = new mongoose.Schema(
    {
        value_qm_bearer: {
            type: String,
            trim: true
        },
        description: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

const Config = mongoose.model('Config', configSchema);

export default Config;
