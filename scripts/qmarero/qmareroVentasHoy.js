/**
 * Script para obtener las ventas (tickets PAID) del día actual desde Qamarero
 * y guardarlas en un JSON.
 *
 * Requiere en .env: Q_API_URL, Q_BEARER, Q_API_BODY
 * Uso: npm run qmarero:ventas
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
 * Devuelve el inicio y fin del día actual en UTC (según fecha local del sistema).
 */
function getStartEndOfDayUTC(fechaOpcional) {
    const now = fechaOpcional ? new Date(fechaOpcional) : new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const from = new Date(Date.UTC(y, m, d, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, d, 23, 59, 59));
    return { from, to };
}

/**
 * Obtiene todos los tickets PAID del día (pagina automáticamente).
 */
async function obtenerTicketsDeFecha(fechaOpcional) {
    const { from, to } = getStartEndOfDayUTC(fechaOpcional);
    const tickets = [];
    let page = 1;
    const MAXP = 60;

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
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    console.log('Obteniendo ventas de Qamarero para el día', dateStr, '...');

    let output;
    try {
        const tickets = await obtenerTicketsDeFecha();
        output = {
            fecha: dateStr,
            generadoEn: new Date().toISOString(),
            error: null,
            totalTickets: tickets.length,
            tickets,
        };
        console.log('Tickets PAID:', tickets.length);
    } catch (err) {
        console.error('Error:', err.message);
        output = {
            fecha: dateStr,
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
    const outFile = path.join(outDir, `qmarero-ventas-${dateStr}.json`);
    await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf8');

    console.log('Guardado:', outFile);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});