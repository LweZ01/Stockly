export function buildQuery(filters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, value);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
