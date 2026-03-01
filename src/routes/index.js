import { Router } from 'express';
import authRoutes from './authRoutes.js';
import ingredientRoutes from './ingredientRoutes.js';
import beverageRoutes from './beverageRoutes.js';
import dishRoutes from './dishRoutes.js';
import manualRoutes from './manualRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import supplierRoutes from './supplierRoutes.js';
import notificationsRoutes from './notifications.js';
import invoiceSyncRoutes from './invoiceSyncRoutes.js';
import configRoutes from './configRoutes.js';
import posRoutes from './posRoutes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/ingredients', ingredientRoutes);
apiRouter.use('/beverages', beverageRoutes);
apiRouter.use('/dishes', dishRoutes);
apiRouter.use('/manual', manualRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/webhook', webhookRoutes);
apiRouter.use('/suppliers', supplierRoutes);
apiRouter.use('/notifications', notificationsRoutes);
apiRouter.use('/invoices', invoiceSyncRoutes);
apiRouter.use('/config', configRoutes);
apiRouter.use('/pos', posRoutes);

export default apiRouter;

