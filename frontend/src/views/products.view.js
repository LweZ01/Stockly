import { productsService } from '../services/products.service.js';
import { categoriesService } from '../services/categories.service.js';
import { isAdmin } from '../services/auth-store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { escapeHtml, safeUrl } from '../ui/escape.js';
import { getInitials, formatPrice } from '../ui/format.js';
import { getErrorMessage } from '../ui/errors.js';

const PAGE_LIMIT = 10;

export async function initProductsView(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Productos</h2>
        <p class="view-subtitle">Gestioná el catálogo, precios y categorías.</p>
      </div>
      ${isAdmin() ? '<button id="new-product-btn" type="button" class="btn btn-primary">+ Nuevo producto</button>' : ''}
    </div>

    <div class="filters-bar">
      <input type="search" id="search-input" placeholder="Buscar por nombre o SKU..." />
      <select id="category-filter"></select>
      <input type="number" id="min-price-input" placeholder="Precio mín." min="0" step="0.01" />
      <input type="number" id="max-price-input" placeholder="Precio máx." min="0" step="0.01" />
    </div>

    <p id="filter-error" class="auth-error hidden"></p>

    <p id="product-success" class="auth-success hidden"></p>
    <p id="product-error" class="auth-error hidden"></p>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU</th>
            <th>Categoría</th>
            <th class="num">Precio</th>
            <th>Estado</th>
            <th class="table-actions-col">Acciones</th>
          </tr>
        </thead>
        <tbody id="products-tbody"></tbody>
      </table>
    </div>

    <div id="pagination" class="pagination"></div>

    <dialog id="product-drawer" class="drawer drawer--lg">
      <form id="product-form" class="drawer-form">
        <div class="drawer-body">
          <h3 id="product-drawer-title">Nuevo producto</h3>

          <div class="form-group">
            <label for="product-name">Nombre</label>
            <input id="product-name" name="name" type="text" required maxlength="150" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="product-sku">SKU</label>
              <input id="product-sku" name="sku" type="text" required maxlength="50" />
            </div>

            <div class="form-group">
              <label for="product-price">Precio</label>
              <input id="product-price" name="price" type="number" required min="0" step="0.01" />
            </div>
          </div>

          <div class="form-group">
            <label for="product-category">Categoría</label>
            <select id="product-category" name="categoryId"></select>
          </div>

          <div class="form-group">
            <label for="product-description">Descripción</label>
            <textarea id="product-description" name="description" rows="3"></textarea>
          </div>

          <div class="form-group">
            <label for="product-image-url">URL de imagen</label>
            <input id="product-image-url" name="imageUrl" type="text" placeholder="https://..." />
            <small class="form-help">Opcional. Podés pegar una URL pública.</small>
          </div>

          <p id="product-form-error" class="auth-error hidden"></p>
        </div>

        <div class="drawer-actions">
          <button type="button" id="product-drawer-cancel" class="btn btn-ghost">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  `;

  const drawer = root.querySelector('#product-drawer');
  const form = root.querySelector('#product-form');
  const drawerTitle = root.querySelector('#product-drawer-title');
  const formError = root.querySelector('#product-form-error');
  const successMsg = root.querySelector('#product-success');
  const errorMsg = root.querySelector('#product-error');
  const filterErrorMsg = root.querySelector('#filter-error');
  const tbody = root.querySelector('#products-tbody');
  const paginationEl = root.querySelector('#pagination');
  const newBtn = root.querySelector('#new-product-btn');
  const cancelBtn = root.querySelector('#product-drawer-cancel');

  const searchInput = root.querySelector('#search-input');
  const categoryFilterSelect = root.querySelector('#category-filter');
  const minPriceInput = root.querySelector('#min-price-input');
  const maxPriceInput = root.querySelector('#max-price-input');
  const dialogCategorySelect = root.querySelector('#product-category');

  let currentProducts = [];
  let currentPage = 1;
  let currentFilters = {
    search: '',
    categoryId: '',
    minPrice: '',
    maxPrice: '',
  };
  let filterTimeout = null;
  let loadSeq = 0;

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

  function showFilterError(message) {
    filterErrorMsg.textContent = message;
    filterErrorMsg.classList.remove('hidden');
  }

  function hideFilterError() {
    filterErrorMsg.classList.add('hidden');
  }

  // --- Categorías en los selects ---
  async function loadCategoriesIntoSelects() {
    let categories;
    try {
      categories = await categoriesService.list();
    } catch {
      return;
    }

    const optionsHtml = categories
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`,
      )
      .join('');

    categoryFilterSelect.innerHTML =
      '<option value="">Todas las categorías</option>' + optionsHtml;
    dialogCategorySelect.innerHTML =
      '<option value="">Sin categoría</option>' + optionsHtml;
  }

  // --- Render de fila ---
  function renderRow(product) {
    const imageSrc = safeUrl(product.imageUrl);
    const thumb = imageSrc
      ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.name)}" class="product-thumb" />`
      : `<span class="product-thumb-placeholder">${escapeHtml(getInitials(product.name))}</span>`;

    const categoryName = product.category?.name ?? 'Sin categoría';
    const categoryClass = product.category?.name
      ? 'badge--user'
      : 'badge--inactive';

    const actions = isAdmin()
      ? `
        <button type="button" class="btn-icon" data-action="edit" data-id="${escapeHtml(product.id)}" title="Editar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
          </svg>
        </button>
        <button type="button" class="btn-icon btn-icon--danger" data-action="delete" data-id="${escapeHtml(product.id)}" title="Eliminar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      `
      : '';

    return `
      <tr>
        <td>
          <div class="product-cell">
            ${thumb}
            <span class="product-cell-name">${escapeHtml(product.name)}</span>
          </div>
        </td>
        <td class="code">${escapeHtml(product.sku)}</td>
        <td>
          <span class="badge ${categoryClass}">${escapeHtml(categoryName)}</span>
        </td>
        <td class="num">${formatPrice(product.price)}</td>
        <td>
          <span class="badge ${product.isActive ? 'badge--active' : 'badge--inactive'}">
            ${product.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td class="table-actions-col">
          <div class="table-actions">${actions}</div>
        </td>
      </tr>
    `;
  }

  // --- Paginación ---
  function renderPagination({ total, page, limit }) {
    const totalPages = Math.ceil(total / limit) || 1;

    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }

    paginationEl.innerHTML = `
      <button type="button" id="prev-page-btn" class="btn btn-ghost" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="pagination-info">Página ${page} de ${totalPages}</span>
      <button type="button" id="next-page-btn" class="btn btn-ghost" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
    `;

    const prevBtn = paginationEl.querySelector('#prev-page-btn');
    const nextBtn = paginationEl.querySelector('#next-page-btn');

    if (prevBtn && !prevBtn.disabled) {
      prevBtn.addEventListener('click', () => {
        currentPage--;
        loadAndRenderProducts();
      });
    }

    if (nextBtn && !nextBtn.disabled) {
      nextBtn.addEventListener('click', () => {
        currentPage++;
        loadAndRenderProducts();
      });
    }
  }

  // --- Cargar productos ---
  async function loadAndRenderProducts() {
    const seq = ++loadSeq;

    tbody.innerHTML =
      '<tr><td colspan="6" class="table-empty">Cargando productos...</td></tr>';

    const filters = {
      search: currentFilters.search || undefined,
      categoryId: currentFilters.categoryId || undefined,
      minPrice: currentFilters.minPrice || undefined,
      maxPrice: currentFilters.maxPrice || undefined,
      page: currentPage,
      limit: PAGE_LIMIT,
    };

    let response;
    try {
      response = await productsService.list(filters);
    } catch {
      if (seq !== loadSeq) return; // llegó un load más nuevo
      tbody.innerHTML =
        '<tr><td colspan="6" class="view-error">No se pudieron cargar los productos.</td></tr>';
      paginationEl.innerHTML = '';
      return;
    }

    if (seq !== loadSeq) return; // llegó un load más nuevo

    currentProducts = response.data;

    if (response.data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty">
            No hay productos que coincidan con los filtros.
          </td>
        </tr>
      `;
      renderPagination(response);
      return;
    }

    tbody.innerHTML = response.data.map(renderRow).join('');
    renderPagination(response);
  }

  // --- Drawer ---
  function openDrawer(product = null) {
    form.reset();
    formError.classList.add('hidden');

    if (product) {
      drawerTitle.textContent = 'Editar producto';
      form.elements.sku.value = product.sku;
      form.elements.name.value = product.name;
      form.elements.description.value = product.description ?? '';
      form.elements.price.value = product.price;
      form.elements.categoryId.value = product.category?.id ?? '';
      form.elements.imageUrl.value = product.imageUrl ?? '';
      form.dataset.editingId = product.id;
    } else {
      drawerTitle.textContent = 'Nuevo producto';
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
      sku: formData.get('sku'),
      name: formData.get('name'),
      description: formData.get('description') || null,
      price: Number(formData.get('price')),
      categoryId: formData.get('categoryId') || null,
      imageUrl: formData.get('imageUrl') || null,
    };

    const editingId = form.dataset.editingId;

    try {
      if (editingId) {
        await productsService.update(editingId, data);
      } else {
        await productsService.create(data);
      }

      drawer.close();
      await loadAndRenderProducts();
      showSuccess(editingId ? 'Producto actualizado.' : 'Producto creado.');
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

  // --- Acciones de tabla ---
  async function handleTableClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const { id, action } = btn.dataset;

    if (action === 'edit') {
      const product = currentProducts.find((p) => p.id === id);
      if (product) openDrawer(product);
      return;
    }

    if (action === 'delete') {
      const ok = await confirmDialog('¿Eliminar este producto?');
      if (!ok) return;

      try {
        await productsService.remove(id);
      } catch (err) {
        showError(getErrorMessage(err, 'Ocurrió un error al eliminar.'));
        return;
      }

      await loadAndRenderProducts();
      showSuccess('Producto eliminado.');
    }
  }

  // --- Filtros ---
  function isPriceRangeValid() {
    const minRaw = minPriceInput.value;
    const maxRaw = maxPriceInput.value;

    // Solo validamos si ambos tienen valor.
    if (minRaw === '' || maxRaw === '') return true;

    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (Number.isNaN(min) || Number.isNaN(max)) return true;

    return min <= max;
  }

  // Lee TODOS los controles, valida y, si todo está bien, recarga.
  // Es el único camino por el que se actualizan los filtros: así
  // currentFilters nunca queda a medias respecto de lo que muestra la UI.
  function applyFilters() {
    if (!isPriceRangeValid()) {
      showFilterError('El precio mínimo no puede ser mayor que el máximo.');
      return;
    }

    hideFilterError();
    currentFilters.search = searchInput.value;
    currentFilters.categoryId = categoryFilterSelect.value;
    currentFilters.minPrice = minPriceInput.value;
    currentFilters.maxPrice = maxPriceInput.value;
    currentPage = 1;
    loadAndRenderProducts();
  }

  function scheduleFilterUpdate() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(applyFilters, 400);
  }

  // --- Event listeners ---
  if (newBtn) newBtn.addEventListener('click', () => openDrawer());
  cancelBtn.addEventListener('click', () => drawer.close());
  form.addEventListener('submit', handleSubmit);
  tbody.addEventListener('click', handleTableClick);

  searchInput.addEventListener('input', scheduleFilterUpdate);
  minPriceInput.addEventListener('input', scheduleFilterUpdate);
  maxPriceInput.addEventListener('input', scheduleFilterUpdate);

  categoryFilterSelect.addEventListener('change', () => {
    clearTimeout(filterTimeout); // cancela un debounce pendiente; applyFilters ya lee todo
    applyFilters();
  });

  await loadCategoriesIntoSelects();
  await loadAndRenderProducts();

  // --- Cleanup ---
  return () => {
    clearTimeout(filterTimeout);
  };
}
