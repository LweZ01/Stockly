import { api } from './api.js';

function buildQuery(filters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, value);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const productsService = {
  list: (filters) => api.get(`/products${buildQuery(filters)}`),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.patch(`/products/${id}`, data),
  remove: (id) => api.delete(`/products/${id}`),
};
