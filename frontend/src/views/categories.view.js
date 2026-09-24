import { categoriesService } from '../services/categories.service.js';
import { isAdmin } from '../services/auth-store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { escapeHtml } from '../ui/escape.js';
import { getInitials } from '../ui/format.js';
import { getErrorMessage } from '../ui/errors.js';

export async function initCategoriesView(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Categorías</h2>
        <p class="view-subtitle">Organizá el catálogo en categorías.</p>
      </div>
    </div>

    <p id="category-success" class="auth-success hidden"></p>
    <p id="category-error" class="auth-error hidden"></p>

    <div class="categories-grid" id="categories-grid"></div>

    <dialog id="category-drawer" class="drawer">
      <form id="category-form" class="drawer-form">
        <div class="drawer-body">
          <h3 id="category-drawer-title">Nueva categoría</h3>

          <div class="form-group">
            <label for="category-name">Nombre</label>
            <input id="category-name" name="name" type="text" required maxlength="100" />
          </div>

          <div class="form-group">
            <label for="category-description">Descripción</label>
            <textarea id="category-description" name="description" rows="3"></textarea>
            <small class="form-help">Opcional.</small>
          </div>

          <p id="category-form-error" class="auth-error hidden"></p>
        </div>

        <div class="drawer-actions">
          <button type="button" id="category-drawer-cancel" class="btn btn-ghost">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  `;

  const drawer = root.querySelector('#category-drawer');
  const form = root.querySelector('#category-form');
  const drawerTitle = root.querySelector('#category-drawer-title');
  const formError = root.querySelector('#category-form-error');
  const successMsg = root.querySelector('#category-success');
  const errorMsg = root.querySelector('#category-error');
  const grid = root.querySelector('#categories-grid');
  const cancelBtn = root.querySelector('#category-drawer-cancel');

  let currentCategories = [];

  // --- Helpers ---
  function showSuccess(message) {
    errorMsg.classList.add('hidden');
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  function showError(message) {
    successMsg.classList.add('hidden');
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
    setTimeout(() => errorMsg.classList.add('hidden'), 4000);
  }

  // --- Render de tarjeta ---
  function renderCategoryCard(category) {
    const initials = getInitials(category.name);
    const description = category.description
      ? escapeHtml(category.description)
      : '<span class="category-card-empty">Sin descripción</span>';

    const actions = isAdmin()
      ? `
        <div class="category-card-actions">
          <button type="button" class="btn-icon" data-action="edit" data-id="${escapeHtml(category.id)}" title="Editar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
            </svg>
          </button>
          <button type="button" class="btn-icon btn-icon--danger" data-action="delete" data-id="${escapeHtml(category.id)}" title="Eliminar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      `
      : '';

    return `
      <div class="category-card">
        <div class="category-card-icon">${escapeHtml(initials)}</div>
        <h3 class="category-card-name">${escapeHtml(category.name)}</h3>
        <p class="category-card-description">${description}</p>
        ${actions}
      </div>
    `;
  }

  // --- Tarjeta de "Nueva categoría" ---
  function renderNewCard() {
    return `
      <button type="button" class="category-card category-card--new" id="new-category-card">
        <div class="category-card-icon category-card-icon--new">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
        <h3 class="category-card-name">Nueva categoría</h3>
        <p class="category-card-description">Creá una nueva categoría para organizar tus productos.</p>
      </button>
    `;
  }

  // --- Estado vacío ---
  function renderEmptyState() {
    return `
      <div class="categories-empty">
        <div class="categories-empty-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
            <circle cx="7.5" cy="7.5" r="1.25" />
          </svg>
        </div>
        <p class="categories-empty-title">Todavía no hay categorías</p>
        <p class="categories-empty-text">
          Creá tu primera categoría para empezar a organizar el catálogo.
        </p>
        ${
          isAdmin()
            ? `<button type="button" class="btn btn-primary" id="empty-new-category">
                + Nueva categoría
              </button>`
            : ''
        }
      </div>
    `;
  }

  // --- Cargar y renderizar ---
  async function loadAndRenderCategories() {
    grid.innerHTML = `
      <div class="categories-loading">
        <p class="table-empty">Cargando categorías...</p>
      </div>
    `;

    let categories;
    try {
      categories = await categoriesService.list();
    } catch {
      grid.innerHTML = `
        <div class="categories-loading">
          <p class="view-error">No se pudieron cargar las categorías.</p>
        </div>
      `;
      return;
    }

    currentCategories = categories;

    if (categories.length === 0) {
      grid.innerHTML = renderEmptyState();
      bindEmptyStateEvents();
      return;
    }

    const cards = categories.map(renderCategoryCard).join('');
    const newCard = isAdmin() ? renderNewCard() : '';

    grid.innerHTML = cards + newCard;

    bindCardEvents();
  }

  function bindCardEvents() {
    const newCard = grid.querySelector('#new-category-card');
    if (newCard) newCard.addEventListener('click', () => openDrawer());
  }

  function bindEmptyStateEvents() {
    const emptyBtn = grid.querySelector('#empty-new-category');
    if (emptyBtn) emptyBtn.addEventListener('click', () => openDrawer());
  }

  // --- Drawer ---
  function openDrawer(category = null) {
    form.reset();
    formError.classList.add('hidden');

    if (category) {
      drawerTitle.textContent = 'Editar categoría';
      form.elements.name.value = category.name;
      form.elements.description.value = category.description ?? '';
      form.dataset.editingId = category.id;
    } else {
      drawerTitle.textContent = 'Nueva categoría';
      delete form.dataset.editingId;
    }

    drawer.showModal();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    formError.classList.add('hidden');

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      description: formData.get('description') || null,
    };

    const editingId = form.dataset.editingId;

    try {
      if (editingId) {
        await categoriesService.update(editingId, data);
      } else {
        await categoriesService.create(data);
      }

      drawer.close();
      await loadAndRenderCategories();
      showSuccess(editingId ? 'Categoría actualizada.' : 'Categoría creada.');
    } catch (err) {
      formError.textContent = getErrorMessage(
        err,
        'Ocurrió un error, intentá de nuevo.',
      );
      formError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  }

  // --- Acciones de tarjeta ---
  async function handleGridClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const { id, action } = btn.dataset;

    if (action === 'edit') {
      const category = currentCategories.find((c) => c.id === id);
      if (category) openDrawer(category);
      return;
    }

    if (action === 'delete') {
      const ok = await confirmDialog(
        '¿Eliminar esta categoría? Solo es posible si no tiene productos asociados.',
      );
      if (!ok) return;

      try {
        await categoriesService.remove(id);
      } catch (err) {
        showError(
          getErrorMessage(
            err,
            'Ocurrió un error al eliminar. Verificá que no tenga productos asociados.',
          ),
        );
        return;
      }

      await loadAndRenderCategories();
      showSuccess('Categoría eliminada.');
    }
  }

  // --- Event listeners ---
  cancelBtn.addEventListener('click', () => drawer.close());
  form.addEventListener('submit', handleSubmit);
  grid.addEventListener('click', handleGridClick);

  await loadAndRenderCategories();
}
