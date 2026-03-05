import Joi from 'joi';

export const manualSaleSchema = Joi.object({
  timestamp: Joi.date().optional(),
  lines: Joi.array()
    .items(
      Joi.object({
        dish: Joi.string().hex().length(24).required(),
        quantity: Joi.number().integer().min(1).required()
      })
    )
    .min(1)
    .required()
});

export const manualPurchaseSchema = Joi.object({
  supplier: Joi.string().trim().optional(),
  invoiceNumber: Joi.string().trim().optional(),
  timestamp: Joi.date().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        ingredient: Joi.string().hex().length(24).required(),
        quantityInGrams: Joi.number().positive().required(),
        unitPrice: Joi.number().positive().required()
      })
    )
    .min(1)
    .required()
});

export const manualWastageSchema = Joi.object({
  timestamp: Joi.date().optional(),
  items: Joi.array()
    .items(
      Joi.alternatives()
        .try(
          // Merma de ingrediente
          Joi.object({
            ingredient: Joi.string().hex().length(24).required(),
            quantityInGrams: Joi.number().positive().required(),
            reason: Joi.string().trim().optional()
          }),
          // Merma de bebida
          Joi.object({
            beverage: Joi.string().hex().length(24).required(),
            quantityInUnits: Joi.number().positive().required(),
            reason: Joi.string().trim().optional()
          })
        )
        .required()
    )
    .min(1)
    .required()
});

export const manualWastagePresetSchema = Joi.object({
  name: Joi.string().trim().required(),
  ingredient: Joi.string().hex().length(24).required(),
  quantityInGrams: Joi.number().positive().required(),
  reason: Joi.string().allow('').trim().optional()
});

