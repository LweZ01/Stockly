import { api } from './api.js';

export const usersService = {
  list: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.patch(`/users/${id}`, data),
  changePassword: (id, data) => api.patch(`/users/${id}/password`, data),
  remove: (id) => api.delete(`/users/${id}`),
};
