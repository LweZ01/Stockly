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
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { ProductsService } from './products.service.js';
import { Product } from './entities/product.entity.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: Mocked<Repository<Product>>;

  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getCount: vi.fn(),
    getMany: vi.fn(),
  };

  const mockRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    preload: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(() => mockQueryBuilder),
  };

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockRepository,
        },
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    repository = module.get(getRepositoryToken(Product));

    // Por defecto: sin versión guardada (0) y cache miss, para que los
    // tests existentes de findAll ejerciten siempre la consulta real.
    mockRedis.get.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('debe crear y guardar un producto', async () => {
      const dto = { sku: 'SKU-1', name: 'Producto 1', price: 10 };
      const createdEntity = { ...dto, id: 'uuid-1', category: null };

      repository.create.mockReturnValue(createdEntity as Product);
      repository.save.mockResolvedValue(createdEntity as Product);

      const result = await service.create(dto as any);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ sku: 'SKU-1', name: 'Producto 1' }),
      );
      expect(repository.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });

    it('debe incrementar la versión de caché tras crear', async () => {
      const dto = { sku: 'SKU-1', name: 'Producto 1', price: 10 };
      const createdEntity = { ...dto, id: 'uuid-1', category: null };

      repository.create.mockReturnValue(createdEntity as Product);
      repository.save.mockResolvedValue(createdEntity as Product);

      await service.create(dto as any);

      expect(mockRedis.incr).toHaveBeenCalledWith('products:cache-version');
    });
  });

  describe('findAll', () => {
    it('debe consultar la base (count + data) y cachear el resultado si no hay caché', async () => {
      const products = [{ id: 'uuid-1', name: 'Producto 1' }];
      mockRedis.get.mockResolvedValue(null); // sin versión ni caché de lista
      mockQueryBuilder.getCount.mockResolvedValue(1);
      mockQueryBuilder.getMany.mockResolvedValue(products);

      const result = await service.findAll({} as any);

      expect(mockQueryBuilder.getCount).toHaveBeenCalled();
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^products:list:v0:/),
        JSON.stringify({ data: products, total: 1, page: 1, limit: 10 }),
        'EX',
        60,
      );
      expect(result).toEqual({ data: products, total: 1, page: 1, limit: 10 });
    });

    it('debe devolver el resultado cacheado sin consultar la base', async () => {
      const cached = {
        data: [{ id: 'uuid-1', name: 'Producto cacheado' }],
        total: 1,
        page: 1,
        limit: 10,
      };
      // Primera llamada a redis.get: versión (null → 0). Segunda: el
      // valor cacheado de la lista para esa key.
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.findAll({} as any);

      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toEqual(cached);
    });

    it('debe usar una key de caché distinta según la versión actual', async () => {
      mockRedis.get
        .mockResolvedValueOnce('3') // versión actual: 3
        .mockResolvedValueOnce(null); // cache miss para esa key versionada
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll({} as any);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^products:list:v3:/),
        expect.any(String),
        'EX',
        60,
      );
    });
  });

  describe('findOne', () => {
    it('debe retornar el producto si existe', async () => {
      const product = { id: 'uuid-1', name: 'Producto 1' };
      repository.findOne.mockResolvedValue(product as Product);

      const result = await service.findOne('uuid-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        relations: { category: true },
      });
      expect(result).toEqual(product);
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('debe incrementar la versión de caché tras actualizar', async () => {
      const existing = { id: 'uuid-1', name: 'Vieja' } as Product;
      const updated = { id: 'uuid-1', name: 'Nueva' } as Product;

      repository.findOne.mockResolvedValue(existing);
      repository.preload.mockResolvedValue(updated);
      repository.save.mockResolvedValue(updated);

      await service.update('uuid-1', { name: 'Nueva' } as any);

      expect(mockRedis.incr).toHaveBeenCalledWith('products:cache-version');
    });
  });

  describe('remove', () => {
    it('debe hacer soft-delete (isActive: false)', async () => {
      const product = { id: 'uuid-1', name: 'Producto 1' };
      repository.findOne.mockResolvedValue(product as Product);
      repository.update.mockResolvedValue({ affected: 1 } as any);

      await service.remove('uuid-1');

      expect(repository.update).toHaveBeenCalledWith('uuid-1', {
        isActive: false,
      });
    });

    it('debe incrementar la versión de caché tras eliminar', async () => {
      const product = { id: 'uuid-1', name: 'Producto 1' };
      repository.findOne.mockResolvedValue(product as Product);
      repository.update.mockResolvedValue({ affected: 1 } as any);

      await service.remove('uuid-1');

      expect(mockRedis.incr).toHaveBeenCalledWith('products:cache-version');
    });
  });
});
