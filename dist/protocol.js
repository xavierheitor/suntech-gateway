"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFrame = normalizeFrame;
exports.parsePacket = parsePacket;
exports.parseFrame = parseFrame;
exports.buildCommand = buildCommand;
exports.terminatorFromEnv = terminatorFromEnv;
function normalizeFrame(raw) {
    return raw.replace(/^[\r\n]+|[\r\n]+$/g, '').trim();
}
function emptyParsed(protocol = 'UNKNOWN', esn = null) {
    return {
        protocol,
        esn,
        latitude: null,
        longitude: null,
        speed: null,
        heading: null,
        battery: null,
        satellites: null,
        timestamp: null,
    };
}
function looksLikeDate(value) {
    return /^\d{8}$/.test(value);
}
function looksLikeTime(value) {
    return /^\d{1,2}:\d{2}:\d{2}$/.test(value);
}
function looksLikeCoordinate(value) {
    if (!value || !value.includes('.'))
        return false;
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) <= 180;
}
/**
 * Interpreta apenas campos principais de STT/ALT.
 * Campos ausentes ou não reconhecidos retornam null.
 */
function parsePacket(rawMessage) {
    const fields = normalizeFrame(rawMessage).split(';');
    const protocol = (fields[0] || 'UNKNOWN').toUpperCase();
    const esn = fields[1] || null;
    const parsed = emptyParsed(protocol, esn);
    if (protocol !== 'STT' && protocol !== 'ALT') {
        return parsed;
    }
    let dateIdx = -1;
    for (let i = 2; i < fields.length - 1; i += 1) {
        if (looksLikeDate(fields[i]) && looksLikeTime(fields[i + 1])) {
            dateIdx = i;
            break;
        }
    }
    if (dateIdx >= 0) {
        parsed.timestamp = `${fields[dateIdx]} ${fields[dateIdx + 1]}`;
    }
    // Após data/hora: pula cell/MCC/etc. até achar o par lat;lon
    let i = dateIdx >= 0 ? dateIdx + 2 : 6;
    while (i < fields.length - 1) {
        if (looksLikeCoordinate(fields[i]) && looksLikeCoordinate(fields[i + 1])) {
            const latitude = Number(fields[i]);
            const longitude = Number(fields[i + 1]);
            if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
                parsed.latitude = latitude;
                parsed.longitude = longitude;
                const speed = Number(fields[i + 2]);
                parsed.speed = Number.isFinite(speed) ? speed : null;
                const heading = Number(fields[i + 3]);
                parsed.heading = Number.isFinite(heading) ? heading : null;
                const satellites = Number(fields[i + 4]);
                parsed.satellites = Number.isFinite(satellites) ? satellites : null;
                break;
            }
        }
        i += 1;
    }
    // Bateria: costuma aparecer no fim como float ~2.0–5.5 V (backup)
    for (let j = fields.length - 1; j >= 0; j -= 1) {
        const value = fields[j];
        if (!value?.includes('.'))
            continue;
        const n = Number(value);
        if (Number.isFinite(n) && n >= 2 && n <= 5.5) {
            parsed.battery = n;
            break;
        }
    }
    // Fallback: tensão principal (~6–30 V) ou campo legado no índice 14
    if (parsed.battery == null) {
        for (let j = fields.length - 1; j >= 0; j -= 1) {
            const value = fields[j];
            if (!value?.includes('.'))
                continue;
            const n = Number(value);
            if (Number.isFinite(n) && n > 5.5 && n <= 30) {
                parsed.battery = n;
                break;
            }
        }
    }
    if (parsed.battery == null && fields[14]) {
        const n = Number(fields[14]);
        if (Number.isFinite(n) && n > 0 && n < 50)
            parsed.battery = n;
    }
    return parsed;
}
function parseFrame(raw) {
    const normalized = normalizeFrame(raw);
    const fields = normalized.split(';');
    const first = fields[0]?.toUpperCase() || 'UNKNOWN';
    // Formatos observados no manual:
    // STT;ID;...
    // ALT;ID;...
    // RES;ID;...
    // RES;STT;ID;... (resposta ao StatusReq)
    // RPR;ID;...
    let deviceId;
    if (first === 'RES' && fields[1]?.toUpperCase() === 'STT') {
        deviceId = fields[2];
    }
    else if (['STT', 'ALT', 'UEX', 'RES', 'RPR', 'CMD', 'PRG'].includes(first)) {
        deviceId = fields[1];
    }
    return { kind: first, deviceId, fields };
}
function buildCommand(deviceId, command) {
    const cleaned = command.trim();
    if (!cleaned)
        throw new Error('Comando vazio.');
    if (cleaned.includes('{id}')) {
        return cleaned.replaceAll('{id}', deviceId);
    }
    if (cleaned.startsWith('CMD;') || cleaned.startsWith('PRG;')) {
        return cleaned;
    }
    // Permite enviar apenas "03;01" e gera CMD;ID;03;01
    return `CMD;${deviceId};${cleaned}`;
}
function terminatorFromEnv(value) {
    switch ((value || 'CRLF').toUpperCase()) {
        case 'NONE': return '';
        case 'LF': return '\n';
        case 'CR': return '\r';
        default: return '\r\n';
    }
}
