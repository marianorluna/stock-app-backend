import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../src/models/Role.js';
import Permission from '../src/models/Permission.js';
import connectDatabase from '../src/config/database.js';

dotenv.config();

//definición de todos los permisos del sistema
const permissions = [
    //Dashboard
    { name: 'dashboard:read', resource: 'dashboard', action: 'read', description: 'Ver dashboard' },

    //Inventory
    { name: 'inventory:read', resource: 'inventory', action: 'read', description: 'Ver inventario' },

    //Ingredients
    { name: 'ingredients:read', resource: 'ingredients', action: 'read', description: 'Ver ingredientes' },
    { name: 'ingredients:create', resource: 'ingredients', action: 'create', description: 'Crear ingredientes' },
    { name: 'ingredients:update', resource: 'ingredients', action: 'update', description: 'Actualizar ingredientes' },
    { name: 'ingredients:delete', resource: 'ingredients', action: 'delete', description: 'Eliminar ingredientes' },

    //Recipes
    { name: 'recipes:read', resource: 'recipes', action: 'read', description: 'Ver recetas' },
    { name: 'recipes:create', resource: 'recipes', action: 'create', description: 'Crear recetas' },
    { name: 'recipes:update', resource: 'recipes', action: 'update', description: 'Actualizar recetas' },
    { name: 'recipes:delete', resource: 'recipes', action: 'delete', description: 'Eliminar recetas' },

    //Suppliers
    { name: 'suppliers:read', resource: 'suppliers', action: 'read', description: 'Ver proveedores' },
    { name: 'suppliers:create', resource: 'suppliers', action: 'create', description: 'Crear proveedores' },
    { name: 'suppliers:update', resource: 'suppliers', action: 'update', description: 'Actualizar proveedores' },
    { name: 'suppliers:delete', resource: 'suppliers', action: 'delete', description: 'Eliminar proveedores' },

    //Manual Entry
    { name: 'manual:read', resource: 'manual', action: 'read', description: 'Ver entradas manuales' },
    { name: 'manual:create', resource: 'manual', action: 'create', description: 'Crear entradas manuales' },

    //Users & Roles
    { name: 'users:read', resource: 'users', action: 'read', description: 'Ver usuarios' },
    { name: 'users:create', resource: 'users', action: 'create', description: 'Crear usuarios' },
    { name: 'users:update', resource: 'users', action: 'update', description: 'Actualizar usuarios' },
    { name: 'users:delete', resource: 'users', action: 'delete', description: 'Eliminar usuarios' },
    { name: 'roles:manage', resource: 'roles', action: 'manage', description: 'Gestionar roles' }
];

//definición de roles con sus permisos asociados
const roles = [
    {
        name: 'admin',
        description: 'Control total del sistema',
        permissions: [] //se llenará con todos los permisos
    },
    {
        name: 'manager',
        description: 'Dueño con control de acceso y gestión',
        permissions: [
            'dashboard:read',
            'inventory:read',
            'ingredients:read', 'ingredients:create', 'ingredients:update', 'ingredients:delete',
            'recipes:read', 'recipes:create', 'recipes:update', 'recipes:delete',
            'suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete',
            'manual:read', 'manual:create',
            'users:read', 'users:create', 'users:update'
        ]
    },
    {
        name: 'operator',
        description: 'Empleado que registra mermas y ciertos módulos',
        permissions: [
            'inventory:read',
            'ingredients:read',
            'recipes:read',
            'suppliers:read',
            'manual:read', 'manual:create'
        ]
    },
    {
        name: 'guest',
        description: 'Visitante de solo lectura',
        permissions: [
            'inventory:read',
            'ingredients:read',
            'recipes:read',
            'suppliers:read'
        ]
    }
];

//función principal para poblar la base de datos con roles y permisos
async function seed() {
    try {
        const NODE_ENV = process.env.NODE_ENV ?? 'development';
        const getDatabaseUri = () => {
            if (NODE_ENV === 'production') {
                return process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI;
            }
            return process.env.MONGODB_URI;
        };
        const MONGODB_URI = getDatabaseUri();

        await connectDatabase(MONGODB_URI);

        //crear permisos
        const createdPermissions = await Promise.all(
            permissions.map(perm =>
                Permission.findOneAndUpdate(
                    { name: perm.name },
                    perm,
                    { upsert: true, new: true }
                )
            )
        );

        console.log(`✅ Created ${createdPermissions.length} permissions`);

        //obtener todos los permisos para admin
        const allPermissionIds = createdPermissions.map(p => p._id);

        //crear roles
        for (const roleData of roles) {
            let permissionIds = [];

            if (roleData.name === 'admin') {
                //admin tiene todos los permisos
                permissionIds = allPermissionIds;
            } else {
                //buscar IDs de permisos por nombre
                permissionIds = createdPermissions
                    .filter(p => roleData.permissions.includes(p.name))
                    .map(p => p._id);
            }

            await Role.findOneAndUpdate(
                { name: roleData.name },
                {
                    ...roleData,
                    permissions: permissionIds
                },
                { upsert: true, new: true }
            );

            console.log(`✅ Created/Updated role: ${roleData.name}`);
        }

        console.log('🎉 Seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding error:', error);
        process.exit(1);
    }
}

seed();

