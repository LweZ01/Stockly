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
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { CategoriesService } from './categories.service.js';
import { Category } from './entities/category.entity.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: Mocked<Repository<Category>>;

  const mockRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOneBy: vi.fn(),
    preload: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    repository = module.get(getRepositoryToken(Category));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('debe crear y guardar una categoría', async () => {
      const dto = { name: 'Categoría 1' };
      const createdEntity = {
        ...dto,
        id: 'uuid-1',
        products: [],
      } as unknown as Category;

      repository.create.mockReturnValue(createdEntity);
      repository.save.mockResolvedValue(createdEntity);

      const result = await service.create(dto as any);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Categoría 1' }),
      );
      expect(repository.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });
  });

  describe('findOne', () => {
    it('debe retornar la categoría si existe', async () => {
      const category = {
        id: 'uuid-1',
        name: 'Categoría 1',
      } as unknown as Category;
      repository.findOneBy.mockResolvedValue(category);

      const result = await service.findOne('uuid-1');

      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'uuid-1' });
      expect(result).toEqual(category);
    });

    it('debe lanzar NotFoundException si la categoría no existe', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('debe eliminar la categoría si no tiene productos asociados', async () => {
      const category = {
        id: 'uuid-1',
        name: 'Categoría 1',
        products: [],
      } as unknown as Category;
      repository.findOne.mockResolvedValue(category);

      await service.remove('uuid-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        relations: { products: true },
      });
      expect(repository.remove).toHaveBeenCalledWith(category);
    });

    it('debe lanzar ConflictException si la categoría tiene productos asociados', async () => {
      const category = {
        id: 'uuid-1',
        name: 'Categoría 1',
        products: [{ id: 'prod-1', name: 'Producto 1' }],
      } as unknown as Category;
      repository.findOne.mockResolvedValue(category);

      await expect(service.remove('uuid-1')).rejects.toThrow(ConflictException);
    });

    it('debe lanzar NotFoundException si la categoría no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
