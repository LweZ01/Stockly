import { api } from './api.js';
import { buildQuery } from './query.js';

export const productsService = {
  list: (filters) => api.get(`/products${buildQuery(filters)}`),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.patch(`/products/${id}`, data),
  remove: (id) => api.delete(`/products/${id}`),
};
