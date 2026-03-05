import mongoose from 'mongoose';

/**
 * Modelo para registrar las importaciones diarias de tickets desde Qamarero TPV.
 * Se usa para evitar duplicados: solo se permite una importación por día.
 */
const qmareroImportSchema = new mongoose.Schema(
    {
        // Fecha de la importación en formato YYYY-MM-DD (ej: "2026-02-28")
        date: {
            type: String,
            required: true,
            trim: true,
            match: [/^\d{4}-\d{2}-\d{2}$/, 'El formato de fecha debe ser YYYY-MM-DD']
        },
        // Timestamp de cuándo se realizó la importación
        importedAt: {
            type: Date,
            default: Date.now
        },
        // Usuario que realizó la importación
        importedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        // Total de tickets importados
        totalTickets: {
            type: Number,
            default: 0
        },
        // Datos crudos extraídos de los tickets (products con quantities)
        extractedItems: {
            type: [{
                productId: String,
                productName: String,
                categoryId: String,
                categoryName: String,
                quantity: Number
            }],
            default: []
        },
        // Estado de la importación
        status: {
            type: String,
            enum: ['success', 'error', 'partial'],
            default: 'success'
        },
        // Mensaje de error si status = 'error'
        errorMessage: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

// Índice único por fecha para evitar duplicados en el mismo día
qmareroImportSchema.index({ date: 1 }, { unique: true });

const QmareroImport = mongoose.model('QmareroImport', qmareroImportSchema);

export default QmareroImport;
