export default {
  base: '/app/',
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/products': 'http://localhost:3000',
      '/categories': 'http://localhost:3000',
      '/users': 'http://localhost:3000',
      '/inventory': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../public',
  },
};
