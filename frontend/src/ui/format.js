const LOCALE = 'es-VE';
const CURRENCY = 'USD';

const priceFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
});

function toDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getInitials(name) {
  if (!name) return '?';
  return String(name)
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

export function formatPrice(value) {
  const number = Number(value);
  if (value === null || value === undefined || Number.isNaN(number)) {
    return '—';
  }
  return priceFormatter.format(number);
}

/** 24/09/2026 */
export function formatDate(iso) {
  const date = toDate(iso);
  return date ? date.toLocaleDateString(LOCALE) : '—';
}

/** 24 sept, 14:30 (historial de inventario) */
export function formatDateTime(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  return date.toLocaleString(LOCALE, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 24/9/26, 14:30 (sesión actual en Mi Perfil) */
export function formatDateTimeShort(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  return date.toLocaleString(LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** "Ahora mismo", "Hace 5 min", "Ayer", etc. (activity feed) */
export function formatRelativeTime(iso) {
  const date = toDate(iso);
  if (!date) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Ahora mismo';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' });
}
