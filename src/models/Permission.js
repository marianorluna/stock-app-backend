import mongoose from 'mongoose';

//modelo de permisos para control de acceso granular
const permissionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true
        },
        resource: {
            type: String,
            required: true //ej: 'ingredients', 'recipes', 'dashboard'
        },
        action: {
            type: String,
            required: true,
            enum: ['read', 'create', 'update', 'delete', 'manage']
        },
        description: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

const Permission = mongoose.model('Permission', permissionSchema);
export default Permission;

