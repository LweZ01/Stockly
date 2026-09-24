# Frontend TODO — Inventory API

Frontend en **HTML/CSS/JS vanilla + Vite** (sin framework), servido por
NestJS como estáticos en producción (`ServeStaticModule`), con dev
server de Vite (hot reload) durante el desarrollo.

Metodología: cada fase tiene una checklist de archivos con **qué debe
hacer cada uno** (no el código en sí — lo escribís vos, salvo piezas de
infraestructura compartida que se acuerdan explícitamente y se dan
directamente). Al cerrar una fase, marcás los checkboxes y avisás para
revisar antes de seguir a la próxima.

**Estado general:** fases 0 a 10, 12 y 13 cerradas. La Fase 11 (pulido
final) tiene tareas abiertas (ver su sección y "Pendientes").

---

## ✅ Decisiones de diseño confirmadas

Cerradas antes de arrancar (1 a 7) y durante el desarrollo (8 a 14) — el
resto de las fases asume esto:

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

2. **Shape de `GET /products`** (confirmado, verificado en código):

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
   `PaginationQueryDto` — **limit máximo real: 100** (`@Max(100)`,
   confirmado en el DTO; no pedir más que eso desde ningún selector).

   **No existe filtro por `sku`** (ver "Pendientes de backend"): buscar
   un SKU en cualquier buscador del frontend no devuelve resultados.

3. **Shapes de Inventory — CORREGIDO** respecto a la versión original de
   este documento. El endpoint cambió después de la primera versión
   de esta decisión y no se había actualizado acá hasta Fase 7:

   - `GET /inventory/products/:id/stock` → **NO** es un `number` plano
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
     donde `movement.user` viene populado como objeto (no solo
     `userId`), así que la tabla de historial muestra
     `movement.user.name`/`.email` directo, sin request extra.

   - `MovementType` (confirmado en el enum): valores en **minúsculas**
     — `'entry' | 'exit' | 'adjustment'` — no `'ENTRY'`/`'EXIT'`/`'ADJUSTMENT'`.
     Los `<option value="...">` del formulario de movimiento y **todas
     las comparaciones del frontend** (Inventario y activity feed del
     Dashboard) usan estos strings exactos. Ver "Bugs reales": el
     Dashboard los comparaba en mayúsculas.

   - `CreateMovementDto`: `productId` (UUID), `type` (enum),
     `quantity` (entero; el backend exige `> 0` para entry/exit
     con 400 explícito si no se cumple), `reason` (opcional,
     `nullable: true` en la entidad — se puede mandar `null` sin
     problema). El `userId` **no se manda desde el frontend**: el
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
   validado por el guard (`@UseGuards(JwtAuthGuard)` + `@CurrentUser()`,
   sin `password`). Esto mantiene al frontend desacoplado del formato
   interno del token, y simetriza `login` y `silentRefresh` (ambos
   setean la sesión con `{ accessToken, user }`).

6. **`Role` enum en minúsculas** (`ADMIN = 'admin'`, `USER = 'user'`).
   Cualquier comparación de rol en el frontend (`isAdmin()` en
   `auth-store.js`) debe usar el string exacto en minúsculas — ver
   "Bugs reales encontrados" al final, quedó mal la primera vez.

7. **Shape de `User`** (confirmado en Fase 8, entidad real):

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

8. **Branding del proyecto: "Stockly"** (definido en Fase 12).
   Reemplazó el nombre genérico "Mi App" del `<title>` y de la
   pantalla de auth. Consistente con:

   - Logo del sidebar: círculo verde con iniciales "SK"
   - Logo de la pantalla de auth: cuadrado verde con "SK" (56x56)
   - `<title>` del navegador: "Stockly"

   No hay assets de imagen — todo es texto + CSS (fondo verde
   `--color-primary` + tipografía mono).

9. **Eliminación del topbar en la app shell** (Fase 12).
   Originalmente la app tenía un `<header class="topbar">` con el
   título de la vista (`#view-title`) y un botón hamburguesa móvil.
   Se eliminó por completo para:

   - Ganar espacio vertical.
   - Eliminar la redundancia de tener el título dos veces (topbar +
     `<h2>` dentro de la vista).
   - Permitir que el content-area maneje todo el alto.

   El botón hamburguesa móvil se movió al content-area como botón
   flotante (`.mobile-menu-btn`) con `position: absolute`. **Conserva
   el id `topbar-menu-btn`** (herencia del topbar viejo; en `main.js`
   la constante se llama `mobileMenuBtn`). El título de cada vista
   vive únicamente dentro de `<div class="view-header">` y ya no se
   setea desde el router. **Importante:** al eliminar `#view-title`,
   la línea `document.getElementById('view-title')` en `router.js`
   tuvo que borrarse también — tiraba
   `TypeError: Cannot set properties of null` en cada render. El campo
   `title` de `registerRoute` se sigue guardando pero ya nadie lo lee.

10. **Refactor de Inventario: búsqueda con autocompletado en lugar
    de `<select>` completo** (Fase 12). El `<select>` con todos los
    productos (`limit: 100`) era impracticable con catálogos grandes.
    Se reemplazó por un buscador en vivo (debounce 300ms,
    `productsService.list({ name, limit: 8 })`) que:

    - Muestra un dropdown flotante con resultados (thumb + nombre +
      SKU).
    - Al seleccionar, muestra una card con thumb + nombre + SKU +
      stock actual (fetch a `getStock`).
    - El formulario de movimiento y el historial se muestran solo
      después de seleccionar un producto.
    - El historial se movió a una columna derecha (desktop) para
      aprovechar el espacio.

    **Manejo de respuestas fuera de orden (Fase 13):** el autocompletado
    usa **contadores de secuencia**, no cancelación de requests. Cada
    búsqueda incrementa `searchSeq` y, al resolver, solo pinta los
    resultados si sigue siendo la búsqueda más reciente. Las requests
    anteriores igual se completan (no se cancelan), pero su respuesta se
    descarta. Si el input queda vacío, el contador también avanza, así
    que una respuesta en vuelo no reabre el dropdown. Lo mismo aplica a
    la selección de producto (`selectSeq`, invalidado también por el
    botón ✕) y a la carga de stock + historial (se descarta si el
    producto seleccionado cambió mientras cargaba).

11. **Activity feed del Dashboard** (Fase 12). Se agregó un endpoint
    nuevo en el backend, `GET /inventory/movements/recent?limit=N`,
    que devuelve los últimos N movimientos de todos los productos con
    `user` y `product` populados. El Dashboard lo consume con
    `limit=5` y muestra una sección "Actividad reciente" (solo
    visible para admins). Trae las relaciones para evitar requests
    adicionales por movimiento.

12. **Sesión, cookies y logout** (confirmado contra `AuthController`,
    Fase 13):

    - El **refresh token** viaja solo en la cookie `refreshToken`:
      `httpOnly`, `sameSite: 'strict'`, `secure` solo si
      `NODE_ENV === 'production'`, `maxAge` = `env.jwt.refreshExpiresIn`.
      El JS del frontend nunca lo toca.
    - `POST /auth/refresh` **rota** el refresh token en cada uso
      (setea una cookie nueva) y devuelve `{ accessToken }`. Sin
      cookie responde 401 `"No hay refresh token"`.
    - `POST /auth/logout` **no tiene guard**: lee solo la cookie, revoca
      el token y la limpia (responde 204, sin body). Por eso
      `logout()` usa `rawRequest` a propósito: un access token vencido
      no impide revocar la sesión en el backend.
    - `POST /auth/login` y `/auth/refresh` están excluidos del
      reintento automático de `api.js` (`isAuthEndpoint`); `register` y
      `logout` van por `rawRequest` directo, sin ciclo de refresh.
    - Cuando el refresh falla por una respuesta del backend
      (`ApiError`) y la sesión sigue siendo la misma, `api.js` limpia la
      sesión y emite `window` → `'auth:expired'`; `main.js` lo escucha
      y muestra el login. Un error de **red** no limpia la sesión (una
      red caída no significa que la sesión murió).

13. **Locale y moneda centralizados: `es-VE` / `USD`.** Viven como dos
    constantes (`LOCALE`, `CURRENCY`) al inicio de `src/ui/format.js`;
    ninguna vista formatea precios o fechas por su cuenta. Con esta
    combinación `Intl.NumberFormat` muestra `US$ 1.234,56` (es el
    comportamiento normal del locale venezolano, no un bug). Fechas
    inválidas o vacías se muestran como `—`.

14. **Política anti-XSS.** Todo dato que viene del backend (o del
    usuario) y entra a un template que termina en `innerHTML` pasa por
    `escapeHtml()` de `src/ui/escape.js`: nombres, emails, motivos,
    SKUs, `data-id`, `value="..."` y también las **iniciales** (salen
    del nombre, así que pueden contener `<`). `imageUrl` pasa además
    por `safeUrl()` (solo `http:`/`https:`) y su resultado se escapa
    igual al interpolarlo. Lo que se asigna con `.textContent` o
    `.value` no necesita escape. La validación definitiva de
    `imageUrl` debería vivir también en el backend (ver "Pendientes de
    backend").

---

## Módulos compartidos (mapa rápido)

| Archivo                      | Qué exporta / qué hace                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/auth-store.js` | Sesión en memoria: `setSession`, `clearSession`, `getAccessToken`, `setAccessToken`, `getUser`, `isAuthenticated`, `isAdmin`, `getSessionVersion` |
| `src/services/api.js`        | `rawRequest`, `api` (get/post/patch/delete), `ApiError`; refresh con promesa compartida y evento `auth:expired`                                   |
| `src/services/query.js`      | `buildQuery(filters)` — arma el query string ignorando `undefined`/`null`/`''`                                                                    |
| `src/ui/escape.js`           | `escapeHtml`, `safeUrl`                                                                                                                           |
| `src/ui/format.js`           | `getInitials`, `formatPrice`, `formatDate`, `formatDateTime`, `formatDateTimeShort`, `formatRelativeTime` (y las constantes `LOCALE`/`CURRENCY`)  |
| `src/ui/errors.js`           | `getErrorMessage(err, fallback)` — une arrays de `class-validator` con `·`; error de red → "No se pudo conectar con el servidor"                  |
| `src/ui/confirm-dialog.js`   | `confirmDialog(message)` → `Promise<boolean>`                                                                                                     |
| `src/router.js`              | `registerRoute`, `navigate`, `startRouter`, `refreshCurrentRoute`, `resetRouter` (con hook de cleanup por vista)                                  |

---

## FASE 0 — Setup del proyecto Vite ✅

- [x] Crear carpeta `frontend/` en la raíz del proyecto (al lado de `src/`)
- [x] `npm create vite@latest` dentro de `frontend/`, template `vanilla`
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
  - [x] _(Fase 13)_ `getSessionVersion()`: contador que se incrementa en `setSession` y `clearSession` (no en `setAccessToken`, para que un refresh normal no invalide la versión que comparan otros refreshes en vuelo)
- [x] `src/services/api.js`: cliente `fetch` central con:
  - [x] header `Authorization: Bearer <token>` automático
  - [x] `credentials: 'include'` siempre
  - [x] manejo de 401 con un solo `POST /auth/refresh` y un solo reintento
  - [x] refreshes en paralelo colapsados a una promesa compartida (`refreshPromise`)
  - [x] `ApiError` con `status` y `body` (para leer `body.message` en la UI)
  - [x] _(Fase 13)_ el refresh en vuelo compara `getSessionVersion()`: si hubo logout/login mientras esperaba, descarta el resultado en vez de pisar la sesión nueva
  - [x] _(Fase 13)_ si el refresh falla con `ApiError` y la sesión sigue siendo la misma: `clearSession()` + evento `auth:expired` (una sola vez, dentro de la promesa compartida). Un error de red se propaga sin tocar la sesión
- [x] Funciones de auth (`auth.service.js`):
  - [x] `login(email, password)` → setea accessToken + user y guarda `lastLogin` en `localStorage`
  - [x] `register(name, email, password)` → no toca el store
  - [x] `logout()` → revoca en backend (`rawRequest`, sin guard: ver Decisión 12) + `catch` explícito para errores de red + limpia el store en `finally`
  - [x] `silentRefresh()` → `POST /auth/refresh` + `GET /auth/me`, devuelve `null` si no había sesión; si `/auth/me` falla, limpia la sesión y relanza (nunca queda un token sin usuario)
- [x] `src/services/categories.service.js`: `list`, `getById`, `create`, `update`, `remove`
- [x] `src/services/products.service.js`: `list(filters)` con `buildQuery` (importado de `query.js`), `getById`, `create`, `update`, `remove`
- [x] `src/services/inventory.service.js`: `registerMovement`, `getStock`, `getHistory`, `getRecentMovements(limit)` — devuelve las respuestas del backend tal cual, sin transformarlas (importante: `getStock` pasa el objeto `{ productId, stock }` sin aplanar, ver Decisión 3)
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
- [x] Hash inválido cae a `dashboard`
- [x] `active` en el nav-link correspondiente + título del topbar actualizado _(obsoleto desde Fase 12: el topbar se eliminó, ver Decisión 9)_
- [x] `try/catch` en `route.render()` con fallback visual (`.view-error`)
- [x] Router arrancado una sola vez (`routerStarted`) — evita duplicar el listener en re-login
- [x] Toggle mobile de la sidebar: abrir desde topbar, cerrar desde sidebar o overlay, cerrar antes de navegar _(desde Fase 12 el botón de abrir es el flotante `.mobile-menu-btn`)_
- [x] Sidebar: `data-admin-only` respetado vía chequeo en el router
- [x] Botón de logout en la sidebar wireado
- [x] **Actualización durante Fase 5:** `renderCurrent` pasó a ser
      `async`, con `await route.render(root)` directo — necesario
      porque las vistas de Fase 5 en adelante hacen fetch async antes
      de poder pintar contenido real. Se sumó render token
      (`renderToken`/`currentToken`): si el usuario navega a otra ruta
      mientras una vista todavía está resolviendo su `await`, el
      resultado tardío de la vista vieja se descarta en vez de pisar
      el render de la ruta nueva.
- [x] **Actualización posterior** (bug encontrado ya con las 6 vistas
      completas): se agregó `refreshCurrentRoute()`, exportada junto
      a `registerRoute`/`navigate`/`startRouter`. Necesaria porque
      `startRouter()` solo corre una vez (`routerStarted` en
      `main.js`) — sin esto, un logout seguido de un login como otro
      usuario dejaba la vista actual (ej. Dashboard) mostrando los
      datos del usuario anterior hasta refrescar la página a mano,
      porque nada volvía a disparar `renderCurrent()` en el segundo
      login. `main.js` ahora llama `refreshCurrentRoute()` en el
      `else` de `if (!routerStarted)` dentro de `showAppScreen`. Ver
      detalle en "Bugs reales encontrados".
- [x] **Actualización en Fase 13 (sesión y router):**
  - [x] `renderCurrent` sale de inmediato si `!isAuthenticated()` (el listener de `hashchange` sigue vivo en la pantalla de login)
  - [x] **Hook de cleanup por vista:** el `render` de una ruta puede devolver una función de limpieza; el router la guarda y la ejecuta antes de renderizar la siguiente vista (y también si el render quedó obsoleto mientras esperaba). Usado por Inventario (listener de `document` + debounce) y Productos (debounce de filtros)
  - [x] `resetRouter()` exportada: invalida renders en vuelo (`renderToken++`), ejecuta el cleanup actual y vacía `#view-root`. Se llama desde `showAuthScreen` (evita ver un flash del contenido del usuario anterior)
  - [x] Un `ApiError` 401 en el `catch` de `renderCurrent` solo se ignora si la sesión ya fue limpiada (`auth:expired` se encarga); si la sesión sigue viva, se muestra el fallback `.view-error`

---

## FASE 5 — Vista de Categorías (CRUD completo, la más simple) ✅

Buena para validar el patrón de CRUD que se repitió en Products.

- [x] Listado en tabla: nombre, descripción _(reemplazado por grid de tarjetas en Fase 12)_
- [x] Botón "Nueva categoría" (solo visible si ADMIN) → `<dialog>` nativo con nombre + descripción _(drawer desde Fase 12)_
- [x] Botón "Editar" por fila (solo ADMIN) → mismo dialog, precargado
- [x] Botón "Eliminar" por fila (solo ADMIN) → confirmación antes de borrar
- [x] Manejo de errores: 409 al eliminar (categoría con productos asociados) muestra el mensaje específico del backend tal cual (`ConflictException` con texto legible en español) _(desde Fase 13 en un bloque de error propio de la vista, ya no con `alert()`)_
- [x] Manejo de 409 al crear/editar con `name` duplicado (constraint unique real en la entidad) — mensaje genérico de `handlePostgresError` mostrado tal cual, sin texto propio del frontend
- [x] Estado vacío: mensaje si no hay categorías todavía
- [x] Mensaje de éxito al crear/editar/eliminar (`<p class="auth-success">` + `setTimeout`, reusa clases existentes)

**Archivo:** `src/views/categories.view.js` — `initCategoriesView(root)`, esqueleto único
(tabla + `<dialog>` inyectados una sola vez, no se recrean en cada
refresh), delegación de eventos en el `<tbody>` para editar/eliminar,
`currentCategories` como variable de closure para precargar el form de
edición sin pedir `getById` aparte.

**Criterio de cierre:** CRUD completo de categorías funcionando contra
la API real, con los permisos ADMIN respetados en la UI. Probado
end-to-end con éxito, incluidos ambos casos de 409.

### Fase 5.5 (no numerada en el TODO original) — `src/ui/confirm-dialog.js`

Pieza de infraestructura compartida, escrita directamente por ser
reusable entre vistas: `confirmDialog(message)` → `Promise<boolean>`,
reemplaza `confirm()` nativo (que rompía la estética del resto de la
app). El `<dialog>` se crea una sola vez de forma lazy e inyectado en
`document.body` (sobrevive a cambios de ruta, no se recrea por vista).
Maneja los 3 caminos de cierre — aceptar, cancelar, Esc — sin duplicar
listeners entre usos. Integrado en Categorías, Productos y Usuarios.
Como vive fuera de `#view-root`, `resetRouter()` no lo limpia:
`showAuthScreen()` cierra explícitamente cualquier `<dialog>` abierto
(ver Fase 13) y el evento `close` resuelve la promesa con `false`.

CSS asociado: `.view-header` (título + botón alineados),
`.filters-bar` (flex, wrap, buscador más ancho que el resto),
`.product-thumb`/`.product-thumb-placeholder`, `dialog.dialog--lg`
(max-width 560px vs 420px del dialog base), `.dashboard-cards` (Fase
10). **Bug real encontrado y resuelto:** el reset global `* { margin: 0 }`
pisaba el centrado nativo de `<dialog>` (que depende de `margin: auto`) — el `<dialog>` abría pegado a una esquina en vez de centrado;
se agregó `margin: auto` explícito al bloque `dialog { ... }`.

---

## FASE 6 — Vista de Productos (CRUD + filtros + paginación) ✅

- [x] Listado en tabla: SKU, nombre (+ thumbnail de `imageUrl` si existe), categoría, precio (`formatPrice`), estado (activo/inactivo)
- [x] Filtros: input de búsqueda por nombre (debounce ~400ms), select de categoría (poblado desde `/categories`), inputs numéricos de precio mínimo/máximo — un solo debounce compartido entre los tres inputs de texto/número, `change` inmediato en el select
- [x] Paginación: usando `total`/`page`/`limit` de la respuesta para calcular `totalPages` y armar los controles de "Anterior/Siguiente" (deshabilitados en los extremos); se resetea a página 1 al cambiar cualquier filtro
- [x] Crear/editar producto (solo ADMIN): `<dialog class="dialog--lg">` (más ancho que el de Categorías, por la cantidad de campos) con `sku`, `name`, `description`, `price`, `categoryId` (select con opción "Sin categoría" → `null`), `imageUrl` _(drawer desde Fase 12)_
- [x] Eliminar producto (solo ADMIN) → confirmación vía `confirm-dialog.js`; es soft-delete (`isActive = false`), y como `findAll()` ya filtra `isActive: true` por default, el producto desaparece correctamente del listado activo sin ajuste extra
- [x] Manejo de 409 (SKU duplicado, constraint unique real) con mensaje del backend mostrado tal cual
- [x] _(Fase 13)_ Validación en cliente de `minPrice > maxPrice` (compara con `Number()` solo si ambos tienen valor; mensaje propio que queda visible mientras el rango sea inválido y no dispara request)
- [x] _(Fase 13)_ `loadSeq`: una respuesta de listado que llega tarde no pisa a una más nueva (debounce + paginación + select disparan la misma carga)

**Archivo:** `src/views/products.view.js` — `initProductsView(root)`,
mismo patrón que Categorías más: `loadCategoriesIntoSelects()` (puebla
tanto el filtro como el select del dialog en una sola llamada),
`renderPagination()` que recablea sus propios botones en cada render
(simple porque son siempre 2 elementos, no amerita delegación),
`scheduleFilterUpdate()` como debounce único para los tres inputs de
filtro numérico/texto.

**Criterio de cierre:** buscar, filtrar (nombre + categoría + rango de
precio combinados), paginar y hacer CRUD completo de productos.
Probado end-to-end con éxito.

---

## FASE 7 — Vista de Inventario (la más compleja del dominio) ✅

- [x] Selector de producto (dropdown poblado desde `/products`, `limit: 100` — el máximo real que acepta `PaginationQueryDto` vía `@Max(100)`; limitación conocida si en algún momento hay más de 100 productos activos, no resuelta con búsqueda/autocomplete en esta fase) _(resuelto en Fase 12, ver Decisión 10)_
- [x] Al seleccionar uno: `Promise.all` en paralelo para stock (`getStock` → lee `.stock` del objeto `{ productId, stock }`, ver Decisión 3 corregida) + historial (`getHistory`, más reciente primero por `ORDER BY createdAt DESC` del backend) — columna de usuario sale de `movement.user.name`/`.email` sin request extra
- [x] Formulario "Registrar movimiento": producto (ya seleccionado arriba, no se repite en el form), tipo (`<select>` con values reales en minúsculas: `entry`/`exit`/`adjustment`, `entry` preseleccionado por default), cantidad, motivo (opcional, se manda `null` si vacío — la entidad lo permite)
- [x] Ayuda visual contextual (`#quantity-help`, actualizada en el `change` del select de tipo) aclarando que en `adjustment` la cantidad es el stock final exacto, no un delta
- [x] Manejo de 400 específico cuando un `exit` pide más stock del disponible — el backend devuelve el mensaje exacto `"Stock insuficiente"`, mostrado tal cual en el formulario sin texto propio
- [x] Toda esta vista es ADMIN-only a nivel de ruta (ya resuelto en Fase 4, `adminOnly: true` en `registerRoute`)
- [x] `userId` del movimiento NO se manda desde el frontend — el backend lo toma del JWT vía `@CurrentUser()`, coherente con el patrón ya usado en Auth

**Archivo:** `src/views/inventory.view.js` — `initInventoryView(root)`.
Refactorizado en Fase 12 (búsqueda con autocompletado) y endurecido en
Fase 13 (contadores de secuencia, cleanup del listener de `document`,
errores visibles al fallar la carga de un producto).

⚠️ **Corrección importante de shape, encontrada en esta fase:** el
FRONTEND.MD original (Decisión 3) decía que `GET /inventory/products/:id/stock` devolvía un `number` plano. Al pedir el
controller real para armar el checklist de esta fase, se confirmó que
el endpoint había cambiado después de esa decisión y nunca se
actualizó la documentación — el shape real es `{ productId, stock }`. `inventory.service.js` (ya escrito desde Fase 2) no necesitó
ningún cambio porque nunca transformaba la respuesta. **Lección:** si
un shape "confirmado" en este documento no coincide con el código real
al pedir el controller/service, confiar en el código, no en el
documento, y corregir acá — ver más casos en "Bugs reales
encontrados".

**Criterio de cierre:** registrar los tres tipos de movimiento y ver
cómo cambia el stock computado y el historial en tiempo real.
Código completo y funcional.

---

## FASE 8 — Vista de Usuarios (matriz de permisos ADMIN/self) ✅

Vista con la lógica de autorización más fina del proyecto: `GET` lista →
ADMIN; `GET/PATCH :id` → ADMIN o el propio usuario (chequeo manual en
el controller, no vía guard reusable — `if (current.role !== Role.ADMIN && current.id !== id) throw new ForbiddenException('No autorizado')`);
`PATCH :id/password` → solo el propio usuario, ni ADMIN (`'Solo podés cambiar tu propia contraseña'`).

- [x] Listado (ADMIN-only, ya cubierto por la ruta): nombre, email, rol, estado, fecha de registro
- [x] Editar usuario (ADMIN) → `<dialog>` con `name` y `email` (el TODO original solo mencionaba nombre; `UpdateUserDto` en realidad acepta ambos, `role` NO es editable por este endpoint)
- [x] Desactivar usuario (ADMIN) → confirmación vía `confirm-dialog.js`, no eliminar (es soft-delete vía `isActive`); botón oculto sobre uno mismo como protección extra en la UI
- [x] Diferenciar visualmente el usuario logueado en la lista ("(vos)"), comparando `user.id` contra `getUser()?.id`

**Archivo:** `src/views/users.view.js` — `initUsersView(root)`. Como
toda la vista es `adminOnly` a nivel de ruta, no hace falta chequear
`isAdmin()` dentro del archivo para mostrar/ocultar botones (a
diferencia de Categorías/Productos, visibles para todos con botones
condicionales).

**Nota de shape confirmada en esta fase:** `password` tiene `@Column({ select: false })` en la entidad — nunca viaja en `findAll()`/
`findOne()` normales, cero riesgo de que aparezca en la tabla.

Refactorizado en Fase 12 (avatares, badges, drawer en lugar de
dialog, iconos de acción).

**Criterio de cierre:** un ADMIN puede listar, editar nombre/email y
desactivar usuarios (protegido contra desactivarse a sí mismo).
Probado end-to-end con éxito (edición, 409 de email duplicado,
desactivación).

---

## FASE 9 — Vista de Mi Perfil (accesible a cualquier usuario autenticado) ✅

- [x] Formulario de datos propios: editar `name` (`email` no editable, input `disabled` — se excluye solo del `FormData`, no hace falta filtrarlo a mano)
- [x] Formulario de cambio de contraseña: `currentPassword` + `newPassword` + confirmación de contraseña nueva (validación en cliente, no la pide el backend — corta antes de llamar a la API si no coinciden)
- [x] Tras editar el nombre: se muta el objeto que devuelve `getUser()` (misma referencia en memoria, confirmado revisando `auth-store.js` — no hace falta un setter nuevo) y se actualiza a mano el `#user-name` de la sidebar, porque `main.js` solo la pinta una vez en `showAppScreen`
- [x] Manejo de 401 específico (`if (err.status === 401)`) si `currentPassword` es incorrecta, con texto propio "Contraseña actual incorrecta." (el backend ya trae ese texto exacto en `err.body.message`, así que el `if` es redundante en la práctica pero se dejó explícito a pedido)

**Archivo:** `src/views/profile.view.js` — `initProfileView(root)`.
Único archivo con dos `<form>` independientes, cada uno con su propio
submit/error/success.

Refactorizado en Fase 12 (3 tarjetas en grid, avatar dinámico,
badges, sesión actual, logout que actualiza el sidebar sin recargar).

**Criterio de cierre:** cualquier usuario logueado puede editar su
propio nombre (con reflejo inmediato en la sidebar) y cambiar su
contraseña. Probado end-to-end con éxito.

---

## FASE 10 — Dashboard ✅

- [x] Tarjetas de resumen clickeables (todo el `<button>` navega a la sección vía `navigate()` del router): productos activos (`productsService.list({ limit: 1 })` + leer `.total` — no se trae la lista completa solo para contar, ya que Products sí pagina), categorías (`categoriesService.list().length` — acá sí hace falta el array completo porque `findAll()` no pagina ni devuelve total), usuarios (solo si ADMIN, mismo motivo que categorías), rol del usuario actual (tarjeta estática, no clickeable, sin sentido de navegación)
- [x] Fetch de conteo de usuarios separado del `Promise.all` de productos/categorías — si fuera parte del mismo `Promise.all`, un USER (403 en `/users`) rompería también los conteos de productos/categorías, porque `Promise.all` rechaza entero si cualquier promesa interna rechaza

**Archivo:** `src/views/dashboard.view.js` — `initDashboardView(root)`.

Refactorizado en Fase 12 (cards con iconos SVG, activity feed con
últimos movimientos, estado vacío).

**Criterio de cierre:** pantalla post-login con conteos reales de cada
recurso y accesos rápidos funcionales. Probado end-to-end con
éxito (incluida la corrección del bug de re-render tras cambio de
usuario, ver abajo).

---

## FASE 11 — Pulido final 🚧

- [x] Estados vacíos consistentes en todas las tablas (agregados en
      Fase 12 con el rediseño: `.table-empty`, `.categories-empty`,
      `.activity-empty`, `.inventory-empty`)
- [x] Revisar que ningún dato sensible (`password`) se filtre a la
      consola o al DOM en ningún punto (confirmado — la entidad tiene
      `@Column({ select: false })` y el frontend nunca lo pide; además
      el formulario de login se resetea al volver a la pantalla de
      auth, ver Fase 13)
- [ ] Estados de carga (spinners o skeletons) mientras se resuelven
      las requests — parcialmente cubierto con textos "Cargando..."
      pero no hay skeletons reales
- [x] Probar el flujo completo de expiración de sesión: dejar el
      access token vencer (o forzarlo bajando el TTL temporalmente en
      `.env`) y confirmar que el refresh automático de `api.js` lo
      maneja sin que el usuario note nada — verificado en Fase 13,
      incluido el caso en que la cookie del refresh también desaparece
      (lleva al login vía `auth:expired`)
- [ ] Probar la detección de robo de refresh token: usar un token ya
      rotado y confirmar que la UI reacciona bien (te manda a login)
      cuando el backend revoca todo
- [ ] `npm run build` en `frontend/` genera el output en la carpeta
      que sirve NestJS, y `npm run start:prod` del backend sirve el
      frontend ya compilado, funcionando de punta a punta. **Ojo:** la
      cookie del refresh token es `secure` cuando
      `NODE_ENV === 'production'` (Decisión 12); probarlo desde
      `http://localhost` (los navegadores la tratan como contexto
      seguro), porque desde otro host por HTTP la cookie no se guarda
      y `silentRefresh()` fallaría siempre
- [x] Validar `minPrice > maxPrice` en cliente antes de mandar al
      backend (resuelto en Fase 13, ver Fase 6)
- [x] Confirmar que todas las vistas (no solo Dashboard) se comportan
      bien tras un logout→login como otro usuario, ahora que
      `refreshCurrentRoute()` existe — verificado en Fase 12 con las
      6 vistas

---

## FASE 12 — Refactor de UI y branding "Stockly" ✅

Refactor completo de UI/UX sobre las 6 vistas ya funcionales, más
pantalla de auth rediseñada, con branding unificado y un lenguaje
visual consistente en todo el dashboard.

### Branding

- [x] Renombrar la app a **Stockly** (era "Mi App" en `<title>` y auth)
- [x] Logo del sidebar: círculo verde con "SK" (antes: texto "MA" plano)
- [x] Logo de la pantalla auth: cuadrado verde 56x56 con "SK"

### App Shell

- [x] Eliminar el `<header class="topbar">` completo — el título
      ahora vive dentro de cada vista
- [x] Reemplazar el botón hamburguesa del topbar por un botón
      flotante (`.mobile-menu-btn`) en content-area, solo visible
      en mobile
- [x] `content-area` ahora es el único scroll container (`overflow: hidden` + `view-root` con `overflow-y: auto`)
- [x] `router.js`: eliminar la línea que seteaba
      `#view-title` — tiraba `TypeError` en cada render tras el
      cambio

### Vista: Mi Perfil

- [x] Layout de 3 tarjetas en grid responsive (mobile 1, tablet 2,
      desktop 3 columnas)
- [x] Tarjeta "Datos personales": avatar con iniciales dinámicas
      (se actualizan al guardar), formulario de nombre, email
      disabled con ayuda
- [x] Tarjeta "Seguridad": cambio de contraseña con validación de
      coincidencia en cliente
- [x] Tarjeta "Detalles de la cuenta": ID (truncado a 8 chars +
      tooltip), estado con badge (Activo/Inactivo), sesión actual
      (leído de `localStorage.lastLogin`), fecha de registro
- [x] Al guardar el nombre, se actualiza el sidebar (`#user-name`) y
      el avatar de la tarjeta sin recargar
- [x] `auth.service.js`: `localStorage.setItem('lastLogin', ...)` para
      alimentar "Sesión actual". _(Fase 13: se escribe solo en
      `login()`, no en `silentRefresh()`, así que muestra el login
      real y no la última recarga de página)_

### Vista: Usuarios

- [x] Avatar con iniciales en cada fila (antes solo texto)
- [x] Badge de rol (Administrador / Usuario) con colores
- [x] Badge de estado (Activo / Inactivo)
- [x] "(vos)" junto al usuario logueado, con estilo sutil (gris claro)
- [x] Acciones con iconos (lápiz / círculo tachado) con tooltip
- [x] `<dialog>` centrado → drawer lateral con la misma
      estructura que Productos y Categorías
- [x] Botón "Desactivar" oculto sobre uno mismo (protección UI)

### Vista: Productos

- [x] Columna Producto con thumb + nombre (placeholder con iniciales
      si no hay `imageUrl`)
- [x] Badge de categoría (gris para "Sin categoría", verde para el
      resto)
- [x] Precio formateado con `formatPrice` (`Intl.NumberFormat`, locale
      `es-VE`, moneda `USD`, 2 decimales — ver Decisión 13)
- [x] Badge de estado (Activo / Inactivo)
- [x] Acciones con iconos
- [x] Anchos de columna definidos para que Precio no se pegue a Estado
- [x] Fila de dos columnas en el drawer para SKU + Precio
- [x] `td.code` (mono, alineado a la izquierda) para SKUs vs.
      `td.num` (mono, alineado a la derecha) para precios

### Vista: Categorías

- [x] Reemplazar tabla por grid de tarjetas con:
  - Avatar con iniciales
  - Nombre, descripción (line-clamp 2, resuelto por CSS)
  - Acciones (editar / eliminar) visibles al hover
- [x] Tarjeta "Nueva categoría" dashed al final del grid (invitación
      visual)
- [x] Estado vacío con CTA "Nueva categoría"
- [x] `<dialog>` centrado → drawer consistente

### Vista: Dashboard

- [x] Cards con iconos (SVG) en lugar de solo números
- [x] Sección "Actividad reciente" (solo admin):
  - Lista de los últimos 5 movimientos de inventario
  - Avatar del usuario, acción, producto, cantidad con signo +/−
    (verde `.is-positive` en entradas, rojo `.is-negative` en salidas,
    **sin signo y gris `.is-neutral` en ajustes**, porque en un ajuste
    la cantidad es el stock final y no un delta)
  - Timestamp relativo ("Hace 2 min", "Ayer") vía `formatRelativeTime`
  - Endpoint nuevo en backend: `GET /inventory/movements/recent`
- [x] Estado vacío con icono + texto + botón "Ir a Inventario"

### Vista: Inventario

- [x] Rediseño completo del flujo de selección:
  - `<select>` de 100 productos → buscador con autocompletado
  - Debounce de 300ms, `limit: 8` resultados
  - Dropdown flotante con thumb + nombre + SKU
  - Card de producto seleccionado con stock actual
  - Botón ✕ para deseleccionar
- [x] Layout de 2 columnas en desktop (form izquierda, historial
      derecha)
- [x] Formulario de movimiento con `quantity-help` contextual según
      tipo
- [x] Historial con badges (Entrada / Salida / Ajuste), cantidad con
      signo, fecha en `.code`
- [x] Anchos de columna definidos en el historial

### Pantalla Auth

- [x] Rediseño con tabs (Ingresar / Registro) en lugar de links
      de texto abajo
- [x] Logo "SK" verde arriba
- [x] Título "Stockly" + subtítulo descriptivo
- [x] Iconos dentro de los inputs (email, password, nombre)
- [x] Botón submit ancho completo con animación fade al cambiar tab
- [x] `auth.view.js`: `switchTab()` centraliza el cambio entre
      formularios con `aria-selected` correcto

---

## FASE 13 — Endurecimiento y deuda técnica ✅

Revisión de código sobre todas las vistas, servicios y archivos de
arranque, ejecutada en cuatro tandas (de más crítico a menos crítico) y
un cierre sobre `router.js`, `main.js` y `api.js`.

### Tanda 1 — Correcciones rápidas

- [x] Dashboard: el activity feed comparaba `ENTRY`/`EXIT`/`ADJUSTMENT`
      en mayúsculas; ahora usa los valores reales en minúsculas (badge,
      signo y color funcionan). Se agregó la clase `.is-neutral` para
      los ajustes
- [x] Usuarios: "(Tú)" → "(vos)", consistente con el voseo del resto
- [x] Código muerto eliminado (`placeholder()` en `main.js`, línea
      comentada de `view-title` en `router.js`)
- [ ] Placeholder "Buscar por nombre o SKU..." de Inventario: el
      backend no filtra por SKU. Queda abierto y ligado al backend (ver
      "Pendientes")

### Tanda 2 — Infraestructura compartida y XSS

- [x] `src/ui/escape.js` (`escapeHtml`, `safeUrl`) aplicado a todos los
      datos dinámicos de las vistas (política en Decisión 14).
      `auth.view.js` no necesita cambios: usa solo `textContent`
- [x] `src/ui/format.js` (`getInitials`, `formatPrice`, `formatDate`,
      `formatDateTime`, `formatDateTimeShort`, `formatRelativeTime`)
      reemplaza las copias locales (`getInitials` estaba duplicada en
      6 archivos)
- [x] `LOCALE = 'es-VE'` / `CURRENCY = 'USD'` centralizados (Decisión 13)
- [x] `getInitials` tolera espacios dobles y nombres vacíos; las fechas
      inválidas muestran `—` en vez de "Invalid Date"
- [x] Categorías: `truncate()` en JS eliminado; la descripción se corta
      solo por CSS (`line-clamp: 2`)

### Tanda 3 — Sesión y router

- [x] `getSessionVersion()` en `auth-store.js` + comparación en el
      refresh en vuelo de `api.js` (no pisa una sesión nueva)
- [x] Evento `auth:expired` emitido desde `tryRefresh` (una sola vez) y
      escuchado en `main.js`; el 401 ya no deja la vista en "No se pudo
      cargar esta sección"
- [x] Hook de cleanup del router + `resetRouter()` (ver Fase 4)
- [x] Inventario: el listener de `document` ya no se acumula en cada
      visita (se remueve en el cleanup)
- [x] `logout()` con `catch` explícito: un error de red no deja al
      usuario atrapado en la app
- [x] `silentRefresh()` limpia la sesión si `/auth/me` falla

### Tanda 4 — Inventario y UX

- [x] Inventario: contadores de secuencia (`searchSeq`, `selectSeq`) y
      descarte de cargas obsoletas (Decisión 10). Se eliminó el
      `AbortController` que se creaba pero nunca se conectaba al fetch
- [x] Sin más `alert()` nativos: Categorías, Productos, Usuarios e
      Inventario tienen un `<p class="auth-error">` propio de la vista,
      con `showError` (4 s) que oculta al `showSuccess` y viceversa
- [x] `src/ui/errors.js` (`getErrorMessage`) usado en todos los
      `catch` de formularios y borrados; los arrays de mensajes de
      `class-validator` se muestran unidos con `·`
- [x] `src/services/query.js` compartido (`buildQuery`); `getRecentMovements`
      ya no interpola `limit` a mano
- [x] Productos: validación `minPrice > maxPrice` y `loadSeq`
- [x] Borrados: el refresco de la lista quedó fuera del `try` del
      borrado, así el mensaje de error nunca miente si el borrado sí
      se hizo
- [x] `lastLogin` solo se escribe en `login()`

### Cierre — `router.js`, `main.js`, `api.js`

- [x] `router.js`: un `ApiError` 401 solo se ignora si la sesión ya se
      limpió; si sigue viva se muestra el fallback de error
- [x] `main.js`: `showAuthScreen()` ahora (1) llama a `resetRouter()`,
      (2) cierra la sidebar mobile, (3) cierra cualquier `<dialog>`
      abierto y (4) resetea los formularios de login y registro
- [x] `main.js`: constante `topbarMenuBtn` renombrada a `mobileMenuBtn`
      (el id del HTML no cambió)
- [x] `api.js`: eliminado el `try/catch` sin efecto (ambas ramas hacían
      `throw err`) alrededor del refresh en `request()`
- [x] Confirmado contra `AuthController`: `/auth/logout` no tiene
      guard, así que `rawRequest` es correcto (Decisión 12)

---

## Pendientes

### Backend

- [ ] **Filtro por `sku`** en `ProductQueryDto` (y su `WHERE`), y recién
      ahí actualizar el placeholder de Inventario. Hasta entonces
      buscar por SKU no devuelve resultados aunque el placeholder lo
      sugiera
- [ ] **Validar `imageUrl`** en el DTO de productos (`@IsUrl` con
      `@IsOptional`). `safeUrl` protege el frontend, pero la
      validación real debería vivir también en la API
- [ ] **Verificar la rotación del refresh token con varias pestañas.**
      `POST /auth/refresh` rota el token en cada uso y `api.js` colapsa
      los refreshes en paralelo solo _dentro de una pestaña_. Si dos
      pestañas refrescan a la vez con la misma cookie, la segunda usa
      un token ya rotado, lo que podría disparar la detección de robo
      (si el service revoca todo) y cerrar ambas sesiones. Depende de
      la implementación de `refreshTokens()` (por ejemplo, si tiene
      una ventana de gracia); no verificado

### Frontend

- [ ] Skeletons o spinners reales en los estados de carga (Fase 11)
- [ ] Probar la detección de robo de refresh token (Fase 11)
- [ ] Probar `npm run build` + `npm run start:prod` de punta a punta
      (Fase 11, con la advertencia de la cookie `secure`)
- [ ] Productos: que el `change` del select de categoría pase por la
      misma validación de rango de precios que los inputs. Hoy, con un
      rango inválido visible, cambiar de categoría recarga usando los
      últimos precios válidos y la pantalla queda desincronizada con lo
      que muestran los inputs
- [ ] Opcional: `showSuccess`/`showError` están repetidos en cuatro
      vistas; extraer a un helper (toast) reduciría la duplicación
- [ ] Opcional: renombrar el id `topbar-menu-btn` a `mobile-menu-btn`
      (HTML y `main.js` a la vez)

---

## Notas sueltas

- **Nada de `localStorage`/`sessionStorage` para el access token** —
  cualquier XSS podría leerlo. Vive en memoria del módulo
  `auth-store.js`. **Excepción:** se usa `localStorage.lastLogin` para
  guardar el timestamp del último login (para mostrar "Sesión actual"
  en Mi Perfil). No es información sensible — solo la fecha. Si el
  usuario limpia el storage pero conserva la cookie, la sesión se
  restaura igual y Mi Perfil muestra `—` en ese campo.
- El **refresh token nunca lo toca JS** — vive solo en la cookie httpOnly,
  el navegador la maneja solo.
- El fetch central (`api.js`) separa tres ramas: caso feliz, 401 con
  refresh + reintento, y error de red — no las mezcla en el mismo
  bloque `catch`.
- `silentRefresh()` devuelve `null` en el caso esperado "no había
  sesión previa" (401 en refresh) y lanza `ApiError` solo en fallos
  reales (red caída, 500). El `boot()` de `main.js` distingue ambos.
- El login y registro comparten la **misma card con tabs**, no dos
  pantallas separadas. El cambio de tab no recarga la página.
- Los **iconos SVG están inline** (no hay librería de iconos). Todos
  siguen el mismo estilo: `stroke-width: 1.75-2`, `fill: none`,
  `stroke-linecap: round`. Consistentes con la dirección visual
  "Ledger".
- El sidebar solo muestra el logo "SK" como círculo verde, no
  como texto plano. Mismo tratamiento que el avatar del usuario abajo
  (`.user-chip`), para coherencia visual.
- **Regla al agregar una vista nueva:** escapar con `escapeHtml` todo
  dato interpolado en `innerHTML`, formatear con `format.js`, mostrar
  errores con `getErrorMessage`, y si la vista registra listeners fuera
  de su propio DOM (`document`, `window`) o timers, devolver una
  función de cleanup desde `init...View`.

---

## Bugs reales encontrados durante el desarrollo (documentados para no repetirlos)

- **Mismatch de mayúsculas/minúsculas en `Role` enum vs. dato en DB**
  (Fase 5): `Role.enum.ts` define los valores en minúsculas (`ADMIN = 'admin'`, `USER = 'user'`). Al promover manualmente un usuario a
  ADMIN con un `UPDATE role = 'ADMIN'` (mayúsculas, escrito a mano en
  SQL), el `RolesGuard` del backend comparaba `'ADMIN'` contra
  `'admin'` y rechazaba con 403 pese a que el usuario "debía" ser
  admin. Corregido el dato en la DB, apareció un segundo bug
  encadenado: `isAdmin()` en `auth-store.js` comparaba
  `currentUser?.role === 'ADMIN'` (también mayúsculas) — el JWT ya
  traía el rol correcto, pero el frontend seguía ocultando el botón
  "Nueva categoría" por el mismo desajuste de casing, ahora del lado
  del cliente. Ambos ajustados a minúsculas. **Moraleja:** nunca
  asumir el casing de un enum sin mirar el archivo real; si se escribe
  un valor a mano en SQL (seeds, fixes manuales), usar el string
  exacto del enum, no una convención "razonable".

- **Mismo bug de casing, ahora con `MovementType`** (Fase 13): el
  activity feed del Dashboard comparaba `'ENTRY'`/`'EXIT'`/`'ADJUSTMENT'`
  mientras el enum real es `'entry'`/`'exit'`/`'adjustment'` (y
  Inventario ya lo usaba bien). Efecto: el badge caía al fallback, el
  label mostraba el valor crudo, el signo `+`/`−` nunca aparecía y la
  cantidad siempre salía verde. Es la segunda vez que pasa con un enum:
  antes de comparar contra un enum, abrir el archivo del enum.

- **Shape de `GET /inventory/.../stock` desactualizado en este
  documento** (Fase 7, ver Decisión 3) — el endpoint cambió de
  `number` plano a `{ productId, stock }` después de escribir este
  TODO, y no se actualizó hasta que se pidió el controller real.
  `inventory.service.js` no se vio afectado porque nunca transformaba
  la respuesta — la discrepancia estaba solo en la documentación, no
  en el código.

- **Centrado de `<dialog>` roto por el reset global** (Fase 5, `* { margin: 0 }` pisa el `margin: auto` que el navegador aplica por
  default a `<dialog>` para centrarlo) — resuelto agregando `margin: auto` explícito en el bloque `dialog { ... }` de `style.css`.

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
  `else` de `if (!routerStarted)` dentro de `showAppScreen`.

- **`#view-title` eliminado pero el router seguía buscándolo**
  (Fase 12): al eliminar el topbar completo de la app shell, la
  línea `document.getElementById('view-title').textContent = route.title`
  en `router.js` seguía ejecutándose y tiraba
  `TypeError: Cannot set properties of null`. Fue el primer error
  visible al recargar después del refactor. Solución: eliminar esa
  línea, el título ahora se renderiza dentro de cada vista (el
  `<h2>` en `.view-header`).

- **Drawer abierto por defecto al cargar la vista** (Fase 12): al
  pasar de `<dialog>` a `<dialog class="drawer">` con `display: flex` en el CSS base, el drawer se mostraba aunque no se hubiera
  llamado a `showModal()`. Causa: la regla `dialog.drawer { display: flex }` pisaba el `display: none` por defecto del
  `<dialog>` cerrado. Solución: mover `display: flex` y
  `flex-direction: column` a `dialog.drawer[open]` — el estado
  cerrado respeta el default del navegador.

- **Botón submit fuera del `<form>` rompía `form.querySelector`**
  (Fase 12): en el primer refactor del drawer, el botón "Guardar"
  estaba fuera del `<form>` con `form="user-form"` como atributo
  HTML5. Funcionaba visualmente, pero
  `form.querySelector('[type="submit"]')` devolvía `null` porque el
  botón no era descendiente del form. Y Chrome tiraba warning de
  accesibilidad por el `label for` que no encontraba su input.
  Solución: envolver body + actions dentro de un único
  `<form class="drawer-form">`.

- **Layout de 3 tarjetas en Mi Perfil desalineadas** (Fase 12): con
  `align-items: start` cada tarjeta tomaba su alto natural, y
  "Detalles de la cuenta" quedaba flotando arriba con un hueco
  abajo. Solución: `align-items: stretch` en el grid + `align-self: start` en la tarjeta que no debe estirarse
  (`.profile-card--static`), + `margin-top: auto` en `.form-actions`
  para empujar los botones al fondo.

- **Confirm dialog aparecía pegado a la esquina** (Fase 12): al
  agregar el `dialog.confirm-dialog` sin `margin: auto` explícito,
  el dialog no se centraba (mismo problema que el bug de Fase 5, en
  otro dialog). Solución: `margin: auto` + reset de padding nativo.

- **Columna de fecha del historial de inventario alineada mal**
  (Fase 12): la fecha estaba como `<td class="num">` (que tiene
  `text-align: right`) cuando debería estar alineada a la izquierda.
  El CSS la empujaba contra la columna "Tipo". Solución: `<td class="code">` (mono + alineado a la izquierda).

- **XSS por interpolación en `innerHTML`** (Fase 13): las vistas
  interpolaban nombres, emails, motivos y `imageUrl` del backend sin
  escapar. Un usuario registrado como `<img src=x onerror=...>`
  ejecutaba código en el navegador de cualquier admin que abriera la
  lista de Usuarios. Aunque el access token vive en memoria, un XSS
  puede llamar a la API con la sesión activa. Solución: `escapeHtml` /
  `safeUrl` (Decisión 14). Trampa fácil de olvidar: las **iniciales**
  también salen del nombre y también se escapan.

- **`AbortController` creado pero nunca conectado** (Fase 13,
  Inventario): `performSearch` creaba el controller pero no pasaba
  `signal` a ningún fetch, así que no cancelaba nada y una búsqueda
  lenta podía pisar los resultados de una más nueva. El documento
  llegó a afirmar que "el abort controller cancela requests
  anteriores", lo cual era falso. Reemplazado por contadores de
  secuencia (Decisión 10). Mismo patrón agregado en Productos
  (`loadSeq`) y en la selección de producto (`selectSeq`).

- **Listener de `document` que se acumulaba** (Fase 13, Inventario):
  el click-fuera del buscador se registraba en `document` en cada
  render de la vista y nunca se removía; tras N visitas había N
  listeners apuntando a elementos ya destruidos. Solución: hook de
  cleanup del router (Fase 4).

- **`import` y `function` con el mismo nombre** (Fase 13): al mover
  `buildQuery` a `query.js`, `products.service.js` quedó con
  `import { buildQuery }` y la función local del mismo nombre.
  JavaScript no lo permite (`Identifier 'buildQuery' has already been
declared`) y, como ese servicio lo importan tres vistas, rompe la app
  entera al cargar. Al extraer una función a un módulo compartido,
  borrar la copia local en el mismo paso.

- **Sesión expirada dejaba la vista en "No se pudo cargar esta
  sección"** (Fase 13): `api.js` limpiaba la sesión pero nadie le
  avisaba a `main.js` para mostrar el login. Solución: evento
  `auth:expired` (Decisión 12). Variante posterior: el router ignoraba
  _cualquier_ 401 asumiendo que el evento ya había llegado; si el 401
  sobrevivía al refresh (sesión aún viva), la vista quedaba en
  "Cargando..." sin explicación. Ahora solo se ignora si
  `!isAuthenticated()`.

- **Estado que sobrevivía al logout o a la expiración** (Fase 13):
  (1) el `confirm-dialog`, que vive en `<body>`, quedaba modal encima
  del login; (2) la sidebar mobile reaparecía abierta en el próximo
  login; (3) la contraseña tipeada seguía en el input del login. Todo
  resuelto en `showAuthScreen()`.

- **Sesión a medias y sesión pisada** (Fase 13): si el refresh
  funcionaba pero `/auth/me` fallaba, quedaba un token seteado sin
  usuario; y un refresh en vuelo durante un logout+login podía
  sobrescribir el token de la sesión nueva con el del usuario
  anterior. Resueltos con la limpieza en `silentRefresh` y con
  `getSessionVersion()`.

- **Mensaje de error de borrado que podía mentir** (Fase 13): el
  refresco de la lista estaba dentro del mismo `try` que el borrado;
  si el borrado funcionaba pero el refresco fallaba, se mostraba
  "Ocurrió un error al eliminar" aunque el registro sí se había
  borrado. Ahora el borrado va en su propio `try` y el refresco
  después.

---

## Cuellos de botella conocidos (documentado para la sección "Known Trade-offs" del README, si se agrega)

Análisis teórico basado en el código, **no medido con datos reales** (el
volumen actual de testing es de pocas decenas de filas, muy por debajo
de donde estos problemas se notarían):

- `ProductQueryDto.name` usa `ILIKE '%texto%'` — el wildcard al
  inicio invalida cualquier índice B-tree normal sobre `name`, forzando
  un seq scan completo con volumen alto. Mitigación de bajo esfuerzo:
  extensión `pg_trgm` + índice GIN sobre `name`.
- `findAll()` de Products usa `getManyAndCount()` — ejecuta el
  `SELECT` y el `COUNT(*)` como dos queries separadas contra el mismo
  `WHERE`, pagando el costo de evaluar los filtros (incluido el `ILIKE`
  de arriba) dos veces por request de listado.
- Paginación de Products vía `OFFSET/LIMIT` (`skip`/`take` de
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
- **Búsqueda de productos en Inventario con `limit: 8`** (Fase 12):
  el autocompletado hace un request por cada 300ms de pausa del
  usuario. Con tráfico alto, esto puede generar muchos requests
  contra `/products?name=...`. Mitigación actual: el límite es bajo
  (8) y las respuestas obsoletas se descartan con `searchSeq`, aunque
  las requests **no se cancelan**. Mejora posible: propagar `signal`
  por `api.js` hasta el `fetch` para cancelarlas de verdad, y/o
  cachear resultados en memoria con un `Map` para queries repetidas.
- **Activity feed del dashboard trae los últimos 5 movimientos de
  TODOS los productos** (Fase 12): si en algún momento hay miles de
  movimientos por hora, este endpoint podría tornarse lento.
  Mitigación actual: `limit=5` por default. Mejora posible: agregar
  un índice descendente sobre `InventoryMovement.createdAt`.
