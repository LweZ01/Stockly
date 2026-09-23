import { usersService } from '../services/users.service.js';
import { getUser } from '../services/auth-store.js';

export async function initProfileView(root) {
  const user = getUser();

  root.innerHTML = `
    <div class="view-header">
      <h2>Mi perfil</h2>
    </div>

    <p id="profile-success" class="auth-success hidden"></p>

    <form id="profile-form" class="auth-form">
      <h3>Datos personales</h3>

      <div>
        <label for="profile-name">Nombre</label>
        <input id="profile-name" name="name" type="text" required maxlength="150" value="${user.name}" />
      </div>

      <div>
        <label for="profile-email">Email</label>
        <input id="profile-email" name="email" type="email" value="${user.email}" disabled />
      </div>

      <p id="profile-form-error" class="auth-error hidden"></p>

      <button type="submit" class="btn btn-primary">Guardar cambios</button>
    </form>

    <p id="password-success" class="auth-success hidden"></p>

    <form id="password-form" class="auth-form">
      <h3>Cambiar contraseña</h3>

      <div>
        <label for="current-password">Contraseña actual</label>
        <input id="current-password" name="currentPassword" type="password" required />
      </div>

      <div>
        <label for="new-password">Nueva contraseña</label>
        <input id="new-password" name="newPassword" type="password" required minlength="8" />
      </div>

      <div>
        <label for="confirm-password">Confirmar nueva contraseña</label>
        <input id="confirm-password" name="confirmPassword" type="password" required minlength="8" />
      </div>

      <p id="password-form-error" class="auth-error hidden"></p>

      <button type="submit" class="btn btn-primary">Cambiar contraseña</button>
    </form>
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

      // Mutamos el objeto en memoria de auth-store (getUser() devuelve la
      // misma referencia, no una copia) para que cualquier otra vista que
      // lo lea después vea el dato actualizado sin necesidad de relogin.
      user.name = updatedUser.name;

      // La sidebar (#user-name) solo se pinta una vez en main.js al hacer
      // login/silentRefresh — hay que actualizarla a mano acá para que se
      // vea el cambio sin recargar la página.
      const sidebarNameEl = document.getElementById('user-name');
      if (sidebarNameEl) sidebarNameEl.textContent = updatedUser.name;

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
