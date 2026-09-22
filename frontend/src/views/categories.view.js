import { categoriesService } from '../services/categories.service.js';
import { isAdmin } from '../services/auth-store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

export async function initCategoriesView(root) {
  root.innerHTML = `
    <div class="view-header">
      <h2>Categorías</h2>
      ${isAdmin() ? '<button id="new-category-btn" type="button" class="btn btn-primary">Nueva categoría</button>' : ''}
    </div>

    <p id="category-success" class="auth-success hidden"></p>

    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Descripción</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="categories-tbody"></tbody>
    </table>

    <dialog id="category-dialog">
      <form id="category-form" class="auth-form">
        <h3 id="category-dialog-title">Nueva categoría</h3>

        <div>
          <label for="category-name">Nombre</label>
          <input id="category-name" name="name" type="text" required maxlength="100" />
        </div>

        <div>
          <label for="category-description">Descripción</label>
          <textarea id="category-description" name="description"></textarea>
        </div>

        <p id="category-form-error" class="auth-error hidden"></p>

        <div class="dialog-actions">
          <button type="button" id="category-dialog-cancel" class="btn btn-ghost">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = root.querySelector('#category-dialog');
  const form = root.querySelector('#category-form');
  const dialogTitle = root.querySelector('#category-dialog-title');
  const formError = root.querySelector('#category-form-error');
  const successMsg = root.querySelector('#category-success');
  const tbody = root.querySelector('#categories-tbody');
  const newBtn = root.querySelector('#new-category-btn');
  const cancelBtn = root.querySelector('#category-dialog-cancel');

  // Última lista cargada — evita re-pedir al backend para precargar el form de edición
  let currentCategories = [];

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  function renderRow(category) {
    const actions = isAdmin()
      ? `<button type="button" class="btn btn-ghost" data-action="edit" data-id="${category.id}">Editar</button>
         <button type="button" class="btn btn-ghost" data-action="delete" data-id="${category.id}">Eliminar</button>`
      : '';

    return `
      <tr>
        <td>${category.name}</td>
        <td>${category.description ?? '—'}</td>
        <td>${actions}</td>
      </tr>
    `;
  }

  async function loadAndRenderCategories() {
    tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

    let categories;
    try {
      categories = await categoriesService.list();
    } catch {
      tbody.innerHTML =
        '<tr><td colspan="3" class="view-error">No se pudieron cargar las categorías.</td></tr>';
      return;
    }

    currentCategories = categories;

    if (categories.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3">No hay categorías todavía.</td></tr>';
      return;
    }

    tbody.innerHTML = categories.map(renderRow).join('');
  }

  function openDialog(category = null) {
    form.reset();
    formError.classList.add('hidden');

    if (category) {
      dialogTitle.textContent = 'Editar categoría';
      form.elements.name.value = category.name;
      form.elements.description.value = category.description ?? '';
      form.dataset.editingId = category.id;
    } else {
      dialogTitle.textContent = 'Nueva categoría';
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

      dialog.close();
      await loadAndRenderCategories();
      showSuccess(editingId ? 'Categoría actualizada.' : 'Categoría creada.');
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
      const category = currentCategories.find((c) => c.id === id);
      if (category) openDialog(category);
      return;
    }

    if (action === 'delete') {
      const ok = await confirmDialog('¿Eliminar esta categoría?');
      if (!ok) return;

      try {
        await categoriesService.remove(id);
        await loadAndRenderCategories();
        showSuccess('Categoría eliminada.');
      } catch (err) {
        // El backend ya devuelve mensaje legible tanto en 409 (productos asociados)
        // como en otros errores — se muestra tal cual, sin texto propio.
        alert(err.body?.message ?? 'Ocurrió un error al eliminar.');
      }
    }
  }

  if (newBtn) newBtn.addEventListener('click', () => openDialog());
  cancelBtn.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', handleSubmit);
  tbody.addEventListener('click', handleTableClick);

  await loadAndRenderCategories();
}
