import mongoose from 'mongoose';

const processedInvoiceSchema = new mongoose.Schema(
    {
        fileName: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        bucketName: {
            type: String,
            required: true
        },
        processedAt: {
            type: Date,
            default: Date.now
        },
        jsonPath: {
            type: String,
            required: true
        },
        invoiceData: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        status: {
            type: String,
            enum: ['success', 'failed', 'processing'],
            default: 'success'
        },
        error: {
            type: String
        },
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

// Índice compuesto para búsquedas rápidas
processedInvoiceSchema.index({ bucketName: 1, fileName: 1 });
processedInvoiceSchema.index({ processedAt: -1 });

const ProcessedInvoice = mongoose.model('ProcessedInvoice', processedInvoiceSchema);

export default ProcessedInvoice;
