# Inventory API — Plan Maestro

Proyecto de portafolio: sistema de gestión de inventario con NestJS + TypeORM + PostgreSQL, para demostrar dominio de NestJS (postulación Farmatodo).

> Este README es el mapa del proyecto. Se va a ir marcando `[x]` a medida que completes cada punto. Las preguntas de diseño pendientes están marcadas con `❓` — las iremos respondiendo antes de implementar cada módulo.

---

## Estructura de carpetas

```
inventory-api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── env.ts                   # ✅ config tipada/validada al boot — única fuente de verdad (db + jwt)
│   │   ├── typeorm.config.ts        # ✅ opciones de TypeORM para runtime (AppModule), lee de env.ts
│   │   ├── data-source.ts           # ✅ DataSource para CLI de migraciones (dev/test), lee de env.ts
│   │   └── data-source.prod.ts      # ✅ DataSource para CLI de migraciones (prod), lee de env.ts
│   │
│   ├── database/
│   │   └── migrations/
│   │       └── (archivos generados por TypeORM CLI)
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts
│   │   │   └── current-user.decorator.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/
│   │   │   └── ❓ (transform interceptor para respuestas uniformes, opcional)
│   │   ├── pipes/
│   │   │   └── ❓ (pipes custom si hacen falta, opcional)
│   │   ├── dto/
│   │   │   └── pagination-query.dto.ts
│   │   ├── enums/
│   │   │   └── role.enum.ts
│   │   └── utils/
│   │       └── postgres-error.util.ts
│   │
│   ├── auth/
│   │   ├── auth.module.ts            # ❓ pendiente
│   │   ├── auth.controller.ts        # ❓ pendiente
│   │   ├── auth.service.ts           # ❓ pendiente
│   │   ├── entities/
│   │   │   └── refresh-token.entity.ts  # ❓ pendiente — SIGUIENTE PASO
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts       # ❓ pendiente
│   │   └── dto/
│   │       ├── register.dto.ts       # ❓ pendiente
│   │       └── login.dto.ts          # ❓ pendiente
│   │
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── entities/
│   │   │   └── user.entity.ts
│   │   └── dto/
│   │       ├── create-user.dto.ts
│   │       ├── update-user.dto.ts
│   │       └── change-password.dto.ts
│   │
│   ├── categories/
│   │   ├── categories.module.ts
│   │   ├── categories.controller.ts
│   │   ├── categories.service.ts
│   │   ├── entities/
│   │   │   └── category.entity.ts
│   │   └── dto/
│   │       ├── create-category.dto.ts
│   │       └── update-category.dto.ts
│   │
│   ├── products/
│   │   ├── products.module.ts
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   ├── entities/
│   │   │   └── product.entity.ts
│   │   └── dto/
│   │       ├── create-product.dto.ts
│   │       ├── update-product.dto.ts
│   │       └── product-query.dto.ts   # filtros + paginación
│   │
│   └── inventory/
│       ├── inventory.module.ts
│       ├── inventory.controller.ts
│       ├── inventory.service.ts
│       ├── enums/
│       │   └── movement-type.enum.ts
│       ├── entities/
│       │   └── inventory-movement.entity.ts   # ❓ nombre y modelo a decidir
│       └── dto/
│           └── create-movement.dto.ts
│
├── test/
│   ├── setup-env.ts           # ✅ carga .env.test antes de correr e2e
│   └── utils/
│       └── test-app.ts        # ✅ createTestApp (bootstrap Nest) + truncateAll (limpieza entre tests)
│
├── docker-compose.yml
├── .env
├── .env.test                  # ✅ variables para la DB de test (postgres-test, puerto 5433)
├── .env.example
├── vitest.config.ts           # ✅ unitarios
├── vitest.config.e2e.ts       # ✅ e2e — fileParallelism: false (clave, ver notas), unplugin-swc
├── package.json
└── tsconfig.json
```

---

## TODO general (orden de implementación)

- [x] Setup inicial del proyecto (Nest CLI, ESM, tsconfig)
- [x] Docker Compose con PostgreSQL
- [x] Conexión TypeORM (runtime + data-source para CLI)
- [x] Scripts de migraciones funcionando (probado con `migration:generate`)
- [x] **Fase 1 — Dominio base**
  - [x] Enum de roles (`common/enums/role.enum.ts`)
  - [x] Entidad `User`
  - [x] Entidad `Category`
  - [x] Entidad `Product`
  - [x] Entidad de movimiento de inventario
  - [x] Todos los DTOs (Product, Category, User, InventoryMovement, PaginationQuery)
  - [x] Los 4 `.module.ts` armados (Users, Categories, Products, Inventory) con `forFeature` y exports
  - [x] Generar y correr migración inicial con las 4 entidades — ✅ generada exitosamente (`InitSchema`), tras resolver: import circular Product↔InventoryMovement en ESM (solución: `import type` + string en decorador `@ManyToOne('Product', ...)`) y error de columna `imageUrl` (faltaba `type: 'varchar'` explícito para tipos unión con `null`)
  - ⚠️ Pendiente: correr `npm run migration:run` para aplicarla contra la base de datos
- [ ] **Orden de trabajo actual: módulo por módulo, empezando por Products**
  - [x] **Products** (más avanzado — entidad, DTOs y module ya listos) ← COMPLETO
    - [x] `products.service.ts`
    - [x] `products.controller.ts`
  - [x] **Categories** ← COMPLETO
    - [x] `categories.service.ts`
    - [x] `categories.controller.ts`
  - [x] **Users** ← COMPLETO
    - [x] `users.service.ts`
    - [x] `users.controller.ts`
  - [x] **Inventory** ← COMPLETO (el más complejo: transacciones, locks, cálculo de stock)
    - [x] `inventory.service.ts`
    - [x] `inventory.controller.ts`
  - [ ] **Auth** (al final, depende de Users) ← EN PROGRESO, ÚLTIMO MÓDULO DE DOMINIO
- [x] **Fase 2 — Módulo Users** ✅ COMPLETA
  - [x] CRUD básico de usuarios (sin exponer password)
  - [x] Hasheo de password (bcrypt) en creación/actualización
- [ ] **Fase 3 — Módulo Auth** ← EN PROGRESO
  - [x] Decisiones de diseño cerradas: access + refresh token (rotación en cada uso + detección de reuso), refresh token en tabla dedicada `RefreshToken`, entregado como httpOnly cookie, config JWT centralizada en `env.ts`, login rechaza `isActive:false`
  - [x] `env.ts` creado y centralizado (db + jwt) — `typeorm.config.ts`, `data-source.ts`, `data-source.prod.ts` migrados para usarlo
  - [ ] Entidad `RefreshToken` (id, tokenHash, userId, expiresAt, revokedAt) ← SIGUIENTE PASO
  - [ ] Migración para la nueva tabla `refresh_tokens`
  - [ ] Registro
  - [ ] Login (emisión de JWT access+refresh)
  - [ ] Refresh (rotación + detección de reuso → revoca todos los tokens del usuario si se reusa uno revocado)
  - [ ] Logout (revoca el refresh token actual)
  - [ ] JwtStrategy + JwtAuthGuard
  - [ ] RolesGuard + decorador `@Roles`
  - [ ] Decorador `@CurrentUser`
- [x] **Fase 4 — Módulo Categories** ✅ COMPLETA
  - [x] CRUD completo
  - [ ] Protección con guards (solo ADMIN puede crear/editar/borrar) — pendiente hasta cerrar Auth
- [x] **Fase 5 — Módulo Products** ✅ COMPLETA
  - [x] CRUD completo
  - [x] Relación con Category
  - [x] Filtros (por categoría, por nombre, por rango de precio, etc.)
  - [x] Paginación (con orden determinista por `createdAt`)
- [x] **Fase 6 — Módulo Inventory** ✅ COMPLETA
  - [x] Registro de movimientos (entrada/salida de stock)
  - [x] Actualización de stock del producto asociado
  - [x] Consulta de historial de movimientos
- [ ] **Fase 7 — Transversales**
  - [ ] Filtro global de excepciones (`HttpExceptionFilter`)
  - [x] `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`
  - [ ] Documentación Swagger completa
  - [ ] Manejo de errores consistente (formato de respuesta de error uniforme)
- [x] **Fase 8 — Testing** ✅ COMPLETA para los módulos existentes (falta Auth)
  - [x] Tests unitarios de servicios (Vitest, no Jest) — ✅ 26 tests pasando en 5 archivos: products.service.spec.ts (4), categories.service.spec.ts (6), users.service.spec.ts (7), inventory.service.spec.ts (8, mockeando transacción/EntityManager/lock pesimista), app.controller.spec.ts (1)
  - [x] Tests e2e de los endpoints principales — ✅ **53 tests pasando en 4 archivos**: products.controller.e2e-spec.ts (14), categories.controller.e2e-spec.ts (13), users.controller.e2e-spec.ts (12), inventory.controller.e2e-spec.ts (11)
    - Setup: `.env.test` + `test/setup-env.ts` + `vitest.config.e2e.ts` (Vitest, no Jest — usa `unplugin-swc`) + `test/utils/test-app.ts` (bootstrap + TRUNCATE entre tests)
    - ⚠️ Fix clave: `vitest.config.e2e.ts` necesita `fileParallelism: false` — sin eso, los archivos e2e corren en paralelo contra la misma DB de test y sus TRUNCATE se pisan entre sí (fallos intermitentes)
    - ⚠️ Fix clave: `typeorm.config.ts` no puede usar el glob `entities: [__dirname + '/../**/*.entity{.ts,.js}']` bajo ESM+Vitest (rompe con SyntaxError) — hay que listar las entidades explícitamente como clases importadas
  - [ ] Tests e2e de Auth — pendiente hasta cerrar el módulo
  - [ ] Actualizar e2e existentes para incluir tokens cuando se agreguen guards a Categories/Products/Inventory
- [ ] **Fase 9 — Dockerización de la app**
  - [ ] Dockerfile para la API
  - [ ] docker-compose con API + DB juntas
- [ ] **Fase 10 — Documentación y entrega**
  - [ ] README del proyecto (para el portafolio, distinto a este plan)
  - [ ] Colección de Postman/Insomnia o uso de Swagger como única doc
  - [ ] Diagrama de entidad-relación

---

## TODO detallado por módulo

### `common/` (transversal — se construye progresivamente, no todo de una vez)

- [x] `enums/role.enum.ts` — `ADMIN`, `USER`
- [ ] `decorators/roles.decorator.ts` — `@Roles(Role.ADMIN)`
- [ ] `decorators/current-user.decorator.ts` — extrae el usuario del `request` (inyectado por JwtStrategy)
- [ ] `guards/jwt-auth.guard.ts` — extiende `AuthGuard('jwt')`
- [ ] `guards/roles.guard.ts` — lee metadata de `@Roles` y compara contra el usuario autenticado
- [ ] `filters/http-exception.filter.ts` — formato uniforme de errores
- [x] `dto/pagination-query.dto.ts` — `page` (default 1), `limit` (default 10), reutilizable en varios módulos
- [x] `utils/postgres-error.util.ts` — `handlePostgresError` traduce códigos de error de Postgres (23505 unique, 23503 FK) a excepciones de Nest; mensaje genérico fijo, no específico por campo
- ❓ ¿Vas a necesitar un `TransformInterceptor` para envolver todas las respuestas en un formato `{ data, meta }`? (Común en APIs profesionales, pero es una decisión de diseño tuya)

### `users/`

- [x] `entities/user.entity.ts`
  - ✅ Campos: `id`, `email` (único), `password`, `name`, `role` (string, enum de TS `Role`, default `USER`), `isActive` (default true), `createdAt`, `updatedAt`
  - ✅ `role` es `varchar` simple con enum de TypeScript a nivel de código (no enum de Postgres) — más flexible para agregar roles después
- [x] `dto/create-user.dto.ts` — `email`, `password` (min 8), `name`; SIN `role` (siempre nace USER) ni `isActive` (siempre nace true)
- [x] `dto/update-user.dto.ts` — `PartialType(OmitType(CreateUserDto, ['password']))`, para no permitir cambiar password desde aquí
- [x] `dto/change-password.dto.ts` — `currentPassword` + `newPassword` (min 8), endpoint separado
- [x] `users.service.ts`
  - [x] `create` (hashea password con bcrypt, 12 salt rounds)
  - [x] `findAll` / `findOne` (no exponen password, gracias a `select: false` en la entidad)
  - [x] `findByEmail` (usado por Auth; SÍ trae password vía `addSelect`)
  - [x] `update` (preload + save, sin tocar password)
  - [x] `changePassword` (compara con bcrypt.compare, luego re-hashea; usa helper privado `findOneWithPassword`)
  - [x] `remove` (soft-delete: isActive=false)
- [x] `users.controller.ts`
  - ✅ Sin POST (creación solo vía `/auth/register`)
  - ✅ `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `PATCH /users/:id/password`, `DELETE /users/:id` (204)
  - ✅ `TODO(auth)`: GET/DELETE solo ADMIN; GET/PATCH :id → ADMIN o propio usuario; PATCH /:id/password → solo propio usuario

### `auth/`

- ✅ Diseño elegido: **access + refresh token con rotación y detección de reuso** (misma arquitectura que el proyecto JWT anterior)
- ✅ Refresh token vive en tabla dedicada `RefreshToken` (no columna en `User`), guardando el **hash** del token, nunca el token plano
- ✅ Refresh token se entrega como **httpOnly cookie**; el access token va en el body de la respuesta de login/refresh
- ✅ Rotación: cada `refresh` revoca el token usado y emite un par nuevo
- ✅ Detección de reuso: si se intenta usar un refresh token ya revocado, se revocan **todos** los refresh tokens del usuario (señal de robo de token)
- ✅ Login rechaza usuarios con `isActive: false` (401/403)
- ✅ Config de JWT centralizada en `config/env.ts` (dos secrets distintos: `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`, nunca el mismo secret para ambos)
- [ ] `entities/refresh-token.entity.ts` ← **SIGUIENTE PASO**
  - Campos: `id`, `tokenHash`, `user` (ManyToOne, obligatorio), `expiresAt`, `revokedAt` (nullable, null = activo), `createdAt` (sin `updatedAt`)
- [ ] Migración para la tabla `refresh_tokens`
- [ ] `dto/register.dto.ts`
- [ ] `dto/login.dto.ts`
- [ ] `strategies/jwt.strategy.ts` — valida el access token y retorna el payload/usuario
- [ ] `auth.service.ts`
  - [ ] `register` — crea usuario vía `UsersService`
  - [ ] `login` — valida credenciales, rechaza `isActive:false`, emite access+refresh, guarda hash del refresh
  - [ ] `refresh` — valida hash contra DB (no revocado, no expirado), detecta reuso, rota el par de tokens
  - [ ] `logout` — revoca el refresh token actual
- [ ] `auth.controller.ts`
  - [ ] `POST /auth/register`
  - [ ] `POST /auth/login`
  - [ ] `POST /auth/refresh`
  - [ ] `POST /auth/logout`

### `categories/`

- [x] `entities/category.entity.ts`
  - ✅ Campos: `id`, `name` (único), `description` (nullable), `products` (relación inversa), `createdAt`, `updatedAt`
- [x] `dto/create-category.dto.ts`
- [x] `dto/update-category.dto.ts` — `PartialType(CreateCategoryDto)` vía `@nestjs/swagger`
- [x] `categories.service.ts` — CRUD estándar (patrón idéntico a Products); `remove` bloquea con `ConflictException` si la categoría tiene productos asociados (DELETE real, no soft-delete)
- [x] `categories.controller.ts` — sin guards por ahora (mismo `TODO(auth)`); lectura pública, escritura será solo ADMIN

### `products/`

- [x] `entities/product.entity.ts`
  - ✅ Campos: `id`, `sku` (único), `name`, `description`, `price` (decimal 10,2), `imageUrl`, `isActive` (default true), `category` (relación opcional), `movements`, `createdAt`, `updatedAt`
  - ✅ `stock` **no vive en Product** — se deriva del historial de movimientos en `InventoryMovement`
  - ✅ Relación `ManyToOne` con `Category`, `nullable: true` (categoría opcional)
  - ✅ "Eliminar" un producto = soft-delete (`isActive = false`), nunca DELETE real
- [x] `dto/create-product.dto.ts`
  - ✅ `sku`, `name` obligatorios (`IsString` + `IsNotEmpty`)
  - ✅ `description`, `imageUrl` opcionales
  - ✅ `price`: `IsNumber({ maxDecimalPlaces: 2 })` + `Min(0)`
  - ✅ `categoryId` opcional (`IsUUID`) — no se envía `isActive` (siempre nace `true`)
- [x] `dto/update-product.dto.ts` — `PartialType(CreateProductDto)`
- [x] `dto/product-query.dto.ts` — extiende `PaginationQueryDto` (común) + filtros: `name` (búsqueda parcial ILIKE), `categoryId`, `minPrice`/`maxPrice`
  - ✅ `isActive` por defecto en `findAll`: pendiente definir en el service
- [x] `products.service.ts`
  - [x] `create` (resuelve categoryId → relación; usa `handlePostgresError` en el catch)
  - [x] `findAll` (QueryBuilder: filtros name/categoryId/minPrice/maxPrice + paginación + isActive:true por defecto)
  - [x] `findOne` (con relación category cargada; 404 si no existe)
  - [x] `update` (usa `preload` + `save`, no `update()` directo — maneja categoryId condicionalmente)
  - [x] `remove` (soft-delete: `update(id, { isActive: false })`)
- [x] `products.controller.ts`
  - ✅ Sin guards por ahora (todo público temporalmente) — marcado con `TODO(auth)` en el código para agregar `JwtAuthGuard`/`RolesGuard`/`@Roles(ADMIN)` en POST/PATCH/DELETE cuando se implemente Auth
  - ✅ `POST /products`, `GET /products`, `GET /products/:id`, `PATCH /products/:id`, `DELETE /products/:id` (204 No Content)
  - ✅ `ParseUUIDPipe` en los `:id` para validar formato antes de llegar al service
- [ ] `products.controller.ts`
  - ❓ ¿Lectura pública, escritura solo ADMIN?

### `inventory/`

- ✅ Diseño elegido: **con historial** — `InventoryMovement` registra cada movimiento y el stock se deriva de él (opción 2 del análisis original)
- ✅ Tipos de movimiento: `ENTRY`, `EXIT`, `ADJUSTMENT`
- ✅ Cada movimiento guarda `user` (quién lo hizo, opcional) y `reason` (motivo, texto libre)
- [ ] `enums/movement-type.enum.ts` — ✅ **completado**: `ENTRY = 'entry'`, `EXIT = 'exit'`, `ADJUSTMENT = 'adjustment'`
- [x] `entities/inventory-movement.entity.ts`
  - ✅ Campos: `id`, `type` (`MovementType`), `quantity` (siempre positivo, int), `reason` (nullable), `product` (relación obligatoria), `user` (relación opcional), `createdAt` (sin `updatedAt` — un movimiento no se edita)
  - ⚠️ **Fix aplicado**: import circular con `Product` en ESM resuelto usando `import type { Product }` + `@ManyToOne('Product', (product: Product) => product.movements)` (string en vez de `() => Product`) — este mismo patrón puede hacer falta en `Category ↔ Product` si aparece el mismo error ahí
- [x] `dto/create-movement.dto.ts` — `productId` (UUID), `type` (enum), `quantity` (int, min 0 — permite ADJUSTMENT a cero), `reason` opcional; `user` no va en el DTO, se obtiene del JWT
  - ⚠️ Ajuste temporal: se agregó `userId` (UUID) al DTO mientras no existe Auth/@CurrentUser — marcado con TODO(auth) para quitar después
- [x] `inventory.service.ts`
  - [x] `getCurrentStock` — algoritmo con ADJUSTMENT como punto de referencia (SUM condicional con CASE WHEN vía QueryBuilder + getRawOne); usa `createdAt >=` + `id != adjustmentId` para evitar ambigüedad de timestamps iguales
  - [x] `registerMovement` — transacción completa (`dataSource.transaction`) con lock pesimista (`pessimistic_write`) sobre Product, validación de stock insuficiente para EXIT
  - [x] `findHistoryByProduct` — simple, sin paginar por ahora (posible mejora futura)
  - ⚠️ No inyecta ProductsService — usa QueryBuilder directo sobre Product dentro de la transacción (necesario para el lock)
- [x] `inventory.controller.ts`
  - ✅ `POST /inventory/movements`, `GET /inventory/products/:productId/stock`, `GET /inventory/products/:productId/movements`
  - ⚠️ Temporal: `userId` viene en el body del DTO (create-movement.dto) hasta que exista `@CurrentUser()` — TODO(auth) marcado para quitarlo
  - ✅ `TODO(auth)`: todo el controller quedará restringido a ADMIN

---

## Preguntas de diseño pendientes (❓ resumen)

Todas las decisiones originales ya están cerradas:

1. ✅ `TransformInterceptor`: no se implementó — cada endpoint responde su DTO/entidad tal cual (Products usa `{ data, total, page, limit }` propio en su service, no un interceptor global).
2. ✅ Modelo de `User`: campos cerrados, `role` es string con enum de TS (no enum de Postgres).
3. ✅ Autorización en `users.controller.ts`: perfil propio para cualquier autenticado, gestión de otros solo ADMIN (pendiente de aplicar con guards al cerrar Auth).
4. ✅ Auth: **access + refresh token** con rotación y detección de reuso.
5. ✅ Config de JWT: centralizada en `config/env.ts`.
6. ✅ `categories`: lectura pública, escritura ADMIN (pendiente de aplicar con guards).
7. ✅ `products`: campos cerrados, `stock` se deriva de `Inventory`, lectura pública/escritura ADMIN.
8. ✅ `inventory`: con historial completo (`InventoryMovement` + transacciones + locks).
9. ✅ `inventory`: registrar y ver historial restringido a ADMIN (pendiente de aplicar con guards).

**Nuevas preguntas resueltas para Auth** (ver detalle en la sección `auth/` arriba): tipo de token, ubicación del refresh token, rotación, transporte del refresh token, y manejo de usuarios inactivos.

---

## Notas de contexto del proyecto

- Primera vez usando NestJS en un proyecto real (antes solo tutoriales).
- Proyecto generado con Nest CLI en modo **ESM**.
- ORM: **TypeORM** (con migraciones desde el inicio, no `synchronize`).
- Ya resuelto: conexión a DB, `data-source.ts` para CLI de migraciones, `typeorm-ts-node-esm` requiere `ts-node` como dependencia explícita.
- Metodología: Claude guía con estructura/TODOs/preguntas de diseño; el código lo escribe Jr.

### Fixes técnicos encontrados (para no repetirlos)

- **ESM + glob de entidades**: `entities: [__dirname + '/../**/*.entity{.ts,.js}']` rompe bajo Vitest+ESM (`SyntaxError: Invalid or unexpected token`, Node intenta cargar `.entity.ts` sin transpilar). Solución: listar las entidades explícitamente como clases importadas en `typeorm.config.ts`. El glob en `data-source.ts`/`data-source.prod.ts` (que corren vía `typeorm-ts-node-esm`, con transpilación) sí funciona bien y no hace falta tocarlo.
- **Vitest e2e en paralelo contra DB compartida**: sin `fileParallelism: false` en `vitest.config.e2e.ts`, los archivos de test corren en workers distintos pero comparten la misma base de datos — sus `TRUNCATE` se pisan entre sí y producen fallos intermitentes (aserciones que a veces pasan y a veces no).
- **Scripts npm anidados pierden variables de entorno en Windows**: `dotenv -e .env.test -- npm run migration:run` (que a su vez llama `npm run typeorm -- ...`) puede no propagar las variables inyectadas por `dotenv-cli` al proceso nieto. Solución: colapsar a una sola invocación directa, sin `npm run` intermedio: `dotenv -e .env.test -- typeorm-ts-node-esm -d src/config/data-source.ts migration:run`.
- **`price` como `decimal` en TypeORM**: se devuelve como `number` en las respuestas de este proyecto (verificar si hay un transformer implícito o conversión de `pg`/`class-transformer` — no asumir automáticamente que viene como `string`, como es el comportamiento típico de TypeORM+Postgres sin transformer).
- **Paginación sin `ORDER BY` explícito**: Postgres no garantiza orden de inserción en resultados paginados. `products.service.findAll` agrega `.orderBy('product.createdAt', 'ASC')` para resultados deterministas entre páginas.
