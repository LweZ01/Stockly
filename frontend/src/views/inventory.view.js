import { inventoryService } from '../services/inventory.service.js';
import { productsService } from '../services/products.service.js';
import { escapeHtml } from '../ui/escape.js';
import { getInitials, formatDateTime } from '../ui/format.js';
import { getErrorMessage } from '../ui/errors.js';

const QUANTITY_HELP = {
  entry: 'Cantidad a sumar al stock actual.',
  exit: 'Cantidad a restar del stock actual. No puede superar el stock disponible.',
  adjustment:
    'Cantidad = stock final exacto (no es una suma ni resta, reemplaza el valor actual).',
};

const TYPE_LABELS = {
  entry: 'Entrada',
  exit: 'Salida',
  adjustment: 'Ajuste',
};

const TYPE_BADGES = {
  entry: 'badge--active',
  exit: 'badge--inactive',
  adjustment: 'badge--admin',
};

export async function initInventoryView(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Inventario</h2>
        <p class="view-subtitle">Registrá entradas, salidas y ajustes de stock.</p>
      </div>
    </div>

    <p id="inventory-success" class="auth-success hidden"></p>
    <p id="inventory-error" class="auth-error hidden"></p>

    <div class="inventory-layout">
      <!-- Columna izquierda: registro de movimiento -->
      <div class="inventory-panel">
        <div class="inventory-panel-header">
          <h3>Registrar movimiento</h3>
          <p>Seleccioná un producto y registrá la operación.</p>
        </div>

        <div class="inventory-panel-body">
          <!-- Buscador de producto -->
          <div class="form-group">
            <label for="product-search">Producto</label>

            <div class="product-search" id="product-search-wrapper">
              <!-- Input de búsqueda -->
              <div class="product-search-input-wrap" id="product-search-input-wrap">
                <svg class="product-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  id="product-search"
                  placeholder="Buscar por nombre o SKU..."
                  autocomplete="off"
                />
              </div>

              <!-- Dropdown de resultados -->
              <div class="product-search-results hidden" id="product-search-results"></div>
            </div>

            <!-- Card del producto seleccionado (oculta hasta seleccionar) -->
            <div class="product-selected hidden" id="product-selected">
              <div class="product-selected-content">
                <div class="product-selected-info">
                  <span class="product-selected-thumb" id="product-selected-thumb">—</span>
                  <div class="product-selected-text">
                    <span class="product-selected-name" id="product-selected-name">—</span>
                    <span class="product-selected-sku code" id="product-selected-sku">—</span>
                  </div>
                </div>
                <button type="button" class="btn-icon" id="product-selected-clear" title="Cambiar producto">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div class="product-selected-stock">
                Stock actual: <strong id="product-selected-stock-value">—</strong>
              </div>
            </div>
          </div>

          <!-- Formulario de movimiento (oculto hasta seleccionar producto) -->
          <form id="movement-form" class="movement-form hidden">
            <div class="form-row">
              <div class="form-group">
                <label for="movement-type">Tipo</label>
                <select id="movement-type" name="type">
                  <option value="entry">Entrada</option>
                  <option value="exit">Salida</option>
                  <option value="adjustment">Ajuste</option>
                </select>
              </div>

              <div class="form-group">
                <label for="movement-quantity">Cantidad</label>
                <input id="movement-quantity" name="quantity" type="number" min="0" step="1" required />
              </div>
            </div>

            <p class="form-help" id="quantity-help"></p>

            <div class="form-group">
              <label for="movement-reason">Motivo (opcional)</label>
              <input id="movement-reason" name="reason" type="text" placeholder="Ej: Compra a proveedor, rotura, vencimiento..." />
            </div>

            <p id="movement-form-error" class="auth-error hidden"></p>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Registrar movimiento</button>
            </div>
          </form>

          <!-- Estado inicial (sin producto seleccionado) -->
          <div class="inventory-empty" id="inventory-empty">
            <p class="inventory-empty-text">
              Buscá y seleccioná un producto para registrar un movimiento.
            </p>
          </div>
        </div>
      </div>

      <!-- Columna derecha: historial del producto seleccionado -->
      <div class="inventory-panel inventory-panel--history hidden" id="history-panel">
        <div class="inventory-panel-header">
          <h3>Historial</h3>
          <p id="history-subtitle">Movimientos recientes del producto seleccionado.</p>
        </div>

        <div class="inventory-panel-body inventory-panel-body--flush">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th class="num">Cantidad</th>
                  <th>Usuario</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody id="movements-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Elementos ---
  const searchWrapper = root.querySelector('#product-search-wrapper');
  const searchInput = root.querySelector('#product-search');
  const searchResultsEl = root.querySelector('#product-search-results');
  const selectedCard = root.querySelector('#product-selected');
  const selectedThumb = root.querySelector('#product-selected-thumb');
  const selectedName = root.querySelector('#product-selected-name');
  const selectedSku = root.querySelector('#product-selected-sku');
  const selectedStockValue = root.querySelector(
    '#product-selected-stock-value',
  );
  const selectedClearBtn = root.querySelector('#product-selected-clear');
  const emptyState = root.querySelector('#inventory-empty');
  const historyPanel = root.querySelector('#history-panel');
  const historySubtitle = root.querySelector('#history-subtitle');
  const movementsTbody = root.querySelector('#movements-tbody');

  const movementForm = root.querySelector('#movement-form');
  const typeSelect = root.querySelector('#movement-type');
  const quantityHelp = root.querySelector('#quantity-help');
  const formError = root.querySelector('#movement-form-error');
  const successMsg = root.querySelector('#inventory-success');
  const errorMsg = root.querySelector('#inventory-error');

  // --- Estado ---
  let selectedProduct = null;
  let searchTimeout = null;
  let searchSeq = 0;
  let selectSeq = 0;

  // --- Helpers ---
  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
    setTimeout(() => errorMsg.classList.add('hidden'), 4000);
  }

  function updateQuantityHelp() {
    quantityHelp.textContent = QUANTITY_HELP[typeSelect.value] ?? '';
  }

  // --- Dropdown de resultados ---
  function showSearchResults(products) {
    if (products.length === 0) {
      searchResultsEl.innerHTML = `
        <div class="search-empty">No se encontraron productos.</div>
      `;
      searchResultsEl.classList.remove('hidden');
      return;
    }

    searchResultsEl.innerHTML = products
      .map(
        (p) => `
        <button type="button" class="search-result-item" data-product-id="${escapeHtml(p.id)}">
          <span class="search-result-thumb">${escapeHtml(getInitials(p.name))}</span>
          <span class="search-result-text">
            <span class="search-result-name">${escapeHtml(p.name)}</span>
            <span class="search-result-sku code">${escapeHtml(p.sku)}</span>
          </span>
        </button>
      `,
      )
      .join('');
    searchResultsEl.classList.remove('hidden');
  }

  function hideSearchResults() {
    searchResultsEl.classList.add('hidden');
    searchResultsEl.innerHTML = '';
  }

  async function performSearch(query) {
    const seq = ++searchSeq;

    if (!query.trim()) {
      hideSearchResults();
      return;
    }

    try {
      const response = await productsService.list({
        search: query.trim(),
        limit: 8,
      });
      if (seq !== searchSeq) return; // llegó una búsqueda más nueva
      showSearchResults(response.data);
    } catch {
      // Silencioso: si falla la búsqueda, no rompemos la UX.
      if (seq === searchSeq) hideSearchResults();
    }
  }

  // --- Selección de producto ---
  async function selectProduct(productId) {
    const seq = ++selectSeq;

    let product;
    try {
      product = await productsService.getById(productId);
    } catch (err) {
      if (seq === selectSeq) {
        showError(getErrorMessage(err, 'No se pudo cargar el producto.'));
      }
      return;
    }

    if (seq !== selectSeq) return; // el usuario ya eligió otro producto

    selectedProduct = product;

    // Actualizar la card
    selectedThumb.textContent = getInitials(product.name);
    selectedName.textContent = product.name;
    selectedSku.textContent = product.sku;

    // Ocultar el buscador y mostrar la card
    searchWrapper.classList.add('hidden');
    selectedCard.classList.remove('hidden');
    emptyState.classList.add('hidden');
    movementForm.classList.remove('hidden');
    historyPanel.classList.remove('hidden');

    // Actualizar subtítulo del historial
    historySubtitle.textContent = `Movimientos de ${product.name}`;

    // Cargar stock + historial
    await loadStockAndHistory(product.id);
  }

  function clearSelection() {
    selectSeq++; // invalida cualquier getById en vuelo
    selectedProduct = null;
    searchInput.value = '';
    hideSearchResults();
    searchWrapper.classList.remove('hidden');
    selectedCard.classList.add('hidden');
    movementForm.classList.add('hidden');
    historyPanel.classList.add('hidden');
    emptyState.classList.remove('hidden');
    movementForm.reset();
    typeSelect.value = 'entry';
    updateQuantityHelp();
  }

  // --- Carga de stock + historial ---
  async function loadStockAndHistory(productId) {
    selectedStockValue.textContent = '...';
    movementsTbody.innerHTML =
      '<tr><td colspan="5" class="table-empty">Cargando...</td></tr>';

    let stockResponse;
    let movements;
    try {
      [stockResponse, movements] = await Promise.all([
        inventoryService.getStock(productId),
        inventoryService.getHistory(productId),
      ]);
    } catch {
      if (selectedProduct?.id !== productId) return;
      selectedStockValue.textContent = 'Error';
      movementsTbody.innerHTML =
        '<tr><td colspan="5" class="view-error">No se pudo cargar el historial.</td></tr>';
      return;
    }

    // El usuario ya cambió de producto mientras cargaba: descartar.
    if (selectedProduct?.id !== productId) return;

    selectedStockValue.textContent = stockResponse.stock;

    if (movements.length === 0) {
      movementsTbody.innerHTML =
        '<tr><td colspan="5" class="table-empty">Sin movimientos registrados todavía.</td></tr>';
      return;
    }

    movementsTbody.innerHTML = movements.map(renderMovementRow).join('');
  }

  function renderMovementRow(movement) {
    const fecha = formatDateTime(movement.createdAt);
    const usuario = movement.user?.name ?? movement.user?.email ?? '—';
    const typeLabel = TYPE_LABELS[movement.type] ?? movement.type;
    const typeClass = TYPE_BADGES[movement.type] ?? 'badge--user';
    const sign =
      movement.type === 'entry' ? '+' : movement.type === 'exit' ? '−' : '';
    const quantityDisplay = `${sign}${movement.quantity}`;

    return `
      <tr>
        <td class="code">${fecha}</td>
        <td><span class="badge ${typeClass}">${escapeHtml(typeLabel)}</span></td>
        <td class="num">${quantityDisplay}</td>
        <td>${escapeHtml(usuario)}</td>
        <td>${escapeHtml(movement.reason ?? '—')}</td>
      </tr>
    `;
  }

  // --- Submit del movimiento ---
  async function handleSubmit(e) {
    e.preventDefault();
    formError.classList.add('hidden');

    if (!selectedProduct) {
      formError.textContent = 'Seleccioná un producto primero.';
      formError.classList.remove('hidden');
      return;
    }

    const submitBtn = movementForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    const formData = new FormData(movementForm);
    const data = {
      productId: selectedProduct.id,
      type: formData.get('type'),
      quantity: Number(formData.get('quantity')),
      reason: formData.get('reason') || null,
    };

    try {
      await inventoryService.registerMovement(data);
      movementForm.reset();
      typeSelect.value = 'entry';
      updateQuantityHelp();
      await loadStockAndHistory(selectedProduct.id);
      showSuccess('Movimiento registrado.');
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

  // --- Event listeners ---

  // Búsqueda con debounce
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;

    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });

  // Focus: si hay texto, mostrar resultados de nuevo
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() && searchResultsEl.innerHTML) {
      searchResultsEl.classList.remove('hidden');
    }
  });

  // Click en un resultado
  searchResultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.search-result-item');
    if (!btn) return;
    selectProduct(btn.dataset.productId);
  });

  // Click fuera del buscador: cerrar dropdown
  function onDocumentClick(e) {
    if (!searchWrapper.contains(e.target)) {
      hideSearchResults();
    }
  }
  document.addEventListener('click', onDocumentClick);

  // Botón ✕ para deseleccionar
  selectedClearBtn.addEventListener('click', clearSelection);

  // Cambios en el form
  typeSelect.addEventListener('change', updateQuantityHelp);
  movementForm.addEventListener('submit', handleSubmit);

  // Init
  updateQuantityHelp();

  // --- Cleanup ---
  return () => {
    document.removeEventListener('click', onDocumentClick);
    clearTimeout(searchTimeout);
  };
}
