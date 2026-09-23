import { usersService } from '../services/users.service.js';
import { getUser } from '../services/auth-store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

export async function initUsersView(root) {
  root.innerHTML = `
    <div class="view-header">
      <h2>Usuarios</h2>
    </div>

    <p id="users-success" class="auth-success hidden"></p>

    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Estado</th>
          <th>Fecha de registro</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="users-tbody"></tbody>
    </table>

    <dialog id="user-dialog">
      <form id="user-form" class="auth-form">
        <h3>Editar usuario</h3>

        <div>
          <label for="user-name">Nombre</label>
          <input id="user-name" name="name" type="text" required maxlength="150" />
        </div>

        <div>
          <label for="user-email">Email</label>
          <input id="user-email" name="email" type="email" required />
        </div>

        <p id="user-form-error" class="auth-error hidden"></p>

        <div class="dialog-actions">
          <button type="submit" class="btn btn-primary">Guardar</button>
          <button type="button" id="user-dialog-cancel" class="btn btn-ghost">Cancelar</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = root.querySelector('#user-dialog');
  const form = root.querySelector('#user-form');
  const formError = root.querySelector('#user-form-error');
  const successMsg = root.querySelector('#users-success');
  const tbody = root.querySelector('#users-tbody');
  const cancelBtn = root.querySelector('#user-dialog-cancel');

  let currentUsers = [];

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  function renderRow(user) {
    const loggedInUser = getUser();
    const esVos = user.id === loggedInUser?.id;
    const nombreMostrado = esVos ? `${user.name} (Tú)` : user.name;
    const fecha = new Date(user.createdAt).toLocaleDateString();
    const estado = user.isActive ? 'Activo' : 'Inactivo';

    let actions = `<button type="button" class="btn btn-ghost" data-action="edit" data-id="${user.id}">Editar</button>`;
    if (!esVos) {
      actions += `<button type="button" class="btn btn-ghost" data-action="delete" data-id="${user.id}">Desactivar</button>`;
    }

    return `
      <tr>
        <td>${nombreMostrado}</td>
        <td>${user.email}</td>
        <td>${user.role}</td>
        <td>${estado}</td>
        <td>${fecha}</td>
        <td>${actions}</td>
      </tr>
    `;
  }

  async function loadAndRenderUsers() {
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

    let users;
    try {
      users = await usersService.list();
    } catch {
      tbody.innerHTML =
        '<tr><td colspan="6" class="view-error">No se pudieron cargar los usuarios.</td></tr>';
      return;
    }

    currentUsers = users;

    if (users.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6">No hay usuarios registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(renderRow).join('');
  }

  function openDialog(user) {
    form.reset();
    formError.classList.add('hidden');
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.dataset.editingId = user.id;
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
      email: formData.get('email'),
    };

    const editingId = form.dataset.editingId;

    try {
      await usersService.update(editingId, data);
      dialog.close();
      await loadAndRenderUsers();
      showSuccess('Usuario actualizado.');
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
      const user = currentUsers.find((u) => u.id === id);
      if (user) openDialog(user);
      return;
    }

    if (action === 'delete') {
      const ok = await confirmDialog(
        '¿Desactivar este usuario? No hay forma de revertir esto.',
      );
      if (!ok) return;

      try {
        await usersService.remove(id);
        await loadAndRenderUsers();
        showSuccess('Usuario desactivado.');
      } catch (err) {
        alert(err.body?.message ?? 'Ocurrió un error al desactivar.');
      }
    }
  }

  cancelBtn.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', handleSubmit);
  tbody.addEventListener('click', handleTableClick);

  await loadAndRenderUsers();
}
