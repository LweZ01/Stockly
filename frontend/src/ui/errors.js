import { ApiError } from '../services/api.js';

export function getErrorMessage(err, fallback = 'Ocurrió un error') {
  if (err instanceof ApiError) {
    const msg = err.body?.message;
    if (Array.isArray(msg)) return msg.join(' · ');
    if (typeof msg === 'string' && msg.length > 0) return msg;
    return fallback;
  }
  return 'No se pudo conectar con el servidor';
}
