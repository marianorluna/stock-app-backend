/**
 * Script para extraer y unificar items de un archivo JSON de factura.
 * Extrae todos los items de listaItems, los unifica por codigoArticulo
 * y suma los campos: cantidadFactura, cantidadTotalGramos e importeTotal.
 * 
 * Acepta los siguientes formatos:
 *   - { listaItems: [...] }
 *   - { facturas: [{ listaItems: [...] }, ...] }
 *   - [{ listaItems: [...] }, ...]
 * 
 * Uso:
 *   node scripts/unificarItemsFactura.js <archivo.json>
 * 
 * Ejemplos:
 *   node scripts/unificarItemsFactura.js output/invoices/invoice-20251107-01.json
 *   node scripts/unificarItemsFactura.js output/invoices/facturas-combinadas.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extrae todos los items de listaItems y los unifica por codigoArticulo
 * @param {Object} data - Datos del JSON de factura
 * @returns {Array} - Array de items unificados con campos sumados
 */
function unificarItems(data) {
    // Usar un Map para agrupar items por codigoArticulo
    const itemsMap = new Map();

    // Validar que el JSON tenga la estructura esperada
    if (!data) {
        throw new Error('El JSON está vacío o no es válido');
    }

    // Obtener listaItems (puede estar directamente en data o en otro nivel)
    let listaItems = [];

    if (Array.isArray(data.listaItems)) {
        // Formato: { listaItems: [...] }
        listaItems = data.listaItems;
    } else if (Array.isArray(data.facturas)) {
        // Formato: { facturas: [{ listaItems: [...] }, ...] }
        listaItems = data.facturas.flatMap(factura => factura.listaItems || []);
    } else if (Array.isArray(data)) {
        // Si el JSON es directamente un array de facturas
        listaItems = data.flatMap(factura => factura.listaItems || []);
    } else {
        throw new Error('El JSON no tiene la estructura esperada. Debe tener un campo "listaItems", un campo "facturas" con array de facturas, o ser un array de facturas');
    }

    // Iterar sobre todos los items
    listaItems.forEach((item) => {
        // Validar que el item tenga codigoArticulo
        if (!item.codigoArticulo) {
            console.warn('⚠️  Item sin codigoArticulo, se omite:', item);
            return;
        }

        const codigoArticulo = item.codigoArticulo;

        // Si el artículo ya existe en el Map, sumar los campos
        if (itemsMap.has(codigoArticulo)) {
            const itemExistente = itemsMap.get(codigoArticulo);

            // Sumar los campos requeridos
            itemExistente.cantidadFactura = (itemExistente.cantidadFactura || 0) + (Number(item.cantidadFactura) || 0);
            itemExistente.cantidadTotalGramos = (itemExistente.cantidadTotalGramos || 0) + (Number(item.cantidadTotalGramos) || 0);
            itemExistente.importeTotal = Math.round(((itemExistente.importeTotal || 0) + (Number(item.importeTotal) || 0)) * 100) / 100;

            // Mantener otros campos del primer item encontrado (o actualizar si es necesario)
            // Se mantiene la descripción del primer item encontrado
        } else {
            // Si no existe, crear una nueva entrada
            itemsMap.set(codigoArticulo, {
                codigoArticulo: codigoArticulo,
                descripcionArticulo: item.descripcionArticulo || null,
                cantidadFactura: Number(item.cantidadFactura) || 0,
                unidadFactura: item.unidadFactura || null,
                unidadFacturaNombre: item.unidadFacturaNombre || null,
                pesoUnitarioGramos: item.pesoUnitarioGramos || null,
                cantidadTotalGramos: Number(item.cantidadTotalGramos) || 0,
                precioUnitario: item.precioUnitario || null,
                importeTotal: Math.round((Number(item.importeTotal) || 0) * 100) / 100
            });
        }
    });

    // Convertir el Map a un array y ordenar por codigoArticulo
    const items = Array.from(itemsMap.values()).sort((a, b) => {
        if (a.codigoArticulo === null) return 1;
        if (b.codigoArticulo === null) return -1;
        return a.codigoArticulo.localeCompare(b.codigoArticulo);
    });

    // Asegurar que todos los importeTotal tengan exactamente 2 decimales
    items.forEach(item => {
        item.importeTotal = Math.round(item.importeTotal * 100) / 100;
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
        console.error('❌ Error: Debes especificar el archivo JSON a procesar');
        console.error('Uso: node unificarItemsFactura.js <archivo.json>');
        process.exit(1);
    }

    const rutaArchivoEntrada = args[0];

    // Si es una ruta relativa, resolverla desde el directorio del script
    const rutaCompleta = path.isAbsolute(rutaArchivoEntrada)
        ? rutaArchivoEntrada
        : path.resolve(process.cwd(), rutaArchivoEntrada);

    // Verificar que el archivo existe
    try {
        await fs.access(rutaCompleta);
    } catch (error) {
        console.error(`❌ Error: No se encontró el archivo: ${rutaCompleta}`);
        process.exit(1);
    }

    try {
        // Leer el archivo JSON
        console.log(`📖 Leyendo archivo: ${rutaArchivoEntrada}...`);
        const contenido = await fs.readFile(rutaCompleta, 'utf8');
        const data = JSON.parse(contenido);

        // Extraer y unificar los items
        console.log('🔄 Extrayendo y unificando items por codigoArticulo...');
        const items = unificarItems(data);

        // Calcular totales
        const totalCantidadFactura = items.reduce((sum, item) => sum + (item.cantidadFactura || 0), 0);
        const totalCantidadGramos = items.reduce((sum, item) => sum + (item.cantidadTotalGramos || 0), 0);
        const totalImporte = items.reduce((sum, item) => sum + (item.importeTotal || 0), 0);

        // Crear el objeto de salida
        const output = {
            generadoEn: new Date().toISOString(),
            archivoOrigen: path.basename(rutaArchivoEntrada),
            totalItemsUnicos: items.length,
            totalCantidadFactura: Math.round(totalCantidadFactura * 100) / 100,
            totalCantidadGramos: totalCantidadGramos,
            totalImporte: Math.round(totalImporte * 100) / 100,
            items: items
        };

        // Generar nombre del archivo de salida
        const directorioOrigen = path.dirname(rutaCompleta);
        const nombreBase = path.basename(rutaArchivoEntrada, '.json');
        const nombreArchivoSalida = `${nombreBase}-unified.json`;
        const rutaArchivoSalida = path.join(directorioOrigen, nombreArchivoSalida);

        // Guardar el archivo
        await fs.writeFile(rutaArchivoSalida, JSON.stringify(output, null, 2), 'utf8');

        console.log(`✅ Extracción y unificación completada:`);
        console.log(`   - Items únicos: ${items.length}`);
        console.log(`   - Total cantidad factura: ${output.totalCantidadFactura}`);
        console.log(`   - Total cantidad gramos: ${totalCantidadGramos}`);
        console.log(`   - Total importe: ${output.totalImporte}`);
        console.log(`   - Archivo guardado: ${rutaArchivoSalida}`);

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
