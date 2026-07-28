"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFrame = normalizeFrame;
exports.parseFrame = parseFrame;
exports.buildCommand = buildCommand;
exports.terminatorFromEnv = terminatorFromEnv;
function normalizeFrame(raw) {
    return raw.replace(/^[\r\n]+|[\r\n]+$/g, '').trim();
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
