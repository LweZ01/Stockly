// src/main.js

import './style.css';
import { silentRefresh, logout } from './services/auth.service.js';
import { initAuthView } from './views/auth.view.js';
import {
  registerRoute,
  navigate,
  startRouter,
  refreshCurrentRoute,
  resetRouter,
} from './router.js';
import { initCategoriesView } from './views/categories.view.js';
import { initProductsView } from './views/products.view.js';
import { initInventoryView } from './views/inventory.view.js';
import { initUsersView } from './views/users.view.js';
import { initProfileView } from './views/profile.view.js';
import { initDashboardView } from './views/dashboard.view.js';

// ------------------------------------------------------------
// Referencias DOM
// ------------------------------------------------------------
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const userName = document.getElementById('user-name');
const userRole = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
// Botón hamburguesa flotante (el id conserva el nombre del topbar viejo)
const mobileMenuBtn = document.getElementById('topbar-menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');

registerRoute('dashboard', {
  title: 'Dashboard',
  render: (root) => initDashboardView(root),
});
registerRoute('products', {
  title: 'Productos',
  render: (root) => initProductsView(root),
});
registerRoute('categories', {
  title: 'Categorías',
  render: (root) => initCategoriesView(root),
});
registerRoute('inventory', {
  title: 'Inventario',
  render: (root) => initInventoryView(root),
  adminOnly: true,
});
registerRoute('users', {
  title: 'Usuarios',
  render: (root) => initUsersView(root),
  adminOnly: true,
});
registerRoute('profile', {
  title: 'Mi perfil',
  render: (root) => initProfileView(root),
});

// ------------------------------------------------------------
// Pantallas
// ------------------------------------------------------------
function showAuthScreen() {
  resetRouter();

  // Sidebar mobile abierta: si no se cierra, reaparece abierta (con su
  // overlay) en el próximo login.
  closeSidebar();

  // Cualquier <dialog> modal que haya quedado abierto (por ejemplo el
  // confirm-dialog, que vive en <body> y no lo limpia resetRouter) taparía
  // la pantalla de login. Cerrarlo también resuelve su promesa con false.
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());

  // No dejar credenciales tipeadas en el DOM tras un logout o expiración.
  document.getElementById('login-form')?.reset();
  document.getElementById('register-form')?.reset();

  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
}

let routerStarted = false;

function showAppScreen(user) {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  userName.textContent = user.name;
  userRole.textContent = user.role;

  if (!routerStarted) {
    startRouter();
    routerStarted = true;
  } else {
    refreshCurrentRoute();
  }
}

// ------------------------------------------------------------
// Toggle mobile de la sidebar
// ------------------------------------------------------------
function openSidebar() {
  sidebar.classList.add('sidebar--open');
  sidebarOverlay.classList.remove('hidden');
}

function closeSidebar() {
  sidebar.classList.remove('sidebar--open');
  sidebarOverlay.classList.add('hidden');
}

function toggleSidebar() {
  if (sidebar.classList.contains('sidebar--open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ------------------------------------------------------------
// Wire estático (una sola vez, no depende de login/logout)
// ------------------------------------------------------------
initAuthView((user) => {
  showAppScreen(user);
});

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
    navigate(link.dataset.route);
  });
});

logoutBtn.addEventListener('click', async () => {
  try {
    await logout();
  } catch {
    // logout() ya se encarga de limpiar la sesión local;
    // acá solo evitamos que un error de red rompa el flujo.
  } finally {
    showAuthScreen();
  }
});

window.addEventListener('auth:expired', showAuthScreen);

sidebarToggle.addEventListener('click', toggleSidebar);
mobileMenuBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
(async function boot() {
  try {
    const user = await silentRefresh();
    if (user) {
      showAppScreen(user);
    } else {
      showAuthScreen();
    }
  } catch {
    showAuthScreen();
  } finally {
    document.body.classList.remove('app-loading');
  }
})();
