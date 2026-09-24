import { usersService } from '../services/users.service.js';
import { getUser } from '../services/auth-store.js';
import { escapeHtml } from '../ui/escape.js';
import { getInitials, formatDate, formatDateTimeShort } from '../ui/format.js';

export async function initProfileView(root) {
  const user = getUser();
  const sessionStart = localStorage.getItem('lastLogin');

  // Generar iniciales para el avatar
  const initials = getInitials(user.name);

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Mi perfil</h2>
        <p class="view-subtitle">Gestioná tu información personal y credenciales de acceso.</p>
      </div>
    </div>

    <div class="profile-grid">
      
      <!-- Columna 1: Datos Personales -->
      <div class="profile-card">
        <div class="profile-card-header">
          <h3>Datos personales</h3>
          <p>Actualizá tu nombre visible en la plataforma.</p>
        </div>

        <div class="profile-avatar-section">
          <div class="profile-avatar">${escapeHtml(initials)}</div>
          <div>
            <p class="profile-avatar-name">${escapeHtml(user.name)}</p>
            <p class="profile-avatar-role">${user.role === 'admin' ? 'Administrador' : 'Usuario'}</p>
          </div>
        </div>

        <form id="profile-form" class="profile-form">
          <p id="profile-success" class="auth-success hidden"></p>
          <p id="profile-form-error" class="auth-error hidden"></p>

          <div class="form-group">
            <label for="profile-name">Nombre completo</label>
            <input id="profile-name" name="name" type="text" required maxlength="150" value="${escapeHtml(user.name)}" />
          </div>

          <div class="form-group">
            <label for="profile-email">Email</label>
            <input id="profile-email" name="email" type="email" value="${escapeHtml(user.email)}" disabled />
            <small class="form-help">El email no se puede modificar.</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Guardar cambios</button>
          </div>
        </form>
      </div>

      <!-- Columna 2: Seguridad -->
      <div class="profile-card">
        <div class="profile-card-header">
          <h3>Seguridad</h3>
          <p>Cambiá tu contraseña periódicamente para mantener tu cuenta segura.</p>
        </div>

        <form id="password-form" class="profile-form">
          <p id="password-success" class="auth-success hidden"></p>
          <p id="password-form-error" class="auth-error hidden"></p>

          <div class="form-group">
            <label for="current-password">Contraseña actual</label>
            <input id="current-password" name="currentPassword" type="password" required />
          </div>

          <div class="form-group">
            <label for="new-password">Nueva contraseña</label>
            <input id="new-password" name="newPassword" type="password" required minlength="8" />
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirmar nueva contraseña</label>
            <input id="confirm-password" name="confirmPassword" type="password" required minlength="8" />
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Cambiar contraseña</button>
          </div>
        </form>
      </div>

      <!-- Columna 3: Detalles de la cuenta -->
      <div class="profile-card profile-card--static">
        <div class="profile-card-header">
          <h3>Detalles de la cuenta</h3>
          <p>Información de solo lectura sobre tu usuario.</p>
        </div>

        <div class="account-details">
          <div class="account-detail-row">
            <span class="account-detail-label">ID de usuario</span>
            <span class="account-detail-value num" title="${escapeHtml(user.id ?? '')}">
              ${user.id ? escapeHtml(user.id.substring(0, 8)) + '...' : '—'}
            </span>
          </div>

          <div class="account-detail-row">
            <span class="account-detail-label">Estado de la cuenta</span>
            <span class="badge ${user.isActive ? 'badge--active' : 'badge--inactive'}">
              ${user.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          <div class="account-detail-row">
            <span class="account-detail-label">Sesión actual</span>
            <span class="account-detail-value num">
              ${formatDateTimeShort(sessionStart)}
            </span>
          </div>

          <div class="account-detail-row">
            <span class="account-detail-label">Miembro desde</span>
            <span class="account-detail-value num">
              ${formatDate(user.createdAt)}
            </span>
          </div>
        </div>
      </div>

    </div>
  `;

  const profileForm = root.querySelector('#profile-form');
  const profileFormError = root.querySelector('#profile-form-error');
  const profileSuccess = root.querySelector('#profile-success');

  const passwordForm = root.querySelector('#password-form');
  const passwordFormError = root.querySelector('#password-form-error');
  const passwordSuccess = root.querySelector('#password-success');
  const newPasswordInput = root.querySelector('#new-password');
  const confirmPasswordInput = root.querySelector('#confirm-password');

  function showSuccess(el, message) {
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2500);
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    profileFormError.classList.add('hidden');

    const submitBtn = profileForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    const formData = new FormData(profileForm);
    const data = { name: formData.get('name') };

    try {
      const updatedUser = await usersService.update(user.id, data);
      user.name = updatedUser.name;

      // Actualizamos el nombre en el sidebar
      const sidebarNameEl = document.getElementById('user-name');
      if (sidebarNameEl) sidebarNameEl.textContent = updatedUser.name;

      // Actualizamos el avatar y el nombre dentro de la tarjeta de perfil
      const avatarNameEl = root.querySelector('.profile-avatar-name');
      const avatarEl = root.querySelector('.profile-avatar');
      if (avatarNameEl) avatarNameEl.textContent = updatedUser.name;
      if (avatarEl) {
        avatarEl.textContent = getInitials(updatedUser.name);
      }

      showSuccess(profileSuccess, 'Datos actualizados.');
    } catch (err) {
      profileFormError.textContent =
        err.body?.message ?? 'Ocurrió un error, intentá de nuevo.';
      profileFormError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    passwordFormError.classList.add('hidden');

    if (newPasswordInput.value !== confirmPasswordInput.value) {
      passwordFormError.textContent = 'Las contraseñas no coinciden.';
      passwordFormError.classList.remove('hidden');
      return;
    }

    const submitBtn = passwordForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    const formData = new FormData(passwordForm);
    const data = {
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
    };

    try {
      await usersService.changePassword(user.id, data);
      passwordForm.reset();
      showSuccess(passwordSuccess, 'Contraseña actualizada.');
    } catch (err) {
      if (err.status === 401) {
        passwordFormError.textContent = 'Contraseña actual incorrecta.';
      } else {
        passwordFormError.textContent =
          err.body?.message ?? 'Ocurrió un error, intentá de nuevo.';
      }
      passwordFormError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  }

  profileForm.addEventListener('submit', handleProfileSubmit);
  passwordForm.addEventListener('submit', handlePasswordSubmit);
}
