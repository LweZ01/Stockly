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
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { InventoryService } from './inventory.service.js';
import { InventoryMovement } from './entities/inventory-movement.entity.js';
import { MovementType } from './enums/movement-type.enum.js';
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
    createQueryBuilder: vi.fn(() => mockStockQueryBuilder),
  };

  // El EntityManager falso que se le pasa al callback de la transacción
  const mockManager = {
    getRepository: vi.fn(() => mockMovementRepository),
    createQueryBuilder: vi.fn(() => mockProductQueryBuilder),
    create: vi.fn(),
    save: vi.fn(),
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
    const product = { id: 'product-1', name: 'Producto 1' };

    it('debe registrar un ENTRY sin validar stock', async () => {
      const dto = {
        productId: 'product-1',
        type: MovementType.ENTRY,
        quantity: 10,
      };
      const createdMovement = { id: 'mov-1', ...dto };

      mockProductQueryBuilder.getOne.mockResolvedValue(product);
      mockManager.create.mockReturnValue(createdMovement);
      mockManager.save.mockResolvedValue(createdMovement);

      const result = await service.registerMovement(dto as any, 'user-1');

      expect(mockProductQueryBuilder.setLock).toHaveBeenCalledWith(
        'pessimistic_write',
      );
      expect(result).toEqual(createdMovement);
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
  });

  describe('findHistoryByProduct', () => {
    it('debe retornar el historial de movimientos del producto', async () => {
      const movements = [{ id: 'mov-1' }, { id: 'mov-2' }];
      mockMovementRepository.find.mockResolvedValue(movements);

      const result = await service.findHistoryByProduct('product-1');

      expect(mockMovementRepository.find).toHaveBeenCalledWith({
        where: { product: { id: 'product-1' } },
        order: { createdAt: 'DESC' },
        relations: { user: true },
      });
      expect(result).toEqual(movements);
    });
  });
});
