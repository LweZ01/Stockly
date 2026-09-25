import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mocked,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { InventoryService } from './inventory.service.js';
import { InventoryMovement } from './entities/inventory-movement.entity.js';
import { MovementType } from './enums/movement-type.enum.js';
import { CHECKPOINT_THRESHOLD } from './constants/checkpoint.constants.js';
import { Product } from '../products/entities/product.entity.js';

describe('InventoryService', () => {
  let service: InventoryService;
  let movementRepository: Mocked<Repository<InventoryMovement>>;
  let dataSource: Mocked<DataSource>;

  // Mock del QueryBuilder usado en getCurrentStock (sobre movementRepo)
  const mockStockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    setParameter: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(),
  };

  // Mock del QueryBuilder usado en registerMovement (sobre Product, con lock)
  const mockProductQueryBuilder = {
    setLock: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };

  const mockMovementRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    findAndCount: vi.fn(),
    createQueryBuilder: vi.fn(() => mockStockQueryBuilder),
  };

  // El EntityManager falso que se le pasa al callback de la transacción
  const mockManager = {
    getRepository: vi.fn(() => mockMovementRepository),
    createQueryBuilder: vi.fn(() => mockProductQueryBuilder),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const mockDataSource = {
    manager: mockManager,
    transaction: vi.fn((callback: any) => callback(mockManager)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: mockMovementRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    movementRepository = module.get(getRepositoryToken(InventoryMovement));
    dataSource = module.get(DataSource);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentStock', () => {
    it('debe retornar 0 si no hay movimientos ni ajustes', async () => {
      mockMovementRepository.findOne.mockResolvedValue(null);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '0' });

      const result = await service.getCurrentStock('product-1');

      expect(result).toBe(0);
    });

    it('debe sumar ENTRY y restar EXIT cuando no hay ADJUSTMENT', async () => {
      mockMovementRepository.findOne.mockResolvedValue(null);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '15' });

      const result = await service.getCurrentStock('product-1');

      expect(result).toBe(15);
    });

    it('debe usar el ADJUSTMENT más reciente como base', async () => {
      const adjustment = {
        id: 'adj-1',
        quantity: 50,
        createdAt: new Date('2026-01-01'),
      };
      mockMovementRepository.findOne.mockResolvedValue(adjustment);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '5' });

      const result = await service.getCurrentStock('product-1');

      expect(result).toBe(55); // 50 (base) + 5 (posteriores)
      expect(mockStockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'movement.createdAt >= :fromDate',
        { fromDate: adjustment.createdAt },
      );
    });
  });

  describe('registerMovement', () => {
    // movementsSinceCheckpoint por debajo del umbral: no dispara checkpoint automático
    const product = {
      id: 'product-1',
      name: 'Producto 1',
      movementsSinceCheckpoint: 0,
    };

    it('debe registrar un ENTRY y calcular el stock actual', async () => {
      const dto = {
        productId: 'product-1',
        type: MovementType.ENTRY,
        quantity: 10,
      };
      const createdMovement = { id: 'mov-1', ...dto };

      mockProductQueryBuilder.getOne.mockResolvedValue(product);
      mockMovementRepository.findOne.mockResolvedValue(null);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '0' });
      mockManager.create.mockReturnValue(createdMovement);
      mockManager.save.mockResolvedValue(createdMovement);

      const result = await service.registerMovement(dto as any, 'user-1');

      expect(mockProductQueryBuilder.setLock).toHaveBeenCalledWith(
        'pessimistic_write',
      );
      expect(result).toEqual(createdMovement);
      // Por debajo del umbral: solo se actualiza el contador, no se crea checkpoint
      expect(mockManager.update).toHaveBeenCalledWith(Product, product.id, {
        movementsSinceCheckpoint: 1,
      });
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      const dto = {
        productId: 'product-inexistente',
        type: MovementType.ENTRY,
        quantity: 10,
      };
      mockProductQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.registerMovement(dto as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si el stock es insuficiente para un EXIT', async () => {
      const dto = {
        productId: 'product-1',
        type: MovementType.EXIT,
        quantity: 100,
      };

      mockProductQueryBuilder.getOne.mockResolvedValue(product);
      mockMovementRepository.findOne.mockResolvedValue(null);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '5' }); // stock actual: 5

      await expect(
        service.registerMovement(dto as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);

      // No debe llegar a crear/guardar ningún movimiento
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('debe permitir un EXIT si hay stock suficiente', async () => {
      const dto = {
        productId: 'product-1',
        type: MovementType.EXIT,
        quantity: 5,
      };
      const createdMovement = { id: 'mov-1', ...dto };

      mockProductQueryBuilder.getOne.mockResolvedValue(product);
      mockMovementRepository.findOne.mockResolvedValue(null);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '10' }); // stock actual: 10
      mockManager.create.mockReturnValue(createdMovement);
      mockManager.save.mockResolvedValue(createdMovement);

      const result = await service.registerMovement(dto as any, 'user-1');

      expect(result).toEqual(createdMovement);
    });

    it('debe resetear el contador sin leer el stock cuando el movimiento es ADJUSTMENT', async () => {
      const dto = {
        productId: 'product-1',
        type: MovementType.ADJUSTMENT,
        quantity: 200,
        reason: 'Conteo físico',
      };
      const createdMovement = { id: 'mov-adj', ...dto };

      mockProductQueryBuilder.getOne.mockResolvedValue(product);
      mockManager.create.mockReturnValue(createdMovement);
      mockManager.save.mockResolvedValue(createdMovement);

      const result = await service.registerMovement(dto as any, 'user-1');

      expect(result).toEqual(createdMovement);
      // Un ADJUSTMENT manual no necesita calcular el stock actual
      expect(mockMovementRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalledWith(Product, product.id, {
        movementsSinceCheckpoint: 0,
      });
    });

    it('debe insertar un ADJUSTMENT de checkpoint automático al alcanzar el umbral', async () => {
      const productAtThreshold = {
        id: 'product-1',
        name: 'Producto 1',
        movementsSinceCheckpoint: CHECKPOINT_THRESHOLD - 1,
      };
      const dto = {
        productId: 'product-1',
        type: MovementType.ENTRY,
        quantity: 10,
      };
      const createdMovement = { id: 'mov-1', ...dto };
      const checkpointMovement = {
        id: 'mov-checkpoint',
        type: MovementType.ADJUSTMENT,
      };

      mockProductQueryBuilder.getOne.mockResolvedValue(productAtThreshold);
      mockMovementRepository.findOne.mockResolvedValue(null);
      mockStockQueryBuilder.getRawOne.mockResolvedValue({ netChange: '20' }); // stock previo: 20

      // Primera llamada a manager.create → el movimiento normal;
      // segunda llamada → el checkpoint automático.
      mockManager.create
        .mockReturnValueOnce(createdMovement)
        .mockReturnValueOnce(checkpointMovement);
      mockManager.save
        .mockResolvedValueOnce(createdMovement)
        .mockResolvedValueOnce(checkpointMovement);

      const result = await service.registerMovement(dto as any, 'user-1');

      expect(result).toEqual(createdMovement);

      // Se creó el checkpoint con el stock resultante (20 + 10 = 30) y sin usuario
      expect(mockManager.create).toHaveBeenNthCalledWith(2, InventoryMovement, {
        type: MovementType.ADJUSTMENT,
        quantity: 30,
        reason: 'Checkpoint automático (mantenimiento interno)',
        product: { id: 'product-1' },
        user: null,
      });
      expect(mockManager.save).toHaveBeenCalledTimes(2);
      expect(mockManager.update).toHaveBeenCalledWith(Product, 'product-1', {
        movementsSinceCheckpoint: 0,
      });
    });
  });

  describe('findHistoryByProduct', () => {
    it('debe retornar el historial paginado del producto', async () => {
      const movements = [{ id: 'mov-1' }, { id: 'mov-2' }];
      mockMovementRepository.findAndCount.mockResolvedValue([movements, 2]);

      const result = await service.findHistoryByProduct('product-1', {
        page: 1,
        limit: 10,
      });

      expect(mockMovementRepository.findAndCount).toHaveBeenCalledWith({
        where: { product: { id: 'product-1' } },
        order: { createdAt: 'DESC' },
        relations: { user: true },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        data: movements,
        total: 2,
        page: 1,
        limit: 10,
      });
    });

    it('calcula skip correctamente para páginas mayores a 1', async () => {
      mockMovementRepository.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.findHistoryByProduct('product-1', {
        page: 3,
        limit: 10,
      });

      expect(mockMovementRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.total).toBe(25);
      expect(result.page).toBe(3);
    });

    it('usa page=1 y limit=10 por defecto si no se especifican', async () => {
      mockMovementRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findHistoryByProduct('product-1', {});

      expect(mockMovementRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('findRecentMovements', () => {
    it('debe retornar los movimientos recientes paginados con producto y usuario', async () => {
      const movements = [{ id: 'mov-1' }, { id: 'mov-2' }];
      mockMovementRepository.findAndCount.mockResolvedValue([movements, 2]);

      const result = await service.findRecentMovements({ page: 1, limit: 10 });

      expect(mockMovementRepository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        relations: { user: true, product: true },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        data: movements,
        total: 2,
        page: 1,
        limit: 10,
      });
    });
  });
});
