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
│   │   ├── typeorm.config.ts        # opciones de TypeORM para runtime (AppModule)
│   │   ├── data-source.ts           # DataSource para la CLI de migraciones
│   │   └── env.validation.ts        # ❓ validación de variables de entorno (opcional)
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
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       └── login.dto.ts
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
│   └── (e2e tests)
│
├── docker-compose.yml
├── .env
├── .env.example
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
  - [ ] **Categories** ← SIGUIENTE
    - [ ] `categories.service.ts`
    - [ ] `categories.controller.ts`
  - [ ] **Users**
    - [ ] `users.service.ts`
    - [ ] `users.controller.ts`
  - [ ] **Inventory**
    - [ ] `inventory.service.ts`
    - [ ] `inventory.controller.ts`
  - [ ] **Auth** (al final, depende de Users)
- [ ] **Fase 2 — Módulo Users** (detalle en sección de abajo)
  - [ ] CRUD básico de usuarios (sin exponer password)
  - [ ] Hasheo de password (bcrypt) en creación/actualización
- [ ] **Fase 3 — Módulo Auth**
  - [ ] Registro
  - [ ] Login (emisión de JWT)
  - [ ] JwtStrategy + JwtAuthGuard
  - [ ] RolesGuard + decorador `@Roles`
  - [ ] Decorador `@CurrentUser`
- [ ] **Fase 4 — Módulo Categories** (detalle en sección de abajo)
  - [ ] CRUD completo
  - [ ] Protección con guards (solo ADMIN puede crear/editar/borrar)
- [ ] **Fase 5 — Módulo Products** (detalle en sección de abajo)
  - [ ] CRUD completo
  - [ ] Relación con Category
  - [ ] Filtros (por categoría, por nombre, por rango de precio, etc.)
  - [ ] Paginación
- [ ] **Fase 6 — Módulo Inventory**
  - [ ] Registro de movimientos (entrada/salida de stock)
  - [ ] Actualización de stock del producto asociado
  - [ ] Consulta de historial de movimientos
- [ ] **Fase 7 — Transversales**
  - [ ] Filtro global de excepciones (`HttpExceptionFilter`)
  - [ ] `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`
  - [ ] Documentación Swagger completa
  - [ ] Manejo de errores consistente (formato de respuesta de error uniforme)
- [ ] **Fase 8 — Testing**
  - [ ] Tests unitarios de servicios (Jest)
  - [ ] Tests e2e de los endpoints principales
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
- [ ] `users.service.ts`
  - [ ] `create` (hashea password antes de guardar)
  - [ ] `findAll`
  - [ ] `findOne` (por id)
  - [ ] `findByEmail` (usado por Auth, no expuesto por HTTP)
  - [ ] `update`
  - [ ] `remove`
  - ⚠️ Excluir `password` explícitamente al devolver datos al cliente (la columna no tiene `select: false`, así que hay que quitarla manualmente o configurarlo)
- [ ] `users.controller.ts`
  - ✅ Un usuario USER puede ver/editar su propio perfil (no solo ADMIN)
  - ❓ ¿Qué endpoints quedan exclusivos de ADMIN? (ej. listar todos los usuarios, ver/editar/borrar el perfil de otros, cambiar el `role` de un usuario)

### `auth/`

- [ ] `dto/register.dto.ts`
- [ ] `dto/login.dto.ts`
- [ ] `strategies/jwt.strategy.ts` — valida el token y retorna el payload/usuario
- [ ] `auth.service.ts`
  - [ ] `register` — crea usuario vía `UsersService`
  - [ ] `login` — valida credenciales, firma JWT
  - [ ] `validateUser` — usado internamente para comparar password
- [ ] `auth.controller.ts`
  - [ ] `POST /auth/register`
  - [ ] `POST /auth/login`
  - ❓ ¿Vas a implementar refresh tokens (como en tu proyecto JWT anterior) o solo access token simple para este proyecto?
- ❓ ¿Dónde va el secret de JWT y el tiempo de expiración — hardcoded en `.env` nomás, o vale la pena un `JwtConfigModule` dedicado?

### `categories/`

- [x] `entities/category.entity.ts`
  - ✅ Campos: `id`, `name` (único), `description` (nullable), `products` (relación inversa), `createdAt`, `updatedAt`
- [x] `dto/create-category.dto.ts`
- [x] `dto/update-category.dto.ts` — `PartialType(CreateCategoryDto)` vía `@nestjs/swagger`
- [ ] `categories.service.ts` — CRUD estándar
- [ ] `categories.controller.ts`
  - ❓ ¿Lectura (`GET`) pública o requiere estar autenticado? ¿Escritura solo ADMIN?

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
- [ ] `inventory.service.ts`
  - [ ] `registerMovement` — idealmente dentro de una transacción (actualiza stock + crea registro de forma atómica)
  - [ ] `findHistoryByProduct`
  - [ ] Cálculo de stock actual — ✅ algoritmo definido: buscar el `ADJUSTMENT` más reciente del producto (si existe) como punto de referencia, luego sumar `ENTRY` y restar `EXIT` posteriores a esa fecha; si no hay ningún `ADJUSTMENT`, se suma/resta sobre todo el historial desde cero
- [ ] `inventory.controller.ts`
  - ❓ ¿Quién puede registrar movimientos? ¿Solo ADMIN, o también USER?

---

## Preguntas de diseño pendientes (❓ resumen)

Estas son las decisiones que conviene cerrar antes de escribir código de cada módulo. Las iremos resolviendo una por una:

1. ¿Necesitas un `TransformInterceptor` para respuestas uniformes, o cada endpoint responde su DTO tal cual?
2. Modelo de `User`: campos exactos y si `role` es enum de Postgres o string.
3. Reglas de autorización en `users.controller.ts` (¿el propio usuario edita su perfil?).
4. Auth: ¿access token simple o access + refresh token (como tu proyecto JWT anterior)?
5. Dónde vive la config de JWT (secret, expiración).
6. `categories`: ¿lectura pública o requiere login?
7. `products`: campos exactos, si `stock` vive en Product o se deriva de Inventory, reglas de acceso.
8. `inventory`: ¿modelo simple sin historial, o con `InventoryMovement` y transacciones? (recomendado: con historial, por el valor que aporta al portafolio)
9. `inventory`: reglas de quién puede registrar movimientos.

---

## Notas de contexto del proyecto

- Primera vez usando NestJS en un proyecto real (antes solo tutoriales).
- Proyecto generado con Nest CLI en modo **ESM**.
- ORM: **TypeORM** (con migraciones desde el inicio, no `synchronize`).
- Ya resuelto: conexión a DB, `data-source.ts` para CLI de migraciones, `typeorm-ts-node-esm` requiere `ts-node` como dependencia explícita.
- Metodología: Claude guía con estructura/TODOs/preguntas de diseño; el código lo escribe Jr.