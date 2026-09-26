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
import { REDIS_CLIENT } from '../redis/redis.constants.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: Mocked<Repository<Category>>;

  const mockRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOneBy: vi.fn(),
    preload: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockRepository,
        },
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    repository = module.get(getRepositoryToken(Category));

    // Por defecto, cache miss: fuerza a los tests existentes (que no
    // conocen el caché) a ir siempre a la base, salvo que un test
    // específico de caché sobreescriba este mock.
    mockRedis.get.mockResolvedValue(null);
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

    it('debe invalidar el caché del listado tras crear', async () => {
      const dto = { name: 'Categoría 1' };
      const createdEntity = {
        ...dto,
        id: 'uuid-1',
        products: [],
      } as unknown as Category;

      repository.create.mockReturnValue(createdEntity);
      repository.save.mockResolvedValue(createdEntity);

      await service.create(dto as any);

      expect(mockRedis.del).toHaveBeenCalledWith('categories:all');
    });
  });

  describe('findAll', () => {
    it('debe consultar la base y cachear el resultado si no hay caché', async () => {
      const categories = [{ id: 'uuid-1', name: 'Categoría 1' }];
      mockRedis.get.mockResolvedValue(null);
      mockRepository.find.mockResolvedValue(categories);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'categories:all',
        JSON.stringify(categories),
        'EX',
        300,
      );
      expect(result).toEqual(categories);
    });

    it('debe devolver el resultado cacheado sin consultar la base', async () => {
      const cached = [{ id: 'uuid-1', name: 'Categoría cacheada' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));
      mockRepository.find = vi.fn();

      const result = await service.findAll();

      expect(mockRepository.find).not.toHaveBeenCalled();
      expect(result).toEqual(cached);
    });
  });

  describe('findOne', () => {
    it('debe retornar la categoría si existe (cache miss)', async () => {
      const category = {
        id: 'uuid-1',
        name: 'Categoría 1',
      } as unknown as Category;
      repository.findOneBy.mockResolvedValue(category);

      const result = await service.findOne('uuid-1');

      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'uuid-1' });
      expect(result).toEqual(category);
    });

    it('debe devolver la categoría cacheada sin consultar la base', async () => {
      const cached = { id: 'uuid-1', name: 'Categoría cacheada' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.findOne('uuid-1');

      expect(repository.findOneBy).not.toHaveBeenCalled();
      expect(result).toEqual(cached);
    });

    it('debe lanzar NotFoundException si la categoría no existe', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('debe invalidar el listado y el findOne del id actualizado', async () => {
      const existing = { id: 'uuid-1', name: 'Vieja' } as unknown as Category;
      const updated = { id: 'uuid-1', name: 'Nueva' } as unknown as Category;

      repository.findOneBy.mockResolvedValue(existing);
      repository.preload.mockResolvedValue(updated);
      repository.save.mockResolvedValue(updated);

      await service.update('uuid-1', { name: 'Nueva' } as any);

      expect(mockRedis.del).toHaveBeenCalledWith(
        'categories:all',
        'categories:one:uuid-1',
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
      expect(mockRedis.del).toHaveBeenCalledWith(
        'categories:all',
        'categories:one:uuid-1',
      );
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
