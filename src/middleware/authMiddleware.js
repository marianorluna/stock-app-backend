import { verifyIdToken } from '../config/firebase.js';
import User from '../models/User.js';
import Permission from '../models/Permission.js'; //importar Permission para que Mongoose lo registre
import logger from '../config/logger.js';

//verifica si la autenticación está deshabilitada (modo desarrollo)
const isAuthDisabled = () => process.env.AUTH_DISABLED === 'true';

//middleware de autenticación que verifica el token de Firebase y carga el usuario
export const authenticate = async (req, res, next) => {
  if (isAuthDisabled()) {
    req.user = req.user ?? {
      firebaseUid: 'dev-user',
      role: 'admin',
      email: 'dev@example.com'
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    //verificar token con Firebase
    const decodedToken = await verifyIdToken(idToken);

    //buscar usuario en BD
    const user = await User.findOne({
      firebaseUid: decodedToken.uid,
      isActive: true
    }).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    //actualizar último login
    user.lastLogin = new Date();
    await user.save();

    //adjuntar información del usuario al request
    //convertir permisos a objetos planos para facilitar la comparación
    const permissions = user.role.permissions.map(perm => ({
      name: perm.name,
      resource: perm.resource,
      action: perm.action
    }));

    req.user = {
      id: user._id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: user.name,
      role: user.role.name,
      roleId: user.role._id,
      permissions: permissions
    };

    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

//middleware de autorización por roles
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (isAuthDisabled()) {
      return next();
    }

    // Si el primer argumento es un array, usarlo directamente; si no, usar todos los argumentos
    const roles = Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles;

    if (!req.user) {
      logger.warn('Authorization failed: No user in request', { allowedRoles: roles });
      return res.status(401).json({
        message: 'Unauthorized: User not authenticated'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        allowedRoles: roles
      });
      return res.status(403).json({
        message: 'Forbidden: Insufficient permissions'
      });
    }
    next();
  };
};

//middleware de autorización por permisos específicos
export const hasPermission = (resource, action) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    //si es usuario de desarrollo (cuando AUTH_DISABLED=true y no hay usuario real)
    //solo permitir si es admin de desarrollo
    if (isAuthDisabled() && req.user.firebaseUid === 'dev-user') {
      //usuario de desarrollo, permitir todo
      return next();
    }

    //admin tiene todos los permisos
    if (req.user.role === 'admin') {
      return next();
    }

    //verificar que el usuario tenga permisos cargados
    if (!req.user.permissions || !Array.isArray(req.user.permissions)) {
      logger.warn('User permissions not loaded', { userId: req.user.id, role: req.user.role });
      return res.status(403).json({
        message: 'Forbidden: Permissions not loaded'
      });
    }

    //verificar permisos específicos (comparar como strings para evitar problemas de tipos)
    const hasAccess = req.user.permissions.some(
      permission =>
        String(permission.resource) === String(resource) &&
        String(permission.action) === String(action)
    );

    if (!hasAccess) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        role: req.user.role,
        required: `${resource}:${action}`,
        userPermissions: req.user.permissions.map(p => `${p.resource}:${p.action}`)
      });
      return res.status(403).json({
        message: `Forbidden: No ${action} permission on ${resource}. Your role: ${req.user.role}`
      });
    }

    next();
  };
};
