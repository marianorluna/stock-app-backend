/**
 * Script para extraer items de un archivo JSON de ventas de Qamarero.
 * Extrae: id del product, name del product, id de la category, name de la category y quantity.
 * Agrupa los items por nombre de producto y suma las cantidades.
 * 
 * Uso:
 *   node scripts/qmarero/qm-extraerItems.js qmarero-ventas-2026-02-15_2026-02-20.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extrae todos los items de los tickets del JSON y los agrupa por nombre de producto
 * @param {Object} data - Datos del JSON de ventas
 * @returns {Array} - Array de items agrupados con productId, name, categoryId, categoryName y quantity total
 */
function extraerItems(data) {
    // Usar un Map para agrupar items por nombre de producto
    const itemsMap = new Map();

    // Validar que el JSON tenga la estructura esperada
    if (!data || !Array.isArray(data.tickets)) {
        throw new Error('El JSON no tiene la estructura esperada. Debe tener un array "tickets"');
    }

    // Iterar sobre todos los tickets
    data.tickets.forEach((ticket) => {
        // Validar que el ticket tenga orders
        if (!ticket.orders || !Array.isArray(ticket.orders)) {
            return; // Saltar tickets sin orders
        }

        // Iterar sobre todos los orders del ticket
        ticket.orders.forEach((order) => {
            // Validar que el order tenga items
            if (!order.items || !Array.isArray(order.items)) {
                return; // Saltar orders sin items
            }

            // Iterar sobre todos los items del order
            order.items.forEach((item) => {
                // Validar que el item tenga product y quantity
                if (!item.product || item.quantity === undefined || item.quantity === null) {
                    return; // Saltar items sin product o quantity
                }

                const productId = item.product.id || null;
                const productName = item.product.name || null;
                const categoryId = item.product.category?.id || null;
                const categoryName = item.product.category?.name || null;
                const quantity = Number(item.quantity) || 0;

                // Si el producto ya existe en el Map, sumar la cantidad
                if (itemsMap.has(productName)) {
                    const itemExistente = itemsMap.get(productName);
                    itemExistente.quantity += quantity;
                } else {
                    // Si no existe, crear una nueva entrada
                    itemsMap.set(productName, {
                        productId: productId,
                        productName: productName,
                        categoryId: categoryId,
                        categoryName: categoryName,
                        quantity: quantity
                    });
                }
            });
        });
    });

    // Convertir el Map a un array y ordenar por nombre de producto
    const items = Array.from(itemsMap.values()).sort((a, b) => {
        if (a.productName === null) return 1;
        if (b.productName === null) return -1;
        return a.productName.localeCompare(b.productName);
    });

    return items;
}

/**
 * Función principal
 */
async function main() {
    // Leer argumentos de la línea de comandos
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Error: Debes especificar el archivo JSON a procesar');
        console.error('Uso: node extraerItems.js <archivo.json>');
        process.exit(1);
    }

    const nombreArchivoEntrada = args[0];
    const rutaArchivoEntrada = path.join(__dirname, nombreArchivoEntrada);

    // Verificar que el archivo existe
    try {
        await fs.access(rutaArchivoEntrada);
    } catch (error) {
        console.error(`Error: No se encontró el archivo: ${rutaArchivoEntrada}`);
        process.exit(1);
    }

    try {
        // Leer el archivo JSON
        console.log(`Leyendo archivo: ${nombreArchivoEntrada}...`);
        const contenido = await fs.readFile(rutaArchivoEntrada, 'utf8');
        const data = JSON.parse(contenido);

        // Extraer y agrupar los items
        console.log('Extrayendo y agrupando items por nombre de producto...');
        const items = extraerItems(data);

        // Calcular el total de cantidad sumada
        const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

        // Crear el objeto de salida
        const output = {
            fecha: data.fecha || null,
            fechaInicio: data.fechaInicio || null,
            fechaFin: data.fechaFin || null,
            generadoEn: new Date().toISOString(),
            totalProductosUnicos: items.length,
            totalCantidad: totalQuantity,
            items: items
        };

        // Generar nombre del archivo de salida
        const nombreBase = path.basename(nombreArchivoEntrada, '.json');
        const nombreArchivoSalida = `${nombreBase}-items.json`;
        const rutaArchivoSalida = path.join(__dirname, nombreArchivoSalida);

        // Guardar el archivo
        await fs.writeFile(rutaArchivoSalida, JSON.stringify(output, null, 2), 'utf8');

        console.log(`✅ Extracción completada:`);
        console.log(`   - Productos únicos: ${items.length}`);
        console.log(`   - Total de cantidad: ${totalQuantity}`);
        console.log(`   - Archivo guardado: ${nombreArchivoSalida}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error instanceof SyntaxError) {
            console.error('   El archivo JSON no es válido');
        }
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('❌ Error inesperado:', err);
    process.exit(1);
});
