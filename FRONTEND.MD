# Frontend TODO — Inventory API

Frontend en **HTML/CSS/JS vanilla + Vite** (sin framework), servido por
NestJS como estáticos en producción (`ServeStaticModule`), con dev
server de Vite (hot reload) durante el desarrollo.

Metodología: cada fase tiene una checklist de archivos con **qué debe
hacer cada uno** (no el código en sí — lo escribís vos). Al cerrar una
fase, marcás los checkboxes y avisás para revisar antes de seguir a la
próxima.

---

## ✅ Decisiones de diseño confirmadas

Cerradas antes de arrancar — el resto de las fases asume esto:

1. **Sin prefijo global.** Las rutas de la API van directo en la raíz:
   `/auth/login`, `/products`, `/categories`, `/users`, `/inventory`.
   El frontend se sirve aparte, en `/app`, vía:

   ```ts
   ServeStaticModule.forRoot({
     rootPath: join(import.meta.dirname, '..', 'client'),
     serveRoot: '/app',
   });
   ```

   Esto significa que en producción **API y frontend comparten
   origen** (mismo host/puerto, distinto path), así que las cookies
   httpOnly viajan sin problema y no hace falta CORS ahí. El único
   momento en que hay dos "orígenes" distintos es en desarrollo, con
   el dev server de Vite en su propio puerto — de ahí el proxy del
   punto 4.

2. **Shape de `GET /products` (confirmado, verificado en código):**

   ```ts
   interface PaginatedProductsResponse {
     data: Array<{
       id: string;
       sku: string;
       name: string;
       description: string | null;
       price: number;
       imageUrl: string | null;
       isActive: boolean;
       createdAt: string;
       updatedAt: string;
       category: {
         id: string;
         name: string;
         description: string | null;
         createdAt: string;
         updatedAt: string;
       } | null;
     }>;
     total: number; // respeta los filtros aplicados
     page: number;
     limit: number;
   }
   ```

   El servicio de productos en Fase 2 debe tipar/asumir **este** shape
   exacto — nada de "soportar array plano por las dudas", eso ya no
   aplica.

3. **Shapes de Inventory (confirmados):**
   - `GET /inventory/products/:id/stock` → devuelve un **`number`
     plano** (no `{ stock: ... }`, no objeto envolvente).
   - `GET /inventory/products/:id/movements` → array de movimientos
     donde `movement.user` **viene populado como objeto** (no solo
     `userId`), así que la tabla de historial puede mostrar
     `movement.user.name` o `.email` directo, sin pedir el usuario
     aparte.

4. **Carpetas y proxy de desarrollo:**
   - Fuente Vite en `inventory-api/frontend/`.
   - Build de producción cae en `inventory-api/client/` (coincide con
     el `rootPath` del `ServeStaticModule` de arriba).
   - En modo dev, `vite.config.js` usa `server.proxy` para redirigir
     las rutas de API (`/auth`, `/products`, `/categories`, `/users`,
     `/inventory`) a `http://localhost:3000`, así el dev server de
     Vite (en otro puerto) puede llamar a la API sin configurar CORS.
     Ejemplo de forma (ajustá el puerto si tu API corre en otro):
     ```js
     export default {
       server: {
         proxy: {
           '/auth': 'http://localhost:3000',
           '/products': 'http://localhost:3000',
           '/categories': 'http://localhost:3000',
           '/users': 'http://localhost:3000',
           '/inventory': 'http://localhost:3000',
         },
       },
       build: {
         outDir: '../client',
       },
     };
     ```

5. **Endpoint `GET /auth/me` agregado al backend.** Para el arranque
   del frontend (`silentRefresh()`), en vez de decodificar el payload
   del JWT y hacer un `GET /users/:id` aparte, se agregó un endpoint
   dedicado que devuelve el usuario autenticado usando el JWT ya
   validado por el guard. Esto mantiene al frontend desacoplado del
   formato interno del token, y simetriza `login` y `silentRefresh`
   (ambos setean la sesión con `{ accessToken, user }`).

---

## FASE 0 — Setup del proyecto Vite ✅

- [x] Crear carpeta `frontend/` en la raíz del proyecto (al lado de `src/`)
- [x] `npm create vite@latest` dentro de `frontend/`, template **vanilla**
- [x] Confirmar que corre: `cd frontend && npm install && npm run dev`
- [x] `vite.config.js`: `server.proxy` con las rutas de API apuntando a `http://localhost:3000`
- [x] `vite.config.js`: `build.outDir: '../client'`
- [x] Borrar el boilerplate de ejemplo (`counter.js`, logos, etc.)
- [x] En NestJS: agregar `@nestjs/serve-static`, registrar en `app.module.ts` con `rootPath` a `client/` y `serveRoot: '/app'`
- [x] Actualizar `.gitignore`: `frontend/node_modules`, `client/`

---

## FASE 1 — Estructura base y estilos ✅

- [x] `index.html`: esqueleto con dos "pantallas" (auth vs app), alternadas con `.hidden`
- [x] `src/style.css` con variables CSS en `:root`, reset, estilos reutilizables (botones, inputs, tablas)
- [x] Sidebar de navegación (HTML estático) con los 6 links, cada uno con `data-route` y `data-admin-only` donde corresponde
- [x] Layout responsive: sidebar colapsable en mobile vía `@media` + clase `.sidebar--open`

---

## FASE 2 — Capa de comunicación con la API ✅

- [x] `src/services/auth-store.js`: estado en memoria (module-scoped, no `window`/`localStorage`) con `setSession`, `clearSession`, `getAccessToken`, `setAccessToken`, `getUser`, `isAuthenticated`, `isAdmin`
- [x] `src/services/api.js`: cliente `fetch` central con:
  - [x] header `Authorization: Bearer <token>` automático
  - [x] `credentials: 'include'` siempre
  - [x] manejo de 401 con un solo `POST /auth/refresh` y un solo reintento
  - [x] refreshes en paralelo colapsados a una promesa compartida (`refreshPromise`)
  - [x] `ApiError` con `status` y `body` (para leer `body.message` en la UI)
- [x] Funciones de auth (`auth.service.js`):
  - [x] `login(email, password)` → setea `accessToken` + `user`
  - [x] `register(name, email, password)` → no toca el store
  - [x] `logout()` → revoca en backend + limpia el store en `finally`
  - [x] `silentRefresh()` → `POST /auth/refresh` + `GET /auth/me`, devuelve `null` si no había sesión
- [x] `src/services/categories.service.js`: `list`, `getById`, `create`, `update`, `remove`
- [x] `src/services/products.service.js`: `list(filters)` con `buildQuery`, `getById`, `create`, `update`, `remove`
- [x] `src/services/inventory.service.js`: `registerMovement`, `getStock`, `getHistory`
- [x] `src/services/users.service.js`: `list`, `getById`, `update`, `changePassword`, `remove`
- [x] Backend: `GET /auth/me` agregado con guard, `@CurrentUser` y exclusión de `password` — cubierto por tests e2e (98/98 pasando)

---

## FASE 3 — Pantallas de autenticación ✅

- [x] Formulario de login con manejo de errores del backend
- [x] Formulario de registro con mensaje de éxito y transición a login
- [x] Toggle entre login/register sin recargar
- [x] `silentRefresh()` en el arranque antes de decidir pantalla
- [x] Sin flash de login durante el refresh inicial (clase `app-loading` en `<body>` + CSS que oculta ambas pantallas hasta resolver)
- [x] Logout wireado y funcionando end-to-end

---

## FASE 4 — Router simple + navegación ✅

- [x] Router mínimo basado en `location.hash` con `Map` nombre → `{ title, render, adminOnly }`
- [x] Listener de `hashchange` + render inicial al arrancar
- [x] Chequeo `adminOnly` en cada render (lee `isAdmin()` del store, sin valor congelado)
- [x] Hash inválido cae a dashboard
- [x] `active` en el nav-link correspondiente + título del topbar actualizado
- [x] `try/catch` en `route.render()` con fallback visual (`.view-error`)
- [x] Router arrancado una sola vez (`routerStarted`) — evita duplicar el listener en re-login
- [x] Toggle mobile de la sidebar: abrir desde topbar, cerrar desde sidebar o overlay, cerrar antes de navegar
- [x] Sidebar: `data-admin-only` respetado vía chequeo en el router
- [x] Botón de logout en la sidebar wireado

---

## FASE 5 — Vista de Categorías (CRUD completo, la más simple) ⬜

Buena para validar el patrón de CRUD que vas a repetir en Products y
en parte de Users.

- [ ] Listado en tabla: nombre, descripción
- [ ] Botón "Nueva categoría" (solo visible si ADMIN) → modal/formulario con nombre + descripción
- [ ] Botón "Editar" por fila (solo ADMIN) → mismo modal, precargado
- [ ] Botón "Eliminar" por fila (solo ADMIN) → confirmación antes de borrar
- [ ] Manejo de errores: si el backend responde 409 al eliminar (categoría con productos asociados), mostrar ese mensaje específico, no un genérico
- [ ] Estado vacío: mensaje si no hay categorías todavía
- [ ] Toast o mensaje de éxito al crear/editar/eliminar

**Criterio de cierre**: CRUD completo de categorías funcionando contra tu API real, con los permisos ADMIN respetados en la UI (aunque el backend ya los fuerce, la UI no debería ni mostrar los botones a un USER).

---

## FASE 6 — Vista de Productos (CRUD + filtros + paginación) ⬜

- [ ] Listado en tabla: SKU, nombre, categoría, precio, estado (activo/inactivo)
- [ ] Filtros: input de búsqueda por nombre (con debounce, no una request por tecla), select de categoría
- [ ] Paginación: usando `total`/`page`/`limit` de la respuesta (shape confirmado en Fase 2) para calcular cantidad de páginas y armar los controles de "anterior/siguiente"
- [ ] Crear/editar producto (solo ADMIN): formulario con sku, name, description, price, categoryId (select poblado desde `/categories`), imageUrl
- [ ] Eliminar producto (solo ADMIN) → confirmación (recordá: es soft-delete, así que después de eliminar debería desaparecer del listado activo)
- [ ] Manejo de error 409 (SKU duplicado) con mensaje claro en el formulario

**Criterio de cierre**: podés buscar, filtrar, paginar y hacer CRUD completo de productos.

---

## FASE 7 — Vista de Inventario (la más compleja del dominio) ⬜

- [ ] Selector de producto (dropdown con todos los productos)
- [ ] Al seleccionar uno: mostrar stock actual (`GET /inventory/products/:id/stock`, número plano) y tabla de historial de movimientos (`GET /inventory/products/:id/movements`, más reciente primero) — la columna de usuario sale directo de `movement.user.name`/`.email`, sin requests extra
- [ ] Formulario "Registrar movimiento": producto, tipo (ENTRY/EXIT/ADJUSTMENT), cantidad, motivo (opcional)
- [ ] Ayuda visual en el formulario aclarando que en ADJUSTMENT la cantidad es el stock final exacto, no un delta
- [ ] Manejo de error 400 específico cuando un EXIT pide más stock del disponible (mensaje claro, no genérico)
- [ ] Toda esta vista es ADMIN-only a nivel de ruta (ya resuelto en Fase 4)

**Criterio de cierre**: podés registrar los tres tipos de movimiento y ver cómo cambia el stock computado y el historial en tiempo real.

---

## FASE 8 — Vista de Usuarios (matriz de permisos ADMIN/self) ⬜

Esta vista tiene la lógica de autorización más fina — repasá tu tabla:
GET lista → ADMIN; GET/PATCH `:id` → ADMIN o el propio usuario; PATCH
`:id/password` → solo el propio usuario, ni ADMIN.

- [ ] Listado (ADMIN-only, ya cubierto por la ruta): nombre, email, rol, estado, fecha de registro
- [ ] Editar nombre de otro usuario (ADMIN) → modal simple
- [ ] Desactivar usuario (ADMIN) → confirmación, no eliminar (es soft-delete vía `isActive`)
- [ ] Diferenciar visualmente el usuario logueado en la lista ("(vos)")

**Criterio de cierre**: un ADMIN puede listar, editar nombres y desactivar usuarios (menos a sí mismo, si querés agregar esa protección extra en la UI).

---

## FASE 9 — Vista de Mi Perfil (accesible a cualquier usuario autenticado) ⬜

Esta es la única vista de "usuarios" que ve un USER normal.

- [ ] Formulario de datos propios: editar nombre (email no editable, mostralo disabled)
- [ ] Formulario de cambio de contraseña: currentPassword + newPassword, separado del formulario de perfil
- [ ] Actualizar el store (`auth-store.js`) después de editar el nombre, para que la sidebar refleje el cambio sin recargar
- [ ] Manejo de error 401 específico si `currentPassword` es incorrecta

**Criterio de cierre**: cualquier usuario logueado (ADMIN o USER) puede editar su propio nombre y cambiar su contraseña.

---

## FASE 10 — Dashboard ⬜

Dejala para el final — es la vista más simple pero tiene sentido
construirla cuando ya existen los servicios de todos los recursos.

- [ ] Tarjetas de resumen: cantidad de productos activos, cantidad de categorías, cantidad de usuarios (solo si ADMIN), rol del usuario actual
- [ ] Accesos rápidos (botones que navegan a otras secciones)

**Criterio de cierre**: es la pantalla que ves justo después de loguearte, con un resumen útil según tu rol.

---

## FASE 11 — Pulido final ⬜

- [ ] Estados de carga (spinners o skeletons) mientras se resuelven las requests, para que la UI no se sienta trabada
- [ ] Estados vacíos consistentes en todas las tablas
- [ ] Revisar que ningún dato sensible (password) se filtre a la consola o al DOM en ningún punto
- [ ] Probar el flujo completo de expiración de sesión: dejar el access token vencer (o forzarlo bajando el TTL temporalmente en `.env`) y confirmar que el refresh automático de `api.js` lo maneja sin que el usuario note nada
- [ ] Probar la detección de robo de refresh token: usar un token ya rotado y confirmar que la UI reacciona bien (te manda a login) cuando el backend revoca todo
- [ ] `npm run build` en `frontend/` genera el output en la carpeta que sirve NestJS, y `npm run start:prod` del backend sirve el frontend ya compilado, funcionando de punta a punta

---

## Notas sueltas

- Nada de `localStorage`/`sessionStorage` para el access token — cualquier XSS podría leerlo. Vive en memoria del módulo `auth-store.js`.
- El refresh token nunca lo toca JS — vive solo en la cookie httpOnly, el navegador la maneja solo.
- El fetch central (`api.js`) separa tres ramas: caso feliz, 401 con refresh + reintento, y error de red — no las mezcla en el mismo bloque `catch`.
- `silentRefresh()` devuelve `null` en el caso esperado "no había sesión previa" (401 en refresh) y lanza `ApiError` solo en fallos reales (red caída, 500). El `boot()` de `main.js` distingue ambos.
