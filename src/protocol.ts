export function normalizeFrame(raw: string): string {
  return raw.replace(/^[\r\n]+|[\r\n]+$/g, '').trim();
}

export function parseFrame(raw: string): { kind: string; deviceId?: string; fields: string[] } {
  const normalized = normalizeFrame(raw);
  const fields = normalized.split(';');
  const first = fields[0]?.toUpperCase() || 'UNKNOWN';

  // Formatos observados no manual:
  // STT;ID;...
  // ALT;ID;...
  // RES;ID;...
  // RES;STT;ID;... (resposta ao StatusReq)
  // RPR;ID;...
  let deviceId: string | undefined;
  if (first === 'RES' && fields[1]?.toUpperCase() === 'STT') {
    deviceId = fields[2];
  } else if (['STT', 'ALT', 'UEX', 'RES', 'RPR', 'CMD', 'PRG'].includes(first)) {
    deviceId = fields[1];
  }

  return { kind: first, deviceId, fields };
}

export function buildCommand(deviceId: string, command: string): string {
  const cleaned = command.trim();
  if (!cleaned) throw new Error('Comando vazio.');

  if (cleaned.includes('{id}')) {
    return cleaned.replaceAll('{id}', deviceId);
  }

  if (cleaned.startsWith('CMD;') || cleaned.startsWith('PRG;')) {
    return cleaned;
  }

  // Permite enviar apenas "03;01" e gera CMD;ID;03;01
  return `CMD;${deviceId};${cleaned}`;
}

export function terminatorFromEnv(value?: string): string {
  switch ((value || 'CRLF').toUpperCase()) {
    case 'NONE': return '';
    case 'LF': return '\n';
    case 'CR': return '\r';
    default: return '\r\n';
  }
}
