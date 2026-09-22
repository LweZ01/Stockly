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

---

## FASE 0 — Setup del proyecto Vite

- [ ] Crear carpeta `frontend/` en la raíz del proyecto (al lado de `src/`)
- [ ] `npm create vite@latest` dentro de `frontend/`, template **vanilla** (no vanilla-ts, salvo que quieras sumar TS — avisame si es así, cambia varias cosas)
- [ ] Confirmar que corre: `cd frontend && npm install && npm run dev`
- [ ] `vite.config.js`: `server.proxy` con las rutas de API (`/auth`, `/products`, `/categories`, `/users`, `/inventory`) apuntando a `http://localhost:3000` — ver el bloque de ejemplo en la sección de decisiones confirmadas arriba
- [ ] `vite.config.js`: `build.outDir: '../client'` para que el build de producción caiga en `inventory-api/client/`
- [ ] Borrar el boilerplate de ejemplo que trae la plantilla (`counter.js`, logos, etc.)
- [ ] En NestJS: agregar `@nestjs/serve-static`, registrar en `app.module.ts`:
  ```ts
  ServeStaticModule.forRoot({
    rootPath: join(import.meta.dirname, '..', 'client'),
    serveRoot: '/app',
  });
  ```
  Sin `exclude` — como el front vive en `/app` y la API en la raíz, no hay colisión de rutas que evitar.
- [ ] Actualizar `.gitignore` del proyecto: agregar `frontend/node_modules`, `client/` (el build generado)

**Criterio de cierre de fase**: `npm run dev` en `frontend/` levanta una página en blanco sin errores de consola, y una request de prueba (ej. `fetch('/categories')` desde la consola del navegador) le llega a tu API sin bloqueo de CORS. Por separado, con `npm run build` + tu API corriendo, `http://localhost:3000/app` sirve el frontend compilado.

---

## FASE 1 — Estructura base y estilos

- [ ] `index.html`: esqueleto con dos "pantallas" (auth vs app), cada una oculta/visible por clase CSS — no hace falta router de páginas reales, es una SPA de una sola página
- [ ] `src/style.css` (o carpeta `css/` si preferís separar en varios archivos): variables de color/espaciado (`:root { --primary: ...; }`), reset básico, estilos de botones/inputs/tablas reutilizables
- [ ] Sidebar de navegación (HTML estático por ahora, sin lógica) con los links: Dashboard, Productos, Categorías, Inventario, Usuarios, Mi perfil
- [ ] Layout responsive básico: sidebar colapsable en mobile

**Criterio de cierre**: abrís `index.html` en el navegador (vía Vite dev server) y ves el layout completo, sin JS todavía — solo maquetación.

---

## FASE 2 — Capa de comunicación con la API

Esta es la fase más importante para que todo lo demás funcione bien.
Sugiero este orden interno:

- [ ] `src/services/auth-store.js`: módulo con estado en memoria (variables privadas del módulo, no `window`, no `localStorage`) para `accessToken` y `user` actual. Exportar getters/setters: `setSession(token, user)`, `clearSession()`, `getAccessToken()`, `getUser()`, `isAuthenticated()`, `isAdmin()`
- [ ] `src/services/api.js`: cliente `fetch` central
  - [ ] función base que agrega automáticamente el header `Authorization: Bearer <token>` cuando hay token en el store
  - [ ] siempre `credentials: 'include'` (para que viaje la cookie httpOnly del refresh)
  - [ ] manejo de 401: si una request falla por token expirado, intentar `POST /auth/refresh` **una sola vez**, y si funciona, reintentar la request original con el token nuevo. Si el refresh también falla, limpiar la sesión y mandar a la pantalla de login
  - [ ] ojo con refreshes en paralelo: si dos requests fallan con 401 al mismo tiempo, no deberían disparar dos `/auth/refresh` simultáneos — pensá cómo evitar la carrera (pista: una promesa compartida que las demás esperan)
  - [ ] parseo uniforme de errores: tu `HttpExceptionFilter` devuelve `{ statusCode, timestamp, path, message }` — el cliente debería exponer ese `message` de forma fácil de mostrar en la UI (puede venir como string o como array si es de `class-validator`)
- [ ] Funciones de auth específicas (pueden vivir en `api.js` o en un `auth.service.js` aparte):
  - [ ] `login(email, password)` → llama `POST /auth/login`, guarda `accessToken` + `user` en el store
  - [ ] `register(name, email, password)` → llama `POST /auth/register`
  - [ ] `logout()` → llama `POST /auth/logout`, limpia el store
  - [ ] `silentRefresh()` → llama `POST /auth/refresh` al arrancar la app; si funciona, necesitás los datos del usuario para poblar el store. Como no existe `/auth/me`, dos opciones: (a) decodificar el payload del JWT (`sub`, `email`, `role` — no es información sensible, es solo base64) y pedir `GET /users/:id` con ese `sub`, o (b) agregar un endpoint `/auth/me` a tu backend si preferís esa ruta. Decidí cuál y documentalo acá.
- [ ] `src/services/categories.service.js`: wrappers `list()`, `getById(id)`, `create(data)`, `update(id, data)`, `remove(id)` sobre `/categories`
- [ ] `src/services/products.service.js`: igual, pero `list(filters)` arma el query string con `name`, `categoryId`, `minPrice`, `maxPrice`, `page`, `limit`. La respuesta es siempre `{ data, total, page, limit }` (shape confirmado arriba) — no hace falta contemplar otro formato
- [ ] `src/services/inventory.service.js`: `registerMovement(data)`, `getStock(productId)` (devuelve un `number` plano — no lo envuelvas en un objeto al consumirlo), `getHistory(productId)` (cada item ya trae `user` como objeto poblado, listo para mostrar `movement.user.name`)
- [ ] `src/services/users.service.js`: `list()`, `getById(id)`, `update(id, data)`, `changePassword(id, data)`, `remove(id)`

**Criterio de cierre**: desde la consola del navegador podés importar estos módulos (o probarlos con botones temporales) y hacer login/logout/listar categorías contra tu API real, viendo el token viajar correctamente.

---

## FASE 3 — Pantallas de autenticación

- [ ] Formulario de login: email + password, muestra error si falla, redirige a la app si funciona
- [ ] Formulario de registro: name + email + password, redirige a login al crear la cuenta (tu backend no auto-loguea en el registro)
- [ ] Toggle entre login/register sin recargar la página
- [ ] Al arrancar la app (`main.js` o `app.js`): intentar `silentRefresh()` antes de decidir qué pantalla mostrar — si funciona, vas directo a la app; si falla, mostrás el login
- [ ] Pantalla de "cargando" mientras se resuelve ese refresh inicial (para no mostrar un flash de login si en realidad el usuario ya tenía sesión)

**Criterio de cierre**: podés registrarte, loguearte, recargar la página y seguir logueado (gracias al refresh silencioso), y cerrar sesión.

---

## FASE 4 — Router simple + navegación

- [ ] Un router mínimo basado en `location.hash` (`#/products`, `#/categories`, etc.) — no hace falta librería, es un `Map` de nombre → función de render + un listener de `hashchange`
- [ ] Cada ruta define si requiere rol ADMIN (`inventory` y `users` sí, según tu tabla de autorización)
- [ ] Si un usuario no-ADMIN intenta entrar a una ruta ADMIN-only (manualmente por URL), redirigir a dashboard
- [ ] Sidebar: resaltar el link activo, ocultar los links admin-only si el usuario no es ADMIN
- [ ] Botón de logout en la sidebar/topbar

**Criterio de cierre**: navegás entre secciones sin recargar la página, la URL cambia con el hash, y las restricciones de ADMIN se respetan aunque intentes forzar la URL.

---

## FASE 5 — Vista de Categorías (CRUD completo, la más simple)

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

## FASE 6 — Vista de Productos (CRUD + filtros + paginación)

- [ ] Listado en tabla: SKU, nombre, categoría, precio, estado (activo/inactivo)
- [ ] Filtros: input de búsqueda por nombre (con debounce, no una request por tecla), select de categoría
- [ ] Paginación: usando `total`/`page`/`limit` de la respuesta (shape confirmado en Fase 2) para calcular cantidad de páginas y armar los controles de "anterior/siguiente"
- [ ] Crear/editar producto (solo ADMIN): formulario con sku, name, description, price, categoryId (select poblado desde `/categories`), imageUrl
- [ ] Eliminar producto (solo ADMIN) → confirmación (recordá: es soft-delete, así que después de eliminar debería desaparecer del listado activo)
- [ ] Manejo de error 409 (SKU duplicado) con mensaje claro en el formulario

**Criterio de cierre**: podés buscar, filtrar, paginar y hacer CRUD completo de productos.

---

## FASE 7 — Vista de Inventario (la más compleja del dominio)

- [ ] Selector de producto (dropdown con todos los productos)
- [ ] Al seleccionar uno: mostrar stock actual (`GET /inventory/products/:id/stock`, número plano) y tabla de historial de movimientos (`GET /inventory/products/:id/movements`, más reciente primero) — la columna de usuario sale directo de `movement.user.name`/`.email`, sin requests extra
- [ ] Formulario "Registrar movimiento": producto, tipo (ENTRY/EXIT/ADJUSTMENT), cantidad, motivo (opcional)
- [ ] Ayuda visual en el formulario aclarando que en ADJUSTMENT la cantidad es el stock final exacto, no un delta
- [ ] Manejo de error 400 específico cuando un EXIT pide más stock del disponible (mensaje claro, no genérico)
- [ ] Toda esta vista es ADMIN-only a nivel de ruta (ya lo resolviste en Fase 4)

**Criterio de cierre**: podés registrar los tres tipos de movimiento y ver cómo cambia el stock computado y el historial en tiempo real.

---

## FASE 8 — Vista de Usuarios (matriz de permisos ADMIN/self)

Esta vista tiene la lógica de autorización más fina — repasá tu tabla:
GET lista → ADMIN; GET/PATCH `:id` → ADMIN o el propio usuario; PATCH
`:id/password` → solo el propio usuario, ni ADMIN.

- [ ] Listado (ADMIN-only, ya cubierto por la ruta): nombre, email, rol, estado, fecha de registro
- [ ] Editar nombre de otro usuario (ADMIN) → modal simple
- [ ] Desactivar usuario (ADMIN) → confirmación, no eliminar (es soft-delete vía `isActive`)
- [ ] Diferenciar visualmente el usuario logueado en la lista ("(vos)")

**Criterio de cierre**: un ADMIN puede listar, editar nombres y desactivar usuarios (menos a sí mismo, si querés agregar esa protección extra en la UI).

---

## FASE 9 — Vista de Mi Perfil (accesible a cualquier usuario autenticado)

Esta es la única vista de "usuarios" que ve un USER normal.

- [ ] Formulario de datos propios: editar nombre (email no editable, mostralo disabled)
- [ ] Formulario de cambio de contraseña: currentPassword + newPassword, separado del formulario de perfil
- [ ] Actualizar el store (`auth-store.js`) después de editar el nombre, para que la sidebar refleje el cambio sin recargar
- [ ] Manejo de error 401 específico si `currentPassword` es incorrecta

**Criterio de cierre**: cualquier usuario logueado (ADMIN o USER) puede editar su propio nombre y cambiar su contraseña.

---

## FASE 10 — Dashboard

Dejala para el final — es la vista más simple pero tiene sentido
construirla cuando ya existen los servicios de todos los recursos.

- [ ] Tarjetas de resumen: cantidad de productos activos, cantidad de categorías, cantidad de usuarios (solo si ADMIN), rol del usuario actual
- [ ] Accesos rápidos (botones que navegan a otras secciones)

**Criterio de cierre**: es la pantalla que ves justo después de loguearte, con un resumen útil según tu rol.

---

## FASE 11 — Pulido final

- [ ] Estados de carga (spinners o skeletons) mientras se resuelven las requests, para que la UI no se sienta trabada
- [ ] Estados vacíos consistentes en todas las tablas
- [ ] Revisar que ningún dato sensible (password) se filtre a la consola o al DOM en ningún punto
- [ ] Probar el flujo completo de expiración de sesión: dejar el access token vencer (o forzarlo bajando el TTL temporalmente en `.env`) y confirmar que el refresh automático de `api.js` lo maneja sin que el usuario note nada
- [ ] Probar la detección de robo de refresh token: usar un token ya rotado y confirmar que la UI reacciona bien (te manda a login) cuando el backend revoca todo
- [ ] `npm run build` en `frontend/` genera el output en la carpeta que sirve NestJS, y `npm run start:prod` del backend sirve el frontend ya compilado, funcionando de punta a punta

---

## Notas sueltas

- Nada de `localStorage`/`sessionStorage` para el access token — ya headers de autorización y ahora se justifica bien por qué: cualquier XSS podría leerlo.
- El refresh token nunca lo toca JS — vive solo en la cookie httpOnly, el navegador la maneja solo.
- Cuando escribas el fetch central de la Fase 2, pensá primero en el caso feliz, después en el 401, y al final en el error de red (servidor caído) — son tres ramas distintas y conviene no mezclarlas en el mismo bloque `catch`.
