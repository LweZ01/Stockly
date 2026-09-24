import { usersService } from '../services/users.service.js';
import { getUser } from '../services/auth-store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

export async function initUsersView(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Usuarios</h2>
        <p class="view-subtitle">Gestioná los accesos, roles y estados del sistema.</p>
      </div>
    </div>

    <p id="users-success" class="auth-success hidden"></p>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Fecha de registro</th>
            <th class="table-actions-col">Acciones</th>
          </tr>
        </thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>

    <!-- Drawer de edición -->
    <dialog id="user-drawer" class="drawer">
      <form id="user-form" class="drawer-form">
        <div class="drawer-body">
          <h3 id="user-drawer-title">Editar usuario</h3>

          <div class="form-group">
            <label for="user-name">Nombre completo</label>
            <input id="user-name" name="name" type="text" required maxlength="150" />
          </div>

          <div class="form-group">
            <label for="user-email">Email</label>
            <input id="user-email" name="email" type="email" required />
          </div>

          <p id="user-form-error" class="auth-error hidden"></p>
        </div>

        <div class="drawer-actions">
          <button type="button" id="user-drawer-cancel" class="btn btn-ghost">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  `;

  const drawer = root.querySelector('#user-drawer');
  const form = root.querySelector('#user-form');
  const formError = root.querySelector('#user-form-error');
  const successMsg = root.querySelector('#users-success');
  const tbody = root.querySelector('#users-tbody');
  const cancelBtn = root.querySelector('#user-drawer-cancel');

  let currentUsers = [];

  // --- Helpers ---
  function getInitials(name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 2500);
  }

  // --- Render de fila ---
  function renderRow(user) {
    const loggedInUser = getUser();
    const esVos = user.id === loggedInUser?.id;
    const initials = getInitials(user.name);
    const fecha = new Date(user.createdAt).toLocaleDateString('es-AR');

    return `
      <tr>
        <td>
          <div class="user-cell">
            <span class="user-avatar">${initials}</span>
            <span class="user-cell-name">
              ${user.name}${esVos ? ' <span class="user-cell-you">(Tú)</span>' : ''}
            </span>
          </div>
        </td>
        <td>${user.email}</td>
        <td>
          <span class="badge ${user.role === 'admin' ? 'badge--admin' : 'badge--user'}">
            ${user.role === 'admin' ? 'Administrador' : 'Usuario'}
          </span>
        </td>
        <td>
          <span class="badge ${user.isActive ? 'badge--active' : 'badge--inactive'}">
            ${user.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td class="num">${fecha}</td>
        <td class="table-actions-col">
          <div class="table-actions">
            <button type="button" class="btn-icon" data-action="edit" data-id="${user.id}" title="Editar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
              </svg>
            </button>
            ${
              !esVos && user.isActive
                ? `
              <button type="button" class="btn-icon btn-icon--danger" 
                      data-action="deactivate" 
                      data-id="${user.id}" 
                      title="Desactivar">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </button>
            `
                : ''
            }
          </div>
        </td>
      </tr>
    `;
  }

  // --- Carga y render ---
  async function loadAndRenderUsers() {
    tbody.innerHTML =
      '<tr><td colspan="6" class="table-empty">Cargando...</td></tr>';

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
        '<tr><td colspan="6" class="table-empty">No hay usuarios registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(renderRow).join('');
  }

  // --- Drawer ---
  function openDrawer(user) {
    form.reset();
    formError.classList.add('hidden');
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.dataset.editingId = user.id;
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
      email: formData.get('email'),
    };

    const editingId = form.dataset.editingId;

    try {
      await usersService.update(editingId, data);
      drawer.close();
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

  // --- Acciones de tabla ---
  async function handleTableClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const { id, action } = btn.dataset;

    if (action === 'edit') {
      const user = currentUsers.find((u) => u.id === id);
      if (user) openDrawer(user);
      return;
    }

    if (action === 'deactivate') {
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

  cancelBtn.addEventListener('click', () => drawer.close());
  form.addEventListener('submit', handleSubmit);
  tbody.addEventListener('click', handleTableClick);

  await loadAndRenderUsers();
}
