import { api } from './api.js';

export const inventoryService = {
  registerMovement: (data) => api.post('/inventory/movements', data),
  getStock: (productId) => api.get(`/inventory/products/${productId}/stock`),
  getHistory: (productId) =>
    api.get(`/inventory/products/${productId}/movements`),

  async getRecentMovements(limit = 10) {
    return api.get(`/inventory/movements/recent?limit=${limit}`);
  },
};
