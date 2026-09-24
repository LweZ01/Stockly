import { api } from './api.js';
import { buildQuery } from './query.js';

export const inventoryService = {
  registerMovement: (data) => api.post('/inventory/movements', data),
  getStock: (productId) => api.get(`/inventory/products/${productId}/stock`),
  getHistory: (productId) =>
    api.get(`/inventory/products/${productId}/movements`),

  getRecentMovements: (limit = 10) =>
    api.get(`/inventory/movements/recent${buildQuery({ limit })}`),
};
