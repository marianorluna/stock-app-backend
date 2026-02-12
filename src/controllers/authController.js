import asyncHandler from 'express-async-handler';
import { verifyIdToken } from '../config/firebase.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Permission from '../models/Permission.js'; //importar Permission para que Mongoose lo registre

//sincroniza usuario de Firebase con la base de datos local
export const syncUser = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    res.status(400);
    throw new Error('Token is required');
  }

  try {
    const decodedToken = await verifyIdToken(idToken);

    let user = await User.findOne({ firebaseUid: decodedToken.uid })
      .populate({
        path: 'role',
        populate: {
          path: 'permissions',
          model: 'Permission'
        }
      });

    if (!user) {
      //crear usuario si no existe (asignar rol guest por defecto)
      const guestRole = await Role.findOne({ name: 'guest' });
      if (!guestRole) {
        res.status(500);
        throw new Error('Default role not found. Please run: npm run seed:roles');
      }

      //obtener el nombre del token o usar el email como fallback
      const userName = decodedToken.name ||
        (decodedToken.email ? decodedToken.email.split('@')[0] : 'Usuario');

      user = new User({
        firebaseUid: decodedToken.uid,
        email: decodedToken.email,
        name: userName,
        role: guestRole._id,
        lastLogin: new Date()
      });
      await user.save();
      await user.populate({
        path: 'role',
        populate: {
          path: 'permissions',
          model: 'Permission'
        }
      });
    } else {
      user.lastLogin = new Date();
      await user.save();
    }

    //convertir permisos a objetos planos para facilitar la comparación
    const permissions = user.role.permissions.map(perm => ({
      name: perm.name,
      resource: perm.resource,
      action: perm.action
    }));

    res.json({
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        role: user.role.name,
        permissions: permissions
      }
    });
  } catch (error) {
    //mejorar el mensaje de error para debugging
    const errorMessage = error.message || 'Invalid token';
    console.error('Sync user error:', {
      message: errorMessage,
      code: error.code,
      stack: error.stack
    });
    res.status(401);
    throw new Error(`Authentication failed: ${errorMessage}`);
  }
});

//obtiene el perfil del usuario actual
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    })
    .select('-__v');

  res.json({
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions
    }
  });
});
