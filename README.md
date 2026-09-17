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
│   │   └── enums/
│   │       └── role.enum.ts
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
│   │       └── update-user.dto.ts
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
- [ ] **Fase 1 — Dominio base**
  - [ ] Enum de roles (`common/enums/role.enum.ts`)
  - [ ] Entidad `User`
  - [x] Entidad `Category`
  - [x] Entidad `Product`
  - [ ] Entidad de movimiento de inventario
  - [ ] Generar y correr migración inicial con las 4 entidades
- [ ] **Fase 2 — Módulo Users**
  - [ ] CRUD básico de usuarios (sin exponer password)
  - [ ] Hasheo de password (bcrypt) en creación/actualización
- [ ] **Fase 3 — Módulo Auth**
  - [ ] Registro
  - [ ] Login (emisión de JWT)
  - [ ] JwtStrategy + JwtAuthGuard
  - [ ] RolesGuard + decorador `@Roles`
  - [ ] Decorador `@CurrentUser`
- [ ] **Fase 4 — Módulo Categories**
  - [ ] CRUD completo
  - [ ] Protección con guards (solo ADMIN puede crear/editar/borrar)
- [ ] **Fase 5 — Módulo Products**
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

- [ ] `enums/role.enum.ts` — `ADMIN`, `USER`
- [ ] `decorators/roles.decorator.ts` — `@Roles(Role.ADMIN)`
- [ ] `decorators/current-user.decorator.ts` — extrae el usuario del `request` (inyectado por JwtStrategy)
- [ ] `guards/jwt-auth.guard.ts` — extiende `AuthGuard('jwt')`
- [ ] `guards/roles.guard.ts` — lee metadata de `@Roles` y compara contra el usuario autenticado
- [ ] `filters/http-exception.filter.ts` — formato uniforme de errores
- [ ] `dto/pagination-query.dto.ts` — `page`, `limit` reutilizable en varios módulos
- ❓ ¿Vas a necesitar un `TransformInterceptor` para envolver todas las respuestas en un formato `{ data, meta }`? (Común en APIs profesionales, pero es una decisión de diseño tuya)

### `users/`

- [ ] `entities/user.entity.ts`
  - ❓ Campos: `id`, `email`, `password`, `name`, `role`, `createdAt`, `updatedAt` — ¿algo más? (ej. `isActive`, `phone`)
  - ❓ ¿`role` como columna `enum` de Postgres o como string con `enum` de TypeScript?
- [ ] `dto/create-user.dto.ts` — validaciones con `class-validator`
- [ ] `dto/update-user.dto.ts` — normalmente `PartialType(CreateUserDto)`, excluyendo password (eso va en un endpoint aparte, típicamente)
- [ ] `users.service.ts`
  - [ ] `create` (hashea password antes de guardar)
  - [ ] `findAll`
  - [ ] `findOne` (por id)
  - [ ] `findByEmail` (usado por Auth, no expuesto por HTTP)
  - [ ] `update`
  - [ ] `remove`
- [ ] `users.controller.ts`
  - ❓ ¿Qué endpoints son solo ADMIN? (ej. listar todos los usuarios, borrar usuarios)
  - ❓ ¿Un usuario puede ver/editar su propio perfil sin ser ADMIN?

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

- [ ] `entities/category.entity.ts`
  - ❓ Campos: `id`, `name`, `description`, `createdAt`, `updatedAt` — ¿suficiente?
  - Relación: `OneToMany` con `Product`
- [ ] `dto/create-category.dto.ts`
- [ ] `dto/update-category.dto.ts`
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
- [ ] `dto/update-product.dto.ts`
- [ ] `dto/product-query.dto.ts` — filtros (`categoryId`, `name`, `minPrice`, `maxPrice`) + paginación (`page`, `limit`)
  - ❓ ¿`findAll` filtra `isActive: true` por defecto, mostrando inactivos solo con un query param explícito (ej. `?includeInactive=true`, restringido a ADMIN)?
- [ ] `products.service.ts`
  - [ ] `create` (resolver `categoryId` → entidad `Category`, o asignar `{ id: categoryId }` directo)
  - [ ] `findAll` (con filtros + paginación + posible `sort`)
  - [ ] `findOne`
  - [ ] `update`
  - [ ] `remove` (soft-delete: `update(id, { isActive: false })`, expuesto como `DELETE` igual)
  - [ ] Manejo de conflicto de `sku` duplicado (capturar violación de constraint → `409 Conflict`)
  - [ ] Cálculo de stock actual por producto (agregado sobre `InventoryMovement`, no cargar todos los movimientos a memoria)
- [ ] `products.controller.ts`
  - ❓ ¿Lectura pública, escritura solo ADMIN?

### `inventory/`

- ❓ Esta es la parte de diseño más abierta del proyecto. Opciones:
  1. **Simple**: `Product.stock` es la única fuente de verdad; `Inventory` solo expone endpoints para sumar/restar stock (`POST /inventory/entry`, `POST /inventory/exit`), sin guardar historial.
  2. **Con historial (recomendado para portafolio)**: existe una entidad `InventoryMovement` (`id`, `product`, `type` [ENTRY/EXIT], `quantity`, `reason`, `createdAt`, `user` que hizo el movimiento) — cada movimiento actualiza el `stock` del producto y queda registrado. Esto demuestra mejor manejo de relaciones, transacciones (`QueryRunner`/`DataSource.transaction`) y lógica de negocio real.
- [ ] `entities/inventory-movement.entity.ts` (si eliges opción 2)
- [ ] `dto/create-movement.dto.ts`
- [ ] `inventory.service.ts`
  - [ ] `registerMovement` — idealmente dentro de una transacción (actualiza stock + crea registro de forma atómica)
  - [ ] `findHistoryByProduct`
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
