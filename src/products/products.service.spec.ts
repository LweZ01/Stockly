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

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: Mocked<Repository<Product>>;

  const mockRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    preload: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    repository = module.get(getRepositoryToken(Product));
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
  });
});
