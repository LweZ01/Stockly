import { productsService } from '../services/products.service.js';
import { categoriesService } from '../services/categories.service.js';
import { isAdmin } from '../services/auth-store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

const PAGE_LIMIT = 10;

export async function initProductsView(root) {
  root.innerHTML = `
    <div class="view-header">
      <h2>Productos</h2>
      ${isAdmin() ? '<button id="new-product-btn" type="button" class="btn btn-primary">Nuevo producto</button>' : ''}
    </div>

    <div class="filters-bar">
      <input type="search" id="search-input" placeholder="Buscar por nombre..." />
      <select id="category-filter"></select>
      <input type="number" id="min-price-input" placeholder="Precio mín." min="0" step="0.01" />
      <input type="number" id="max-price-input" placeholder="Precio máx." min="0" step="0.01" />
    </div>

    <p id="product-success" class="auth-success hidden"></p>

    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Nombre</th>
          <th>Categoría</th>
          <th>Precio</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="products-tbody"></tbody>
    </table>

    <div id="pagination"></div>

    <dialog id="product-dialog" class="dialog--lg">
      <form id="product-form" class="auth-form">
        <h3 id="product-dialog-title">Nuevo producto</h3>

        <div>
          <label for="product-sku">SKU</label>
          <input id="product-sku" name="sku" type="text" required maxlength="50" />
        </div>

        <div>
          <label for="product-name">Nombre</label>
          <input id="product-name" name="name" type="text" required maxlength="150" />
        </div>

        <div>
          <label for="product-description">Descripción</label>
          <textarea id="product-description" name="description"></textarea>
        </div>

        <div>
          <label for="product-price">Precio</label>
          <input id="product-price" name="price" type="number" required min="0" step="0.01" />
        </div>

        <div>
          <label for="product-category">Categoría</label>
          <select id="product-category" name="categoryId"></select>
        </div>

        <div>
          <label for="product-image-url">URL de imagen</label>
          <input id="product-image-url" name="imageUrl" type="text" />
        </div>

        <p id="product-form-error" class="auth-error hidden"></p>

        <div class="dialog-actions">
          <button type="submit" class="btn btn-primary">Guardar</button>
          <button type="button" id="product-dialog-cancel" class="btn btn-ghost">Cancelar</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = root.querySelector('#product-dialog');
  const form = root.querySelector('#product-form');
  const dialogTitle = root.querySelector('#product-dialog-title');
  const formError = root.querySelector('#product-form-error');
  const successMsg = root.querySelector('#product-success');
  const tbody = root.querySelector('#products-tbody');
  const paginationEl = root.querySelector('#pagination');
  const newBtn = root.querySelector('#new-product-btn');
  const cancelBtn = root.querySelector('#product-dialog-cancel');

  const searchInput = root.querySelector('#search-input');
  const categoryFilterSelect = root.querySelector('#category-filter');
  const minPriceInput = root.querySelector('#min-price-input');
  const maxPriceInput = root.querySelector('#max-price-input');
  const dialogCategorySelect = root.querySelector('#product-category');

  let currentProducts = [];
  let currentPage = 1;
  let currentFilters = { name: '', categoryId: '', minPrice: '', maxPrice: '' };
  let filterTimeout = null;

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  async function loadCategoriesIntoSelects() {
    let categories;
    try {
      categories = await categoriesService.list();
    } catch {
      // Fallback silencioso: los selects quedan solo con su opción por defecto.
      return;
    }

    const optionsHtml = categories
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join('');

    categoryFilterSelect.innerHTML =
      '<option value="">Todas las categorías</option>' + optionsHtml;
    dialogCategorySelect.innerHTML =
      '<option value="">Sin categoría</option>' + optionsHtml;
  }

  function renderRow(product) {
    const thumb = product.imageUrl
      ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-thumb" />`
      : '<span class="product-thumb-placeholder">—</span>';

    const categoryName = product.category?.name ?? '—';
    const estado = product.isActive ? 'Activo' : 'Inactivo';
    const actions = isAdmin()
      ? `<button type="button" class="btn btn-ghost" data-action="edit" data-id="${product.id}">Editar</button>
         <button type="button" class="btn btn-ghost" data-action="delete" data-id="${product.id}">Eliminar</button>`
      : '';

    return `
      <tr>
        <td>${product.sku}</td>
        <td>${thumb} ${product.name}</td>
        <td>${categoryName}</td>
        <td>$${product.price.toFixed(2)}</td>
        <td>${estado}</td>
        <td>${actions}</td>
      </tr>
    `;
  }

  function renderPagination({ total, page, limit }) {
    const totalPages = Math.ceil(total / limit) || 1;

    paginationEl.innerHTML = `
      <button type="button" id="prev-page-btn" class="btn btn-ghost" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${page} de ${totalPages}</span>
      <button type="button" id="next-page-btn" class="btn btn-ghost" ${page >= totalPages ? 'disabled' : ''}>Siguiente</button>
    `;

    root.querySelector('#prev-page-btn').addEventListener('click', () => {
      currentPage--;
      loadAndRenderProducts();
    });

    root.querySelector('#next-page-btn').addEventListener('click', () => {
      currentPage++;
      loadAndRenderProducts();
    });
  }

  async function loadAndRenderProducts() {
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

    const filters = {
      name: currentFilters.name || undefined,
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
      tbody.innerHTML =
        '<tr><td colspan="6" class="view-error">No se pudieron cargar los productos.</td></tr>';
      paginationEl.innerHTML = '';
      return;
    }

    currentProducts = response.data;

    if (response.data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6">No hay productos que coincidan con los filtros.</td></tr>';
      renderPagination(response);
      return;
    }

    tbody.innerHTML = response.data.map(renderRow).join('');
    renderPagination(response);
  }

  function openDialog(product = null) {
    form.reset();
    formError.classList.add('hidden');

    if (product) {
      dialogTitle.textContent = 'Editar producto';
      form.elements.sku.value = product.sku;
      form.elements.name.value = product.name;
      form.elements.description.value = product.description ?? '';
      form.elements.price.value = product.price;
      form.elements.categoryId.value = product.category?.id ?? '';
      form.elements.imageUrl.value = product.imageUrl ?? '';
      form.dataset.editingId = product.id;
    } else {
      dialogTitle.textContent = 'Nuevo producto';
      delete form.dataset.editingId;
    }

    dialog.showModal();
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

      dialog.close();
      await loadAndRenderProducts();
      showSuccess(editingId ? 'Producto actualizado.' : 'Producto creado.');
    } catch (err) {
      formError.textContent =
        err.body?.message ?? 'Ocurrió un error, intentá de nuevo.';
      formError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function handleTableClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const { id, action } = btn.dataset;

    if (action === 'edit') {
      const product = currentProducts.find((p) => p.id === id);
      if (product) openDialog(product);
      return;
    }

    if (action === 'delete') {
      const ok = await confirmDialog('¿Eliminar este producto?');
      if (!ok) return;

      try {
        await productsService.remove(id);
        await loadAndRenderProducts();
        showSuccess('Producto eliminado.');
      } catch (err) {
        alert(err.body?.message ?? 'Ocurrió un error al eliminar.');
      }
    }
  }

  function scheduleFilterUpdate() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      currentFilters.name = searchInput.value;
      currentFilters.minPrice = minPriceInput.value;
      currentFilters.maxPrice = maxPriceInput.value;
      currentPage = 1;
      loadAndRenderProducts();
    }, 400);
  }

  if (newBtn) newBtn.addEventListener('click', () => openDialog());
  cancelBtn.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', handleSubmit);
  tbody.addEventListener('click', handleTableClick);

  searchInput.addEventListener('input', scheduleFilterUpdate);
  minPriceInput.addEventListener('input', scheduleFilterUpdate);
  maxPriceInput.addEventListener('input', scheduleFilterUpdate);

  categoryFilterSelect.addEventListener('change', (e) => {
    currentFilters.categoryId = e.target.value;
    currentPage = 1;
    loadAndRenderProducts();
  });

  await loadCategoriesIntoSelects();
  await loadAndRenderProducts();
}
