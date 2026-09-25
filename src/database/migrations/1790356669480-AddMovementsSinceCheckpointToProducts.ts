import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMovementsSinceCheckpointToProducts1790356669480 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "movementsSinceCheckpoint" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "movementsSinceCheckpoint"
    `);
  }
}
