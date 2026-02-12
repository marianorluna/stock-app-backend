import mongoose from 'mongoose';

//modelo de roles con permisos asociados
const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            enum: ['admin', 'manager', 'operator', 'guest']
        },
        description: {
            type: String,
            required: true
        },
        permissions: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Permission'
        }]
    },
    {
        timestamps: true
    }
);

const Role = mongoose.model('Role', roleSchema);
export default Role;

