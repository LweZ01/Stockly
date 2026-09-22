import { login, register } from '../services/auth.service.js';
import { ApiError } from '../services/api.js';

function getErrorMessage(err) {
  if (err instanceof ApiError) {
    const msg = err.body?.message;
    if (Array.isArray(msg)) return msg.join(' · ');
    if (typeof msg === 'string' && msg.length > 0) return msg;
    return 'Ocurrió un error';
  }
  return 'No se pudo conectar con el servidor';
}

function showMessage(el, text) {
  el.textContent = text;
  el.classList.remove('hidden');
}

function hideMessage(el) {
  el.classList.add('hidden');
}

export function initAuthView(onLoginSuccess) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const loginSuccess = document.getElementById('login-success');
  const registerError = document.getElementById('register-error');

  document.querySelectorAll('[data-switch-to]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.switchTo;

      hideMessage(loginError);
      hideMessage(loginSuccess);
      hideMessage(registerError);

      if (target === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
      } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
      }
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage(loginError);

    const formData = new FormData(loginForm);
    const email = formData.get('email');
    const password = formData.get('password');

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { user } = await login(email, password);
      onLoginSuccess(user);
    } catch (err) {
      showMessage(loginError, getErrorMessage(err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage(registerError);

    const formData = new FormData(registerForm);
    const name = formData.get('name');
    const email = formData.get('email');
    const password = formData.get('password');

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await register(name, email, password);

      registerForm.reset();
      registerForm.classList.add('hidden');
      loginForm.classList.remove('hidden');

      hideMessage(loginError);
      showMessage(loginSuccess, 'Cuenta creada. Ahora podés iniciar sesión.');

      document.getElementById('login-email').focus();
    } catch (err) {
      showMessage(registerError, getErrorMessage(err));
    } finally {
      submitBtn.disabled = false;
    }
  });
}
