import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';

import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { handlePostgresError } from '../common/utils/postgres-error.util.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

// ioredis, bajo resolución "nodenext", no expone el named export `Redis`
// como tipo utilizable directamente (solo como valor/namespace). Se usa
// InstanceType<typeof Redis> para obtener el tipo de instancia real.
type RedisClient = InstanceType<typeof Redis>;

const CACHE_TTL_SECONDS = 300; // catálogo pequeño, cambia poco: TTL largo
const CACHE_KEY_ALL = 'categories:all';
const CACHE_KEY_PREFIX_ONE = 'categories:one:';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Inject(REDIS_CLIENT)
    private readonly redis: RedisClient,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoryRepository.create(dto);

    try {
      const saved = await this.categoryRepository.save(category);
      await this.invalidateCache();
      return saved;
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  async findAll(): Promise<Category[]> {
    const cached = await this.redis.get(CACHE_KEY_ALL);
    if (cached) {
      return JSON.parse(cached) as Category[];
    }

    const categories = await this.categoryRepository.find();
    await this.redis.set(
      CACHE_KEY_ALL,
      JSON.stringify(categories),
      'EX',
      CACHE_TTL_SECONDS,
    );

    return categories;
  }

  async findOne(id: string): Promise<Category> {
    const cacheKey = `${CACHE_KEY_PREFIX_ONE}${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Category;
    }

    const category = await this.categoryRepository.findOneBy({ id });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    await this.redis.set(
      cacheKey,
      JSON.stringify(category),
      'EX',
      CACHE_TTL_SECONDS,
    );

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);

    const category = await this.categoryRepository.preload({ id, ...dto });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    try {
      const saved = await this.categoryRepository.save(category);
      await this.invalidateCache(id);
      return saved;
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: { products: true },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    if (category.products.length > 0) {
      throw new ConflictException(
        'No se puede eliminar una categoría con productos asociados',
      );
    }

    await this.categoryRepository.remove(category);
    await this.invalidateCache(id);
  }

  private async invalidateCache(id?: string): Promise<void> {
    const keysToDelete = [CACHE_KEY_ALL];
    if (id) {
      keysToDelete.push(`${CACHE_KEY_PREFIX_ONE}${id}`);
    }
    await this.redis.del(...keysToDelete);
  }
}
