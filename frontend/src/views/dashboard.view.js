import { productsService } from '../services/products.service.js';
import { categoriesService } from '../services/categories.service.js';
import { usersService } from '../services/users.service.js';
import { getUser, isAdmin } from '../services/auth-store.js';
import { navigate } from '../router.js';

export async function initDashboardView(root) {
  const user = getUser();

  root.innerHTML = `
    <div class="view-header">
      <h2>Dashboard</h2>
    </div>

    <p>Bienvenido, ${user.name}.</p>

    <div class="dashboard-cards">
      <button type="button" class="dashboard-card" data-route="products">
        <span class="dashboard-card-value" id="products-count">...</span>
        <span class="dashboard-card-label">Productos activos</span>
      </button>

      <button type="button" class="dashboard-card" data-route="categories">
        <span class="dashboard-card-value" id="categories-count">...</span>
        <span class="dashboard-card-label">Categorías</span>
      </button>

      ${
        isAdmin()
          ? `<button type="button" class="dashboard-card" data-route="users">
              <span class="dashboard-card-value" id="users-count">...</span>
              <span class="dashboard-card-label">Usuarios</span>
            </button>`
          : ''
      }

      <div class="dashboard-card dashboard-card--static">
        <span class="dashboard-card-value">${user.role}</span>
        <span class="dashboard-card-label">Tu rol</span>
      </div>
    </div>
  `;

  const productsCountEl = root.querySelector('#products-count');
  const categoriesCountEl = root.querySelector('#categories-count');
  const usersCountEl = root.querySelector('#users-count'); // null si no es ADMIN, se chequea antes de usarlo

  root.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  async function loadCounts() {
    try {
      const [productsResponse, categories] = await Promise.all([
        productsService.list({ limit: 1 }),
        categoriesService.list(),
      ]);
      productsCountEl.textContent = productsResponse.total;
      categoriesCountEl.textContent = categories.length;
    } catch {
      productsCountEl.textContent = '—';
      categoriesCountEl.textContent = '—';
    }

    if (isAdmin() && usersCountEl) {
      try {
        const users = await usersService.list();
        usersCountEl.textContent = users.length;
      } catch {
        usersCountEl.textContent = '—';
      }
    }
  }

  await loadCounts();
}
