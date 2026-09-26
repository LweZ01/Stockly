import { productsService } from '../services/products.service.js';
import { categoriesService } from '../services/categories.service.js';
import { usersService } from '../services/users.service.js';
import { inventoryService } from '../services/inventory.service.js';
import { getUser, isAdmin } from '../services/auth-store.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../ui/escape.js';
import { getInitials, formatRelativeTime } from '../ui/format.js';

export async function initDashboardView(root) {
  const user = getUser();

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Dashboard</h2>
        <p class="view-subtitle">Bienvenido de nuevo, ${escapeHtml(user.name)}.</p>
      </div>
    </div>

    <div class="dashboard-cards">
      <button type="button" class="dashboard-card" data-route="products">
        <div class="dashboard-card-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
            <path d="M3 8l9 5 9-5" />
            <path d="M12 13v8" />
          </svg>
        </div>
        <span class="dashboard-card-value" id="products-count">...</span>
        <span class="dashboard-card-label">Productos activos</span>
      </button>

      <button type="button" class="dashboard-card" data-route="categories">
        <div class="dashboard-card-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
            <circle cx="7.5" cy="7.5" r="1.25" />
          </svg>
        </div>
        <span class="dashboard-card-value" id="categories-count">...</span>
        <span class="dashboard-card-label">Categorías</span>
      </button>

      ${
        isAdmin()
          ? `<button type="button" class="dashboard-card" data-route="users">
              <div class="dashboard-card-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span class="dashboard-card-value" id="users-count">...</span>
              <span class="dashboard-card-label">Usuarios</span>
            </button>`
          : ''
      }

      <div class="dashboard-card dashboard-card--static">
        <div class="dashboard-card-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
          </svg>
        </div>
        <span class="dashboard-card-value badge-value">
          <span class="badge ${user.role === 'admin' ? 'badge--admin' : 'badge--user'}">
            ${user.role === 'admin' ? 'Administrador' : 'Usuario'}
          </span>
        </span>
        <span class="dashboard-card-label">Tu rol</span>
      </div>
    </div>

    ${
      isAdmin()
        ? `
      <section class="dashboard-section">
        <div class="dashboard-section-header">
          <h3>Actividad reciente</h3>
          <p>Últimos movimientos de inventario en el sistema.</p>
        </div>
        <div class="dashboard-activity" id="recent-activity">
          <p class="table-empty">Cargando actividad...</p>
        </div>
      </section>
    `
        : ''
    }
  `;

  const productsCountEl = root.querySelector('#products-count');
  const categoriesCountEl = root.querySelector('#categories-count');
  const usersCountEl = root.querySelector('#users-count');
  const activityEl = root.querySelector('#recent-activity');

  root.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  // --- Helpers ---
  function getMovementBadge(type) {
    const map = {
      entry: { label: 'Entrada', class: 'badge--active' },
      exit: { label: 'Salida', class: 'badge--inactive' },
      adjustment: { label: 'Ajuste', class: 'badge--admin' },
    };
    return map[type] ?? { label: type, class: 'badge--user' };
  }

  function renderActivityItem(movement) {
    const userName = movement.user?.name ?? 'Sistema';
    const initials = getInitials(userName);
    const badge = getMovementBadge(movement.type);

    const sign =
      movement.type === 'entry' ? '+' : movement.type === 'exit' ? '−' : '';

    const quantityClass =
      movement.type === 'entry'
        ? 'is-positive'
        : movement.type === 'exit'
          ? 'is-negative'
          : 'is-neutral';

    const quantityText = `${sign}${movement.quantity}`;

    return `
      <div class="activity-item">
        <div class="activity-avatar">${escapeHtml(initials)}</div>
        <div class="activity-content">
          <div class="activity-line">
            <strong>${escapeHtml(userName)}</strong>
            <span class="activity-action">registró una ${badge.label.toLowerCase()}</span>
          </div>
          <div class="activity-meta">
            <span class="activity-product">${escapeHtml(movement.product?.name ?? 'Producto eliminado')}</span>
            <span class="activity-quantity ${quantityClass}">
              ${quantityText}
            </span>
          </div>
        </div>
        <div class="activity-time">${formatRelativeTime(movement.createdAt)}</div>
      </div>
    `;
  }

  // --- Cargas ---
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

  async function loadActivity() {
    if (!activityEl) return;

    try {
      // getRecentMovements() ahora devuelve { data, total, page, limit }
      // en vez de un array plano (paginación agregada en el backend).
      const response = await inventoryService.getRecentMovements(5);
      const movements = response.data;

      if (!movements || movements.length === 0) {
        activityEl.innerHTML = `
    <div class="activity-empty">
      <div class="activity-empty-icon">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M7 15v3" />
          <path d="M12 10v8" />
          <path d="M17 6v12" />
        </svg>
      </div>
      <p class="activity-empty-title">Todavía no hay movimientos</p>
      <p class="activity-empty-text">
        Cuando registres entradas, salidas o ajustes de inventario, van a aparecer acá.
      </p>
      <button type="button" class="btn btn-primary" data-route="inventory">
        Ir a Inventario
      </button>
    </div>
  `;

        // Reconectar los listeners de navegación en el nuevo botón
        activityEl.querySelectorAll('[data-route]').forEach((btn) => {
          btn.addEventListener('click', () => navigate(btn.dataset.route));
        });
        return;
      }

      activityEl.innerHTML = movements.map(renderActivityItem).join('');
    } catch (err) {
      activityEl.innerHTML = `
        <p class="view-error">
          No se pudo cargar la actividad reciente.
        </p>
      `;
    }
  }

  await Promise.all([loadCounts(), loadActivity()]);
}
