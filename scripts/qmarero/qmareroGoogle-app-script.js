// 1️⃣ Qué hace este script
// Usa las mismas Script Properties que ya tienes:
// Q_API_URL, Q_BEARER, Q_COOKIE, Q_API_BODY.
// Llama a Qamarero → trae los tickets PAID del día.
// Saca de cada ticket sus líneas de producto (platos).
// Las escribe en una hoja llamada Platos_dia:
// | Fecha | Ticket | Hora | Mesa | Artículo | Cantidad | Importe |
// Si luego quieres solo un ticket concreto, abajo te añado una función para filtrarlo por número.
// 2️⃣ Código completo para el nuevo proyecto
// Copia TODO esto en el editor de Apps Script de ese nuevo Spreadsheet:

/********************
 *  ETAMA – Detalle de platos vendidos (Qamarero)
 *  Proyecto simple: solo líneas de ticket, sin colores ni semanas
 ********************/

const TZ = 'Europe/Madrid';

/**
 * Llama a la API de Qamarero usando las Script Properties
 * y devolviendo el objeto JSON completo.
 */
function llamarQamarero(inputExtra) {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('Q_API_URL') || 'https://qamarero.stellate.sh/';
    const bearer = props.getProperty('Q_BEARER');
    const cookie = props.getProperty('Q_COOKIE');
    const bodyRaw = props.getProperty('Q_API_BODY');

    if (!bearer && !cookie) throw new Error('Falta Q_BEARER o Q_COOKIE');
    if (!bodyRaw) throw new Error('Falta Q_API_BODY con el GraphQL.');

    let bodyBase;
    try { bodyBase = JSON.parse(bodyRaw); }
    catch (_) { throw new Error('Q_API_BODY no es JSON válido.'); }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (AppsScript)',
        'Content-Type': 'application/json'
    };
    if (bearer) {
        headers['Authorization'] = 'JWT ' + bearer;
        headers['restaurant-token'] = bearer;
        headers['x-restaurant-token'] = bearer;
    }
    if (cookie) headers['Cookie'] = cookie;

    // Mezclamos el input extra (page, fromDate, toDate, etc.)
    const body = JSON.parse(JSON.stringify(bodyBase));
    if (!body.variables) body.variables = {};
    if (!body.variables.input) body.variables.input = {};
    Object.assign(body.variables.input, inputExtra || {});

    const resp = UrlFetchApp.fetch(url, {
        method: 'post',
        headers,
        payload: JSON.stringify(body),
        muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
        throw new Error('HTTP ' + resp.getResponseCode() + ' al llamar Qamarero.');
    }

    const data = JSON.parse(resp.getContentText());
    if (data?.errors?.length) {
        throw new Error('API error: ' + (data.errors[0].message || 'desconocido'));
    }

    return data;
}

/**
 * Devuelve todos los tickets PAID de una fecha concreta.
 * Si no pasas fecha → hoy.
 *
 * fechaOpcional: objeto Date en TZ Europe/Madrid (opcional)
 */
function obtenerTicketsDeFecha(fechaOpcional) {
    const now = fechaOpcional ? new Date(fechaOpcional) : new Date();

    const y = Number(Utilities.formatDate(now, TZ, 'yyyy'));
    const m = Number(Utilities.formatDate(now, TZ, 'MM'));
    const d = Number(Utilities.formatDate(now, TZ, 'dd'));

    const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const to = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

    const tickets = [];
    let page = 1;
    const MAXP = 60;

    while (page <= MAXP) {
        const data = llamarQamarero({
            page,
            fromDate: from.toISOString(),
            toDate: to.toISOString(),
            status: ['PAID']
        });

        const bills = data?.data?.bills;
        const objs = bills?.objects;

        if (Array.isArray(objs)) {
            objs.forEach(t => tickets.push(t));
        }

        const hasNext = Boolean(bills?.hasNext);
        const pages = Number(bills?.pages || 0);
        if (!hasNext || (pages && page >= pages)) break;
        page++;
    }

    return tickets;
}

/**
 * Solo para inspeccionar la estructura de Qamarero.
 * Ejecuta esto una vez y mira el JSON en el registro.
 */
function debugVerUnTicket() {
    const tickets = obtenerTicketsDeFecha();
    if (!tickets.length) {
        Logger.log('No hay tickets PAID en esta fecha.');
        return;
    }
    Logger.log(JSON.stringify(tickets[0], null, 2));
}

/**
 * Exporta TODOS los PLATOS vendidos hoy a una hoja "Platos_dia".
 * Una fila por línea de ticket.
 */
function exportarPlatosVendidosHoy() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('Platos_dia');
    if (!sh) {
        sh = ss.insertSheet('Platos_dia');
    } else {
        sh.clearContents();
    }

    const tickets = obtenerTicketsDeFecha();
    if (!tickets.length) {
        sh.getRange(1, 1).setValue('No hay tickets PAID hoy.');
        return;
    }

    const headers = ['Fecha', 'Ticket', 'Hora', 'Mesa', 'Artículo', 'Cantidad', 'Importe'];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);

    const rows = [];

    tickets.forEach(ticket => {
        // 🔴 Ajusta estos campos según lo que veas en debugVerUnTicket()
        const ticketNumber = ticket.number || ticket.id || '';
        const closedAtIso = ticket.closedAt || ticket.paidAt || ticket.createdAt || '';
        const mesa = ticket.table?.name || ticket.tableName || '';

        let fecha = '';
        let hora = '';
        if (closedAtIso) {
            const dt = new Date(closedAtIso);
            fecha = Utilities.formatDate(dt, TZ, 'dd/MM/yyyy');
            hora = Utilities.formatDate(dt, TZ, 'HH:mm');
        }

        // 👇 Muy importante: aquí van las líneas de producto.
        // Busca en el JSON: puede ser ticket.lines, ticket.items, ticket.details.lines, etc.
        const lineas = ticket.lines ||
            ticket.items ||
            ticket.details?.lines ||
            ticket.products ||
            [];

        lineas.forEach(line => {
            // 🔴 También ajustar estos nombres con el JSON real
            const articulo = line.product?.name || line.name || line.description || '';
            const cantidad = Number(line.quantity ?? line.qty ?? 1);
            const importe = Number(line.total ?? line.totalAmount ?? line.price ?? 0);

            rows.push([
                fecha,
                ticketNumber,
                hora,
                mesa,
                articulo,
                cantidad,
                importe
            ]);
        });
    });

    if (!rows.length) {
        sh.getRange(1, 1).setValue('No se encontraron líneas de productos en los tickets.');
        return;
    }

    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('#,##0.00 €');

    Logger.log(`Exportadas ${rows.length} líneas de platos en la hoja "Platos_dia".`);
}

/**
 * Versión para un solo ticket concreto (por número).
 * Llama igual a Qamarero, pero sólo deja las líneas del ticket buscado.
 */
function exportarPlatosDeTicket(numeroBuscado) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('Platos_ticket');
    if (!sh) {
        sh = ss.insertSheet('Platos_ticket');
    } else {
        sh.clearContents();
    }

    const tickets = obtenerTicketsDeFecha(); // hoy; si quieres otra fecha, pásala a mano
    const ticket = tickets.find(t => String(t.number) === String(numeroBuscado));

    if (!ticket) {
        sh.getRange(1, 1).setValue('No se encontró ese ticket hoy.');
        return;
    }

    const headers = ['Fecha', 'Ticket', 'Hora', 'Mesa', 'Artículo', 'Cantidad', 'Importe'];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);

    const closedAtIso = ticket.closedAt || ticket.paidAt || ticket.createdAt || '';
    const mesa = ticket.table?.name || ticket.tableName || '';
    let fecha = '';
    let hora = '';
    if (closedAtIso) {
        const dt = new Date(closedAtIso);
        fecha = Utilities.formatDate(dt, TZ, 'dd/MM/yyyy');
        hora = Utilities.formatDate(dt, TZ, 'HH:mm');
    }

    const lineas = ticket.lines ||
        ticket.items ||
        ticket.details?.lines ||
        ticket.products ||
        [];

    const rows = lineas.map(line => {
        const articulo = line.product?.name || line.name || line.description || '';
        const cantidad = Number(line.quantity ?? line.qty ?? 1);
        const importe = Number(line.total ?? line.totalAmount ?? line.price ?? 0);

        return [fecha, ticket.number, hora, mesa, articulo, cantidad, importe];
    });

    if (!rows.length) {
        sh.getRange(1, 1).setValue('El ticket no tiene líneas de productos.');
        return;
    }

    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('#,##0.00 €');

    Logger.log(`Exportadas ${rows.length} líneas del ticket ${numeroBuscado} en "Platos_ticket".`);
}

// 3️⃣ Cómo lo usas, paso a paso
// Configura las Script Properties igual que en el otro proyecto
// (Q_API_URL, Q_BEARER, Q_COOKIE, Q_API_BODY).
// En Apps Script ejecuta primero:
// debugVerUnTicket()
// Mira en el Registro cómo se llaman EXACTAMENTE:
// El array de líneas (ejemplo: lines, items…)
// El nombre del producto (product.name, name, etc.)
// La cantidad (quantity, qty…)
// El importe (total, totalAmount…)
// Si hace falta, ajustas en el código esos sitios que ya te he marcado en rojo (lineas = …, articulo, cantidad, importe).
// Para sacar todos los platos de hoy:
// ejecuta exportarPlatosVendidosHoy() → te rellena la hoja Platos_dia.
// Para sacar solo un ticket concreto (p.ej. ticket 47):
// Desde la consola de Apps Script llama:
// exportarPlatosDeTicket(47);
// Te crea la hoja Platos_ticket solo con ese ticket.