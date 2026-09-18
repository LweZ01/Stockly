import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { InventoryMovement } from './entities/inventory-movement.entity.js';
import { MovementType } from './enums/movement-type.enum.js';
import { Product } from '../products/entities/product.entity.js';
import { CreateMovementDto } from './dto/create-movement.dto.js';

type MovementData = Omit<CreateMovementDto, 'userId'>;

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
  ) {}

  async getCurrentStock(
    productId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<number> {
    const movementRepo = manager.getRepository(InventoryMovement);

    const lastAdjustment = await movementRepo.findOne({
      where: { product: { id: productId }, type: MovementType.ADJUSTMENT },
      order: { createdAt: 'DESC' },
    });

    const stockBase = lastAdjustment ? lastAdjustment.quantity : 0;

    const qb = movementRepo
      .createQueryBuilder('movement')
      .select(
        `COALESCE(SUM(CASE
          WHEN movement.type = :entry THEN movement.quantity
          WHEN movement.type = :exit THEN -movement.quantity
          ELSE 0
        END), 0)`,
        'netChange',
      )
      .where('movement.productId = :productId', { productId })
      .andWhere('movement.type IN (:...types)', {
        types: [MovementType.ENTRY, MovementType.EXIT],
      })
      .setParameter('entry', MovementType.ENTRY)
      .setParameter('exit', MovementType.EXIT);

    if (lastAdjustment) {
      qb.andWhere('movement.createdAt >= :fromDate', {
        fromDate: lastAdjustment.createdAt,
      }).andWhere('movement.id != :adjustmentId', {
        adjustmentId: lastAdjustment.id,
      });
    }

    const result = await qb.getRawOne<{ netChange: string }>();

    return stockBase + Number(result?.netChange ?? 0);
  }

  async registerMovement(
    dto: MovementData,
    userId: string,
  ): Promise<InventoryMovement> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager
        .createQueryBuilder(Product, 'product')
        .setLock('pessimistic_write')
        .where('product.id = :id', { id: dto.productId })
        .getOne();

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      if (dto.type !== MovementType.ADJUSTMENT && dto.quantity <= 0) {
        throw new BadRequestException(
          'quantity debe ser mayor a 0 para ENTRY y EXIT',
        );
      }

      if (dto.type === MovementType.EXIT) {
        const currentStock = await this.getCurrentStock(dto.productId, manager);

        if (currentStock < dto.quantity) {
          throw new BadRequestException('Stock insuficiente');
        }
      }

      const movement = manager.create(InventoryMovement, {
        ...dto,
        product: { id: dto.productId },
        user: { id: userId },
      });

      return manager.save(movement);
    });
  }

  async findHistoryByProduct(productId: string): Promise<InventoryMovement[]> {
    return this.movementRepository.find({
      where: { product: { id: productId } },
      order: { createdAt: 'DESC' },
      relations: { user: true },
    });
  }
}
