# Frontend TODO — Inventory API

Frontend en **HTML/CSS/JS vanilla + Vite** (sin framework), servido por
NestJS como estáticos en producción (`ServeStaticModule`), con dev
server de Vite (hot reload) durante el desarrollo.

Metodología: cada fase tiene una checklist de archivos con **qué debe
hacer cada uno** (no el código en sí — lo escribís vos, salvo piezas de
infraestructura compartida que se acuerdan explícitamente y se dan
directamente). Al cerrar una fase, marcás los checkboxes y avisás para
revisar antes de seguir a la próxima.

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

   Filtros soportados por `ProductQueryDto` (confirmado en Fase 6):
   `name` (ILIKE parcial, sin índice de soporte — ver "Cuellos de
   botella conocidos" al final), `categoryId` (UUID), `minPrice`/
   `maxPrice` (`@Type(() => Number)`, aceptan string desde query
   params sin ajuste), más `page`/`limit` heredados de
   `PaginationQueryDto` — **`limit` máximo real: 100** (`@Max(100)`,
   confirmado en el DTO; no pedir más que eso desde ningún selector).

3. **Shapes de Inventory — CORREGIDO respecto a la versión original de
   este documento.** El endpoint cambió después de la primera versión
   de esta decisión y no se había actualizado acá hasta Fase 7:
   - `GET /inventory/products/:id/stock` → **NO es un `number` plano**
     como decía originalmente. El shape real, confirmado en el
     controller, es:
     ```ts
     {
       productId: string;
       stock: number;
     }
     ```
     `inventory.service.js` devuelve este objeto tal cual, sin
     aplanarlo — cualquier consumidor debe leer `.stock`.
   - `GET /inventory/products/:id/movements` → array de movimientos
     donde `movement.user` **viene populado como objeto** (no solo
     `userId`), así que la tabla de historial muestra
     `movement.user.name`/`.email` directo, sin request extra.
   - `MovementType` (confirmado en el enum): valores en **minúsculas**
     — `'entry' | 'exit' | 'adjustment'` — no `'ENTRY'/'EXIT'/'ADJUSTMENT'`.
     Los `<option value="...">` del formulario de movimiento usan
     estos strings exactos.
   - `CreateMovementDto`: `productId` (UUID), `type` (enum),
     `quantity` (entero; el backend exige `> 0` para `entry`/`exit`
     con 400 explícito si no se cumple), `reason` (opcional,
     `nullable: true` en la entidad — se puede mandar `null` sin
     problema). El `userId` **no** se manda desde el frontend: el
     backend lo toma del JWT vía `@CurrentUser()`.
   - Regla de negocio confirmada en el service: en `adjustment`,
     `quantity` es el **stock final exacto**, no un delta — se usa
     como base absoluta para recalcular todo movimiento posterior. Un
     `exit` con `quantity` mayor al stock actual devuelve 400 con
     mensaje exacto `"Stock insuficiente"`.

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

6. **`Role` enum en minúsculas** (`ADMIN = 'admin'`, `USER = 'user'`).
   Cualquier comparación de rol en el frontend (`isAdmin()` en
   `auth-store.js`) debe usar el string exacto en minúsculas — ver
   "Bugs reales encontrados" al final, quedó mal la primera vez.

7. **Shape de `User` (confirmado en Fase 8, entidad real):**
   ```ts
   interface User {
     id: string;
     email: string; // único, editable vía PATCH
     name: string; // editable vía PATCH
     role: 'admin' | 'user'; // NO editable vía PATCH /users/:id — no está en UpdateUserDto
     isActive: boolean; // solo se cambia (a false) vía DELETE /users/:id, sin endpoint de reactivación
     createdAt: string;
     updatedAt: string;
     // password NUNCA viaja acá — @Column({ select: false }) en la entidad
   }
   ```
   No hay endpoint de creación de usuarios desde `/users` — los
   usuarios nacen vía `/auth/register` con rol `USER` por default.
   `GET /users` y `GET /users/:id` no paginan, devuelven array/objeto
   plano.

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
- [x] `src/services/inventory.service.js`: `registerMovement`, `getStock`, `getHistory` — devuelve las respuestas del backend tal cual, sin transformarlas (importante: `getStock` pasa el objeto `{ productId, stock }` sin aplanar, ver Decisión 3)
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

- [x] Router mínimo basado en `location.hash` con `registerRoute(name, { title, render, adminOnly })`
- [x] Listener de `hashchange` + render inicial al arrancar
- [x] Chequeo `adminOnly` en cada render (lee `isAdmin()` del store, sin valor congelado)
- [x] Hash inválido cae a dashboard
- [x] `active` en el nav-link correspondiente + título del topbar actualizado
- [x] `try/catch` en `route.render()` con fallback visual (`.view-error`)
- [x] Router arrancado una sola vez (`routerStarted`) — evita duplicar el listener en re-login
- [x] Toggle mobile de la sidebar: abrir desde topbar, cerrar desde sidebar o overlay, cerrar antes de navegar
- [x] Sidebar: `data-admin-only` respetado vía chequeo en el router
- [x] Botón de logout en la sidebar wireado
- [x] **Actualización durante Fase 5**: `renderCurrent` pasó a ser
      `async`, con `await route.render(root)` directo — necesario
      porque las vistas de Fase 5 en adelante hacen fetch async antes
      de poder pintar contenido real. Se sumó **render token**
      (`renderToken`/`currentToken`): si el usuario navega a otra ruta
      mientras una vista todavía está resolviendo su `await`, el
      resultado tardío de la vista vieja se descarta en vez de pisar
      el render de la ruta nueva.
- [x] **Actualización posterior (bug encontrado ya con las 6 vistas
      completas)**: se agregó `refreshCurrentRoute()`, exportada junto
      a `registerRoute`/`navigate`/`startRouter`. Necesaria porque
      `startRouter()` solo corre una vez (`routerStarted` en
      `main.js`) — sin esto, un logout seguido de un login como otro
      usuario dejaba la vista actual (ej. Dashboard) mostrando los
      datos del usuario anterior hasta refrescar la página a mano,
      porque nada volvía a disparar `renderCurrent()` en el segundo
      login. `main.js` ahora llama `refreshCurrentRoute()` en el
      `else` de `if (!routerStarted)` dentro de `showAppScreen`. Ver
      detalle en "Bugs reales encontrados".

---

## FASE 5 — Vista de Categorías (CRUD completo, la más simple) ✅

Buena para validar el patrón de CRUD que se repitió en Products.

- [x] Listado en tabla: nombre, descripción
- [x] Botón "Nueva categoría" (solo visible si ADMIN) → `<dialog>` nativo con nombre + descripción
- [x] Botón "Editar" por fila (solo ADMIN) → mismo dialog, precargado
- [x] Botón "Eliminar" por fila (solo ADMIN) → confirmación antes de borrar
- [x] Manejo de errores: 409 al eliminar (categoría con productos asociados) muestra el mensaje específico del backend tal cual (`ConflictException` con texto legible en español)
- [x] Manejo de 409 al crear/editar con `name` duplicado (constraint `unique` real en la entidad) — mensaje genérico de `handlePostgresError` mostrado tal cual, sin texto propio del frontend
- [x] Estado vacío: mensaje si no hay categorías todavía
- [x] Mensaje de éxito al crear/editar/eliminar (`<p class="auth-success">` + `setTimeout`, reusa clases existentes)

**Archivo**: `src/views/categories.view.js` — `initCategoriesView(root)`, esqueleto único
(tabla + `<dialog>` inyectados una sola vez, no se recrean en cada
refresh), delegación de eventos en el `<tbody>` para editar/eliminar,
`currentCategories` como variable de closure para precargar el form de
edición sin pedir `getById` aparte.

**Criterio de cierre**: CRUD completo de categorías funcionando contra
la API real, con los permisos ADMIN respetados en la UI. **Probado
end-to-end con éxito**, incluidos ambos casos de 409.

### Fase 5.5 (no numerada en el TODO original) — `src/ui/confirm-dialog.js`

Pieza de infraestructura compartida, escrita directamente por ser
reusable entre vistas: `confirmDialog(message)` → `Promise<boolean>`,
reemplaza `confirm()` nativo (que rompía la estética del resto de la
app). El `<dialog>` se crea una sola vez de forma lazy e inyectado en
`document.body` (sobrevive a cambios de ruta, no se recrea por vista).
Maneja los 3 caminos de cierre — aceptar, cancelar, Esc — sin duplicar
listeners entre usos. Integrado en Categorías, Productos y Usuarios.

**CSS asociado**: `.view-header` (título + botón alineados),
`.filters-bar` (flex, wrap, buscador más ancho que el resto),
`.product-thumb`/`.product-thumb-placeholder`, `dialog.dialog--lg`
(max-width 560px vs 420px del dialog base), `.dashboard-cards` (Fase
10). Bug real encontrado y resuelto: el reset global `* { margin: 0 }`
pisaba el centrado nativo de `<dialog>` (que depende de `margin:
auto`) — el `<dialog>` abría pegado a una esquina en vez de centrado;
se agregó `margin: auto` explícito al bloque `dialog { ... }`.

---

## FASE 6 — Vista de Productos (CRUD + filtros + paginación) ✅

- [x] Listado en tabla: SKU, nombre (+ thumbnail de `imageUrl` si existe), categoría, precio (`.toFixed(2)`), estado (activo/inactivo)
- [x] Filtros: input de búsqueda por nombre (debounce ~400ms), select de categoría (poblado desde `/categories`), inputs numéricos de precio mínimo/máximo — un solo debounce compartido entre los tres inputs de texto/número, `change` inmediato en el select
- [x] Paginación: usando `total`/`page`/`limit` de la respuesta para calcular `totalPages` y armar los controles de "Anterior/Siguiente" (deshabilitados en los extremos); se resetea a página 1 al cambiar cualquier filtro
- [x] Crear/editar producto (solo ADMIN): `<dialog class="dialog--lg">` (más ancho que el de Categorías, por la cantidad de campos) con sku, name, description, price, categoryId (select con opción "Sin categoría" → `null`), imageUrl
- [x] Eliminar producto (solo ADMIN) → confirmación vía `confirm-dialog.js`; es soft-delete (`isActive = false`), y como `findAll()` ya filtra `isActive: true` por default, el producto desaparece correctamente del listado activo sin ajuste extra
- [x] Manejo de 409 (SKU duplicado, constraint `unique` real) con mensaje del backend mostrado tal cual

**Archivo**: `src/views/products.view.js` — `initProductsView(root)`,
mismo patrón que Categorías más: `loadCategoriesIntoSelects()` (puebla
tanto el filtro como el select del dialog en una sola llamada),
`renderPagination()` que recablea sus propios botones en cada render
(simple porque son siempre 2 elementos, no amerita delegación),
`scheduleFilterUpdate()` como debounce único para los tres inputs de
filtro numérico/texto.

**Criterio de cierre**: buscar, filtrar (nombre + categoría + rango de
precio combinados), paginar y hacer CRUD completo de productos.
**Probado end-to-end con éxito.**

---

## FASE 7 — Vista de Inventario (la más compleja del dominio) ✅

- [x] Selector de producto (dropdown poblado desde `/products`, `limit: 100` — el máximo real que acepta `PaginationQueryDto` vía `@Max(100)`; limitación conocida si en algún momento hay más de 100 productos activos, no resuelta con búsqueda/autocomplete en esta fase)
- [x] Al seleccionar uno: `Promise.all` en paralelo para stock (`getStock` → lee `.stock` del objeto `{ productId, stock }`, ver Decisión 3 corregida) + historial (`getHistory`, más reciente primero por `ORDER BY createdAt DESC` del backend) — columna de usuario sale de `movement.user.name`/`.email` sin request extra
- [x] Formulario "Registrar movimiento": producto (ya seleccionado arriba, no se repite en el form), tipo (`<select>` con values reales en minúsculas: `entry`/`exit`/`adjustment`, `entry` preseleccionado por default), cantidad, motivo (opcional, se manda `null` si vacío — la entidad lo permite)
- [x] Ayuda visual contextual (`#quantity-help`, actualizada en el `change` del select de tipo) aclarando que en `adjustment` la cantidad es el stock final exacto, no un delta
- [x] Manejo de 400 específico cuando un `exit` pide más stock del disponible — el backend devuelve el mensaje exacto `"Stock insuficiente"`, mostrado tal cual en el formulario sin texto propio
- [x] Toda esta vista es ADMIN-only a nivel de ruta (ya resuelto en Fase 4, `adminOnly: true` en `registerRoute`)
- [x] `userId` del movimiento NO se manda desde el frontend — el backend lo toma del JWT vía `@CurrentUser()`, coherente con el patrón ya usado en Auth

**Archivo**: `src/views/inventory.view.js` — `initInventoryView(root)`.

**⚠️ Corrección importante de shape, encontrada en esta fase**: el
`FRONTEND.MD` original (Decisión 3) decía que `GET
/inventory/products/:id/stock` devolvía un `number` plano. Al pedir el
controller real para armar el checklist de esta fase, se confirmó que
el endpoint había cambiado después de esa decisión y **nunca se
actualizó la documentación** — el shape real es `{ productId, stock
}`. `inventory.service.js` (ya escrito desde Fase 2) no necesitó
ningún cambio porque nunca transformaba la respuesta. **Lección**: si
un shape "confirmado" en este documento no coincide con el código real
al pedir el controller/service, confiar en el código, no en el
documento, y corregir acá — ver más casos en "Bugs reales
encontrados".

**Criterio de cierre**: registrar los tres tipos de movimiento y ver
cómo cambia el stock computado y el historial en tiempo real.
**Código completo y funcional.**

---

## FASE 8 — Vista de Usuarios (matriz de permisos ADMIN/self) ✅

Vista con la lógica de autorización más fina del proyecto: GET lista →
ADMIN; GET/PATCH `:id` → ADMIN o el propio usuario (chequeo manual en
el controller, no vía guard reusable — `if (current.role !== Role.ADMIN
&& current.id !== id) throw new ForbiddenException('No autorizado')`);
PATCH `:id/password` → solo el propio usuario, ni ADMIN (`'Solo podés
cambiar tu propia contraseña'`).

- [x] Listado (ADMIN-only, ya cubierto por la ruta): nombre, email, rol, estado, fecha de registro
- [x] Editar usuario (ADMIN) → `<dialog>` con `name` **y `email`** (el TODO original solo mencionaba nombre; `UpdateUserDto` en realidad acepta ambos, `role` NO es editable por este endpoint)
- [x] Desactivar usuario (ADMIN) → confirmación vía `confirm-dialog.js`, no eliminar (es soft-delete vía `isActive`); botón oculto sobre uno mismo como protección extra en la UI
- [x] Diferenciar visualmente el usuario logueado en la lista ("(vos)"), comparando `user.id` contra `getUser()?.id`

**Archivo**: `src/views/users.view.js` — `initUsersView(root)`. Como
toda la vista es `adminOnly` a nivel de ruta, no hace falta chequear
`isAdmin()` dentro del archivo para mostrar/ocultar botones (a
diferencia de Categorías/Productos, visibles para todos con botones
condicionales).

**Nota de shape confirmada en esta fase**: `password` tiene `@Column({
select: false })` en la entidad — nunca viaja en `findAll()`/
`findOne()` normales, cero riesgo de que aparezca en la tabla.

**Criterio de cierre**: un ADMIN puede listar, editar nombre/email y
desactivar usuarios (protegido contra desactivarse a sí mismo).
**Probado end-to-end con éxito** (edición, 409 de email duplicado,
desactivación).

---

## FASE 9 — Vista de Mi Perfil (accesible a cualquier usuario autenticado) ✅

- [x] Formulario de datos propios: editar `name` (email no editable, input `disabled` — se excluye solo del `FormData`, no hace falta filtrarlo a mano)
- [x] Formulario de cambio de contraseña: `currentPassword` + `newPassword` **+ confirmación de contraseña nueva** (validación en cliente, no la pide el backend — corta antes de llamar a la API si no coinciden)
- [x] Tras editar el nombre: se muta el objeto que devuelve `getUser()` (misma referencia en memoria, confirmado revisando `auth-store.js` — no hace falta un setter nuevo) y se actualiza a mano el `#user-name` de la sidebar, porque `main.js` solo la pinta una vez en `showAppScreen`
- [x] Manejo de 401 específico (`if (err.status === 401)`) si `currentPassword` es incorrecta, con texto propio "Contraseña actual incorrecta." (el backend ya trae ese texto exacto en `err.body.message`, así que el `if` es redundante en la práctica pero se dejó explícito a pedido)

**Archivo**: `src/views/profile.view.js` — `initProfileView(root)`.
Único archivo con dos `<form>` independientes, cada uno con su propio
submit/error/success — sin loading state ni fetch inicial, porque
`getUser()` ya tiene todo lo necesario en memoria (viene de
`login`/`silentRefresh` vía `GET /auth/me`).

**Criterio de cierre**: cualquier usuario logueado puede editar su
propio nombre (con reflejo inmediato en la sidebar) y cambiar su
contraseña. **Probado end-to-end con éxito.**

---

## FASE 10 — Dashboard ✅

- [x] Tarjetas de resumen clickeables (todo el `<button>` navega a la sección vía `navigate()` del router): productos activos (`productsService.list({ limit: 1 })` + leer `.total` — no se trae la lista completa solo para contar, ya que Products sí pagina), categorías (`categoriesService.list().length` — acá sí hace falta el array completo porque `findAll()` no pagina ni devuelve total), usuarios (solo si ADMIN, mismo motivo que categorías), rol del usuario actual (tarjeta estática, no clickeable, sin sentido de navegación)
- [x] Fetch de conteo de usuarios separado del `Promise.all` de productos/categorías — si fuera parte del mismo `Promise.all`, un `USER` (403 en `/users`) rompería también los conteos de productos/categorías, porque `Promise.all` rechaza entero si cualquier promesa interna rechaza

**Archivo**: `src/views/dashboard.view.js` — `initDashboardView(root)`.

**Criterio de cierre**: pantalla post-login con conteos reales de cada
recurso y accesos rápidos funcionales. **Probado end-to-end con
éxito** (incluida la corrección del bug de re-render tras cambio de
usuario, ver abajo).

---

## FASE 11 — Pulido final ⬜

- [ ] Estados de carga (spinners o skeletons) mientras se resuelven las requests, para que la UI no se sienta trabada
- [ ] Estados vacíos consistentes en todas las tablas
- [ ] Revisar que ningún dato sensible (password) se filtre a la consola o al DOM en ningún punto
- [ ] Probar el flujo completo de expiración de sesión: dejar el access token vencer (o forzarlo bajando el TTL temporalmente en `.env`) y confirmar que el refresh automático de `api.js` lo maneja sin que el usuario note nada
- [ ] Probar la detección de robo de refresh token: usar un token ya rotado y confirmar que la UI reacciona bien (te manda a login) cuando el backend revoca todo
- [ ] `npm run build` en `frontend/` genera el output en la carpeta que sirve NestJS, y `npm run start:prod` del backend sirve el frontend ya compilado, funcionando de punta a punta
- [ ] (Sumado durante Fase 6) Revisar si vale la pena manejar `minPrice > maxPrice` con validación en cliente antes de mandar al backend — hoy no se valida, el backend simplemente no devuelve resultados en ese caso, aceptable pero mejorable con feedback inmediato
- [ ] (Sumado durante el bug de re-render post-Fase 10) Confirmar con una prueba manual explícita que **todas** las vistas (no solo Dashboard) se comportan bien tras un logout→login como otro usuario, ahora que `refreshCurrentRoute()` existe — en particular Productos/Categorías con botones condicionados a `isAdmin()`, que deberían aparecer/desaparecer correctamente sin refrescar la página

---

## Notas sueltas

- Nada de `localStorage`/`sessionStorage` para el access token — cualquier XSS podría leerlo. Vive en memoria del módulo `auth-store.js`.
- El refresh token nunca lo toca JS — vive solo en la cookie httpOnly, el navegador la maneja solo.
- El fetch central (`api.js`) separa tres ramas: caso feliz, 401 con refresh + reintento, y error de red — no las mezcla en el mismo bloque `catch`.
- `silentRefresh()` devuelve `null` en el caso esperado "no había sesión previa" (401 en refresh) y lanza `ApiError` solo en fallos reales (red caída, 500). El `boot()` de `main.js` distingue ambos.

### Bugs reales encontrados durante el desarrollo (documentados para no repetirlos)

- **Mismatch de mayúsculas/minúsculas en `Role` enum vs. dato en DB**
  (Fase 5): `Role.enum.ts` define los valores en minúsculas (`ADMIN =
'admin'`, `USER = 'user'`). Al promover manualmente un usuario a
  ADMIN con un `UPDATE role = 'ADMIN'` (mayúsculas, escrito a mano en
  SQL), el `RolesGuard` del backend comparaba `'ADMIN'` contra
  `'admin'` y rechazaba con 403 pese a que el usuario "debía" ser
  admin. Corregido el dato en la DB, apareció un segundo bug
  encadenado: `isAdmin()` en `auth-store.js` comparaba
  `currentUser?.role === 'ADMIN'` (también mayúsculas) — el JWT ya
  traía el rol correcto, pero el frontend seguía ocultando el botón
  "Nueva categoría" por el mismo desajuste de casing, ahora del lado
  del cliente. Ambos ajustados a minúsculas. **Moraleja**: nunca
  asumir el casing de un enum sin mirar el archivo real; si se escribe
  un valor a mano en SQL (seeds, fixes manuales), usar el string
  exacto del enum, no una convención "razonable".
- **Shape de `GET /inventory/.../stock` desactualizado en este
  documento** (Fase 7, ver Decisión 3) — el endpoint cambió de
  `number` plano a `{ productId, stock }` después de escribir este
  TODO, y no se actualizó hasta que se pidió el controller real.
  `inventory.service.js` no se vio afectado porque nunca transformaba
  la respuesta — la discrepancia estaba solo en la documentación, no
  en el código.
- **Centrado de `<dialog>` roto por el reset global** (Fase 5, `* {
margin: 0 }` pisa el `margin: auto` que el navegador aplica por
  default a `<dialog>` para centrarlo) — resuelto agregando `margin:
auto` explícito en el bloque `dialog { ... }` de `style.css`.
- **Vista actual no se refrescaba tras cambiar de usuario sin recargar
  la página** (encontrado después de Fase 10, con las 6 vistas ya
  completas): `startRouter()` en `router.js` solo corre una vez
  (`routerStarted` en `main.js`), así que un segundo login (tras un
  logout) actualizaba la sidebar pero no volvía a ejecutar
  `route.render()` sobre la vista actualmente montada — Dashboard, por
  ejemplo, seguía mostrando la tarjeta de Usuarios y el rol del
  usuario anterior hasta refrescar el navegador a mano. Se agregó
  `refreshCurrentRoute()` (exportada desde `router.js`, wrapper sobre
  la función privada `renderCurrent`) y se llama desde `main.js` en el
  `else` de `if (!routerStarted)` dentro de `showAppScreen`. **Pendiente
  de verificación explícita en Fase 11**: confirmar que esto también
  corrige el caso en el resto de las vistas (Productos/Categorías con
  botones condicionados a `isAdmin()`), no solo Dashboard donde se
  detectó originalmente.

### Cuellos de botella conocidos (documentado para la sección "Known

Trade-offs" del README, si se agrega)

Análisis teórico basado en el código, no medido con datos reales (el
volumen actual de testing es de pocas decenas de filas, muy por debajo
de donde estos problemas se notarían):

- `ProductQueryDto.name` usa `ILIKE '%texto%'` — el wildcard al
  inicio invalida cualquier índice B-tree normal sobre `name`, forzando
  un seq scan completo con volumen alto. Mitigación de bajo esfuerzo:
  extensión `pg_trgm` + índice GIN sobre `name`.
- `findAll()` de Products usa `getManyAndCount()` — ejecuta el
  `SELECT` y el `COUNT(*)` como dos queries separadas contra el mismo
  `WHERE`, pagando el costo de evaluar los filtros (incluido el ILIKE
  de arriba) dos veces por request de listado.
- Paginación de Products vía `OFFSET`/`LIMIT` (`skip`/`take` de
  TypeORM) — no escala bien a páginas altas con volumen grande;
  alternativa estándar es paginación por cursor (keyset).
- Sin índice explícito confirmado sobre `Product.categoryId` (FK,
  Postgres no las indexa automáticamente a diferencia de MySQL),
  `Product.price` (usado en rangos `>=`/`<=`), ni `Product.isActive`
  (filtrado en _todo_ `findAll()` sin excepción).
- El stock de un producto se deriva calculando sobre
  `InventoryMovement` (`SUM` de movimientos posteriores al último
  `adjustment`) en cada `GET .../stock` — es una tabla que crece
  indefinidamente por diseño (auditoría, nunca se poda). Con un
  producto de alta rotación acumulando cientos de miles de movimientos
  a lo largo del tiempo, ese cálculo se vuelve progresivamente más
  lento en cada lectura. Decisión de diseño explícita y defendible
  (consistencia sobre performance), pero vale la pena poder explicarla
  en una entrevista, incluyendo qué se haría distinto con más tiempo
  (ej. columna de stock cacheada actualizada transaccionalmente, si la
  consistencia lo permite).
