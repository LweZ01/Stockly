import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import type { Product } from '../../products/entities/product.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { MovementType } from '../enums/movement-type.enum.js';

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: MovementType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne('Product', (product: Product) => product.movements)
  product: Product;

  @ManyToOne(() => User, { nullable: true })
  user: User | null;

  @CreateDateColumn()
  createdAt: Date;
}
