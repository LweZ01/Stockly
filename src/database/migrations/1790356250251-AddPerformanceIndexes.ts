import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1758900000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1758900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Extensión necesaria para índices GIN de búsqueda por substring (ILIKE '%texto%') ---
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // --- products: filtro por isActive está presente en el 100% de las queries de /products,
    //     casi siempre combinado con categoryId o price. Un índice compuesto cubre ambos casos
    //     y también sirve para consultas que solo filtran por isActive. ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_active_category"
      ON "products" ("isActive", "categoryId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_active_price"
      ON "products" ("isActive", "price")
    `);

    // --- products: búsqueda ILIKE '%texto%' en name y sku (endpoint público /products) ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_name_trgm"
      ON "products" USING GIN ("name" gin_trgm_ops)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_sku_trgm"
      ON "products" USING GIN ("sku" gin_trgm_ops)
    `);

    // --- inventory_movements: getCurrentStock() y findHistoryByProduct() siempre filtran
    //     por productId y ordenan por createdAt DESC. El índice compuesto cubre ambas queries
    //     sin necesitar un sort adicional en memoria. ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_movements_product_created"
      ON "inventory_movements" ("productId", "createdAt" DESC)
    `);

    // --- inventory_movements: getCurrentStock() busca el último ADJUSTMENT por producto
    //     (WHERE productId = ? AND type = 'ADJUSTMENT' ORDER BY createdAt DESC LIMIT 1).
    //     Un índice parcial es más chico y más rápido que uno general porque solo indexa
    //     las filas de tipo ADJUSTMENT (normalmente una fracción pequeña del total). ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_movements_product_adjustment_created"
      ON "inventory_movements" ("productId", "createdAt" DESC)
      WHERE "type" = 'ADJUSTMENT'
    `);

    // --- findRecentMovements(): ORDER BY createdAt DESC sin filtro de producto ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_movements_created"
      ON "inventory_movements" ("createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_movements_created"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_movements_product_adjustment_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_movements_product_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_sku_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_active_price"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_products_active_category"`,
    );
    // No se elimina la extensión pg_trgm en el down: otras migraciones o índices
    // futuros podrían depender de ella, y DROP EXTENSION es una operación destructiva
    // que afecta a todo el schema, no solo a lo que agregó esta migración.
  }
}
