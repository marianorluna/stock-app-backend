/**
 * Script para migrar usuarios existentes y asignarles roles.
 * Asigna el rol 'guest' a usuarios que no tienen rol o tienen un rol inválido.
 * Uso: node scripts/seedUsers.js
 * Nota: Asegúrate de haber ejecutado seed:roles antes de este script
 */

import dotenv from 'dotenv';
import connectDatabase from '../../src/config/database.js';
import User from '../../src/models/User.js';
import Role from '../../src/models/Role.js';

dotenv.config();

// Función principal para migrar usuarios
async function seedUsers() {
  try {
    const NODE_ENV = process.env.NODE_ENV ?? 'development';
    const getDatabaseUri = () => {
      if (NODE_ENV === 'production') {
        return process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI;
      }
      return process.env.MONGODB_URI;
    };
    const MONGODB_URI = getDatabaseUri();

    if (!MONGODB_URI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    await connectDatabase(MONGODB_URI);

    // Obtener el rol guest
    const guestRole = await Role.findOne({ name: 'guest' });
    if (!guestRole) {
      throw new Error('Guest role not found. Please run: npm run seed:roles');
    }

    console.log('🔍 Searching for users without roles...');

    // Buscar todos los usuarios
    const users = await User.find({}).lean();
    console.log(`📊 Found ${users.length} total users`);

    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Verificar cada usuario
    for (const user of users) {
      try {
        let needsUpdate = false;
        let updateReason = '';

        // Verificar si el usuario no tiene rol
        if (!user.role) {
          needsUpdate = true;
          updateReason = 'no role assigned';
        } else {
          // Verificar si el rol referenciado existe
          const roleExists = await Role.findById(user.role);
          if (!roleExists) {
            needsUpdate = true;
            updateReason = 'referenced role does not exist';
          }
        }

        if (needsUpdate) {
          await User.findByIdAndUpdate(
            user._id,
            { role: guestRole._id },
            { new: true }
          );
          updatedCount++;
          console.log(`✅ Updated user ${user.email || user.firebaseUid}: ${updateReason}`);
        } else {
          skippedCount++;
        }
      } catch (error) {
        errors.push({
          userId: user._id,
          email: user.email,
          error: error.message
        });
        console.error(`❌ Error updating user ${user.email || user.firebaseUid}:`, error.message);
      }
    }

    // Resumen
    console.log('\n📈 Migration Summary:');
    console.log(`   Total users: ${users.length}`);
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      errors.forEach(err => {
        console.log(`   - ${err.email || err.userId}: ${err.error}`);
      });
    }

    if (updatedCount > 0) {
      console.log('\n🎉 User migration completed successfully!');
    } else {
      console.log('\n✨ All users already have valid roles assigned.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

seedUsers();
