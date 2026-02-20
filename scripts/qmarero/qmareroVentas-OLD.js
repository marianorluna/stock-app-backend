/**
 * Script para obtener las ventas (tickets PAID) del día actual desde Qamarero
 * y guardarlas en un JSON.
 *
 * Requiere en .env: Q_API_URL, Q_BEARER, Q_API_BODY
 * Uso: 
 *   npm run qmarero:ventas                    -> Fecha de hoy
 *   npm run qmarero:ventas 19-02-26           -> Día específico
 *   npm run qmarero:ventas 16-02-26 19-02-26  -> Rango de fechas
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gunzip = promisify(zlib.gunzip);

dotenv.config();

/**
 * Descomprime una respuesta si está comprimida con gzip
 */
async function decompressResponse(resp) {
    const contentEncoding = resp.headers.get('content-encoding');

    // Obtener el buffer de la respuesta
    const buffer = Buffer.from(await resp.arrayBuffer());

    // Solo intentar descomprimir si el header indica gzip explícitamente
    if (contentEncoding && contentEncoding.toLowerCase() === 'gzip') {
        try {
            const decompressed = await gunzip(buffer);
            return decompressed.toString('utf8');
        } catch (err) {
            // Si falla la descompresión, intentar como texto normal (sin advertencia)
            return buffer.toString('utf8');
        }
    }

    // Si no está comprimido, devolver como texto
    return buffer.toString('utf8');
}

/**
 * Llama a la API de Qamarero con las variables de entorno.
 */
async function llamarQamarero(inputExtra = {}) {
    const url = process.env.Q_API_URL || 'https://qamarero.stellate.sh/';
    const bearer = process.env.Q_BEARER;
    const cookie = process.env.Q_COOKIE;
    const bodyRaw = process.env.Q_API_BODY;

    if (!bearer && !cookie) throw new Error('Falta Q_BEARER o Q_COOKIE');
    if (!bodyRaw) throw new Error('Falta Q_API_BODY con el GraphQL.');

    let bodyBase;
    try {
        bodyBase = JSON.parse(bodyRaw);
    } catch (_) {
        throw new Error('Q_API_BODY no es JSON válido.');
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Node.js)',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
    };
    if (bearer) {
        headers['Authorization'] = 'JWT ' + bearer;
        headers['restaurant-token'] = bearer;
        headers['x-restaurant-token'] = bearer;
    }
    if (cookie) headers['Cookie'] = cookie;

    const body = JSON.parse(JSON.stringify(bodyBase));
    if (!body.variables) body.variables = {};
    if (!body.variables.input) body.variables.input = {};
    Object.assign(body.variables.input, inputExtra);

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'No se pudo leer el error');
        throw new Error(`HTTP ${resp.status} al llamar Qamarero: ${errorText.substring(0, 200)}`);
    }

    // Descomprimir la respuesta si es necesario
    const text = await decompressResponse(resp);

    // Parsear el JSON
    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error(`Error al parsear JSON: ${err.message}. Primeros 500 chars de respuesta: ${text.substring(0, 500)}`);
    }

    if (data?.errors?.length) {
        throw new Error('API error: ' + (data.errors[0].message || 'desconocido'));
    }

    return data;
}

/**
 * Determina el offset de zona horaria para Barcelona/Madrid (Europe/Madrid)
 * UTC+1 en invierno (CET), UTC+2 en verano (CEST)
 */
function getBarcelonaOffset(fecha) {
    const año = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth(); // 0-11

    // El horario de verano en España va aproximadamente del último domingo de marzo
    // al último domingo de octubre
    // Para simplificar, usamos: marzo-octubre = UTC+2, resto = UTC+1

    if (mes >= 2 && mes <= 9) { // Marzo (2) a Octubre (9)
        return 2; // UTC+2 (CEST - horario de verano)
    } else {
        return 1; // UTC+1 (CET - horario de invierno)
    }
}

/**
 * Parsea una fecha en formato DD-MM-YY a objeto Date
 * @param {string} fechaStr - Fecha en formato DD-MM-YY (ej: "19-02-26")
 * @returns {Date} - Objeto Date
 */
function parsearFecha(fechaStr) {
    const partes = fechaStr.split('-');
    if (partes.length !== 3) {
        throw new Error(`Formato de fecha inválido: ${fechaStr}. Use DD-MM-YY (ej: 19-02-26)`);
    }

    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1; // Los meses en JS van de 0-11
    const año = parseInt(partes[2], 10);

    // Convertir año de 2 dígitos a 4 dígitos (asumiendo 2000-2099)
    const añoCompleto = año < 50 ? 2000 + año : 1900 + año;

    if (isNaN(dia) || isNaN(mes) || isNaN(año)) {
        throw new Error(`Fecha inválida: ${fechaStr}`);
    }

    // Crear fecha directamente en UTC para evitar problemas de zona horaria
    const fecha = new Date(Date.UTC(añoCompleto, mes, dia));

    // Validar que la fecha es válida
    if (fecha.getUTCDate() !== dia || fecha.getUTCMonth() !== mes || fecha.getUTCFullYear() !== añoCompleto) {
        throw new Error(`Fecha inválida: ${fechaStr}`);
    }

    return fecha;
}

/**
 * Formatea una fecha a YYYY-MM-DD sin conversión de zona horaria
 * @param {Date} fecha - Objeto Date
 * @returns {string} - Fecha en formato YYYY-MM-DD
 */
function formatearFecha(fecha) {
    const año = fecha.getUTCFullYear();
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getUTCDate()).padStart(2, '0');
    return `${año}-${mes}-${dia}`;
}

/**
 * Devuelve el inicio y fin del día en UTC, interpretando la fecha
 * en la zona horaria de Barcelona (Europe/Madrid, UTC+1 o UTC+2).
 * 
 * Ejemplo: Si consultamos el 15 de febrero en hora local de Barcelona:
 * - Inicio: 15 de febrero 00:00:00 hora Barcelona = 14 de febrero 23:00:00 UTC (si UTC+1)
 * - Fin: 15 de febrero 23:59:59 hora Barcelona = 15 de febrero 22:59:59 UTC (si UTC+1)
 */
function getStartEndOfDayUTC(fecha) {
    const y = fecha.getUTCFullYear();
    const m = fecha.getUTCMonth();
    const d = fecha.getUTCDate();

    // Obtener el offset de Barcelona para esta fecha
    const offsetHoras = getBarcelonaOffset(fecha);

    // Inicio del día en hora local de Barcelona = inicio del día en UTC menos el offset
    // Si es 15 de febrero 00:00 hora Barcelona (UTC+1), eso es 14 de febrero 23:00 UTC
    const from = new Date(Date.UTC(y, m, d, 0 - offsetHoras, 0, 0));

    // Fin del día en hora local de Barcelona = fin del día en UTC menos el offset
    // Si es 15 de febrero 23:59 hora Barcelona (UTC+1), eso es 15 de febrero 22:59 UTC
    const to = new Date(Date.UTC(y, m, d, 23 - offsetHoras, 59, 59, 999));

    return { from, to };
}

/**
 * Obtiene todos los tickets PAID de un rango de fechas (pagina automáticamente).
 */
async function obtenerTicketsDeRango(fechaInicio, fechaFin) {
    const tickets = [];
    let page = 1;
    const MAXP = 60;

    // Obtener rango UTC para la fecha de inicio (en hora local de Barcelona)
    const { from } = getStartEndOfDayUTC(fechaInicio);
    // Obtener rango UTC para la fecha de fin (en hora local de Barcelona)
    const { to } = getStartEndOfDayUTC(fechaFin);

    while (page <= MAXP) {
        const data = await llamarQamarero({
            page,
            fromDate: from.toISOString(),
            toDate: to.toISOString(),
            status: ['PAID'],
        });

        const bills = data?.data?.bills;
        const objs = bills?.objects;

        if (Array.isArray(objs)) {
            objs.forEach((t) => tickets.push(t));
        }

        const hasNext = Boolean(bills?.hasNext);
        const pages = Number(bills?.pages || 0);
        if (!hasNext || (pages && page >= pages)) break;
        page++;
    }

    return tickets;
}

async function main() {
    // Leer argumentos de la línea de comandos
    const args = process.argv.slice(2);

    let fechaInicio, fechaFin, dateStr, nombreArchivo;

    if (args.length === 0) {
        // Sin argumentos: usar fecha de hoy
        fechaInicio = new Date();
        fechaFin = new Date();
        dateStr = formatearFecha(fechaInicio);
        nombreArchivo = `qmarero-ventas-${dateStr}.json`;
        console.log('Obteniendo ventas de Qamarero para el día', dateStr, '...');
    } else if (args.length === 1) {
        // Un argumento: día específico
        try {
            fechaInicio = parsearFecha(args[0]);
            fechaFin = fechaInicio;
            dateStr = formatearFecha(fechaInicio);
            nombreArchivo = `qmarero-ventas-${dateStr}.json`;
            console.log('Obteniendo ventas de Qamarero para el día', args[0], `(${dateStr})...`);
        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        }
    } else if (args.length === 2) {
        // Dos argumentos: rango de fechas
        try {
            fechaInicio = parsearFecha(args[0]);
            fechaFin = parsearFecha(args[1]);

            // Validar que fechaInicio <= fechaFin
            if (fechaInicio > fechaFin) {
                throw new Error(`La fecha de inicio (${args[0]}) debe ser anterior o igual a la fecha de fin (${args[1]})`);
            }

            const fechaInicioStr = formatearFecha(fechaInicio);
            const fechaFinStr = formatearFecha(fechaFin);
            nombreArchivo = `qmarero-ventas-${fechaInicioStr}_${fechaFinStr}.json`;
            console.log(`Obteniendo ventas de Qamarero desde ${args[0]} (${fechaInicioStr}) hasta ${args[1]} (${fechaFinStr})...`);
        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        }
    } else {
        console.error('Demasiados argumentos. Uso:');
        console.error('  npm run qmarero:ventas                    -> Fecha de hoy');
        console.error('  npm run qmarero:ventas 19-02-26           -> Día específico');
        console.error('  npm run qmarero:ventas 16-02-26 19-02-26  -> Rango de fechas');
        process.exit(1);
    }

    let output;
    try {
        const tickets = await obtenerTicketsDeRango(fechaInicio, fechaFin);
        const fechaInicioStr = formatearFecha(fechaInicio);
        const fechaFinStr = formatearFecha(fechaFin);

        output = {
            fecha: args.length === 0 ? dateStr : (args.length === 1 ? dateStr : `${fechaInicioStr} a ${fechaFinStr}`),
            fechaInicio: fechaInicioStr,
            fechaFin: fechaFinStr,
            generadoEn: new Date().toISOString(),
            error: null,
            totalTickets: tickets.length,
            tickets,
        };
        console.log('Tickets PAID:', tickets.length);
    } catch (err) {
        console.error('Error:', err.message);
        const fechaInicioStr = formatearFecha(fechaInicio);
        const fechaFinStr = formatearFecha(fechaFin);

        output = {
            fecha: args.length === 0 ? dateStr : (args.length === 1 ? dateStr : `${fechaInicioStr} a ${fechaFinStr}`),
            fechaInicio: fechaInicioStr,
            fechaFin: fechaFinStr,
            generadoEn: new Date().toISOString(),
            error: {
                mensaje: err.message,
                tipo: err.name || 'Error',
            },
            totalTickets: 0,
            tickets: [],
        };
        console.log('Se ha generado el JSON con el error para comprobar que el archivo se crea correctamente.');
    }

    const outDir = path.join(__dirname);
    const outFile = path.join(outDir, nombreArchivo);
    await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf8');

    console.log('Guardado:', outFile);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});