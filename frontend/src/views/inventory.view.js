import { inventoryService } from '../services/inventory.service.js';
import { productsService } from '../services/products.service.js';

const QUANTITY_HELP = {
  entry: 'Cantidad a sumar al stock actual.',
  exit: 'Cantidad a restar del stock actual. No puede superar el stock disponible.',
  adjustment:
    'Cantidad = stock final exacto (no es una suma ni resta, reemplaza el valor actual).',
};

export async function initInventoryView(root) {
  root.innerHTML = `
    <div class="view-header">
      <h2>Inventario</h2>
    </div>

    <div>
      <label for="product-select">Producto</label>
      <select id="product-select">
        <option value="">Seleccioná un producto</option>
      </select>
    </div>

    <p id="inventory-success" class="auth-success hidden"></p>

    <div id="stock-panel" class="hidden">
      <p>Stock actual: <strong id="current-stock"></strong></p>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Usuario</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody id="movements-tbody"></tbody>
      </table>
    </div>

    <form id="movement-form" class="auth-form hidden">
      <h3>Registrar movimiento</h3>

      <div>
        <label for="movement-type">Tipo</label>
        <select id="movement-type" name="type">
          <option value="entry">Entrada</option>
          <option value="exit">Salida</option>
          <option value="adjustment">Ajuste</option>
        </select>
      </div>

      <div>
        <label for="movement-quantity">Cantidad</label>
        <input id="movement-quantity" name="quantity" type="number" min="0" step="1" required />
      </div>

      <p id="quantity-help"></p>

      <div>
        <label for="movement-reason">Motivo (opcional)</label>
        <input id="movement-reason" name="reason" type="text" />
      </div>

      <p id="movement-form-error" class="auth-error hidden"></p>

      <button type="submit" class="btn btn-primary">Registrar movimiento</button>
    </form>
  `;

  const productSelect = root.querySelector('#product-select');
  const stockPanel = root.querySelector('#stock-panel');
  const currentStockEl = root.querySelector('#current-stock');
  const movementsTbody = root.querySelector('#movements-tbody');
  const movementForm = root.querySelector('#movement-form');
  const typeSelect = root.querySelector('#movement-type');
  const quantityHelp = root.querySelector('#quantity-help');
  const formError = root.querySelector('#movement-form-error');
  const successMsg = root.querySelector('#inventory-success');

  let selectedProductId = null;

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  function updateQuantityHelp() {
    quantityHelp.textContent = QUANTITY_HELP[typeSelect.value] ?? '';
  }

  async function loadProductsIntoSelect() {
    let response;
    try {
      response = await productsService.list({ limit: 100 });
    } catch {
      productSelect.innerHTML =
        '<option value="">Error al cargar productos</option>';
      return;
    }

    const options = response.data
      .map((p) => `<option value="${p.id}">${p.sku} — ${p.name}</option>`)
      .join('');

    productSelect.innerHTML =
      '<option value="">Seleccioná un producto</option>' + options;
  }

  function renderMovementRow(movement) {
    const fecha = new Date(movement.createdAt).toLocaleString();
    const usuario = movement.user?.name ?? movement.user?.email ?? '—';

    return `
      <tr>
        <td>${fecha}</td>
        <td>${movement.type}</td>
        <td>${movement.quantity}</td>
        <td>${usuario}</td>
        <td>${movement.reason ?? '—'}</td>
      </tr>
    `;
  }

  async function loadStockAndHistory(productId) {
    stockPanel.classList.remove('hidden');
    movementForm.classList.remove('hidden');
    currentStockEl.textContent = 'Cargando...';
    movementsTbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

    let stockResponse;
    let movements;
    try {
      [stockResponse, movements] = await Promise.all([
        inventoryService.getStock(productId),
        inventoryService.getHistory(productId),
      ]);
    } catch {
      currentStockEl.textContent = 'Error';
      movementsTbody.innerHTML =
        '<tr><td colspan="5" class="view-error">No se pudo cargar el historial.</td></tr>';
      return;
    }

    currentStockEl.textContent = stockResponse.stock;

    if (movements.length === 0) {
      movementsTbody.innerHTML =
        '<tr><td colspan="5">Sin movimientos registrados todavía.</td></tr>';
    } else {
      movementsTbody.innerHTML = movements.map(renderMovementRow).join('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    formError.classList.add('hidden');

    const submitBtn = movementForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    const formData = new FormData(movementForm);
    const data = {
      productId: selectedProductId,
      type: formData.get('type'),
      quantity: Number(formData.get('quantity')),
      reason: formData.get('reason') || null,
    };

    try {
      await inventoryService.registerMovement(data);
      movementForm.reset();
      typeSelect.value = 'entry';
      updateQuantityHelp();
      await loadStockAndHistory(selectedProductId);
      showSuccess('Movimiento registrado.');
    } catch (err) {
      // El backend ya devuelve mensajes específicos y legibles:
      // "quantity debe ser mayor a 0 para ENTRY y EXIT", "Stock insuficiente", etc.
      formError.textContent =
        err.body?.message ?? 'Ocurrió un error, intentá de nuevo.';
      formError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  }

  productSelect.addEventListener('change', (e) => {
    selectedProductId = e.target.value || null;

    if (!selectedProductId) {
      stockPanel.classList.add('hidden');
      movementForm.classList.add('hidden');
      return;
    }

    loadStockAndHistory(selectedProductId);
  });

  typeSelect.addEventListener('change', updateQuantityHelp);
  movementForm.addEventListener('submit', handleSubmit);

  // ENTRY preseleccionado por default (coincide con el value inicial del <select>)
  updateQuantityHelp();

  await loadProductsIntoSelect();
}
