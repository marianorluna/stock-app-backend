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
        },
        // Horario de actualización diaria automática de stock (formato HH:MM, ej: "18:00")
        dailyUpdateSchedule: {
            type: String,
            trim: true,
            default: '18:00',
            match: [/^\d{2}:\d{2}$/, 'El formato de horario debe ser HH:MM']
        },
        // Horario de cierre de ventas del TPV (formato HH:MM, ej: "17:30")
        salesCloseTime: {
            type: String,
            trim: true,
            default: '17:30',
            match: [/^\d{2}:\d{2}$/, 'El formato de horario debe ser HH:MM']
        },
        // Listado de correos electrónicos para notificaciones
        notificationEmails: [
            {
                email: {
                    type: String,
                    trim: true,
                    lowercase: true,
                    required: true,
                    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido']
                }
            }
        ]
    },
    {
        timestamps: true
    }
);

const Config = mongoose.model('Config', configSchema);

export default Config;
