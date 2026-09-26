import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';

import { Product } from './entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import { handlePostgresError } from '../common/utils/postgres-error.util.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

type RedisClient = InstanceType<typeof Redis>;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

const CACHE_TTL_SECONDS = 60;
const CACHE_VERSION_KEY = 'products:cache-version';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject(REDIS_CLIENT)
    private readonly redis: RedisClient,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create({
      ...dto,
      category: dto.categoryId ? ({ id: dto.categoryId } as Category) : null,
    });

    try {
      const saved = await this.productRepository.save(product);
      await this.bumpCacheVersion();
      return saved;
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  async findAll(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const cacheKey = await this.buildListCacheKey(query, page, limit);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        data: Product[];
        total: number;
        page: number;
        limit: number;
      };
    }

    const applyFilters = (
      qb: ReturnType<Repository<Product>['createQueryBuilder']>,
    ) => {
      qb.where('product.isActive = :isActive', { isActive: true });

      if (query.name) {
        qb.andWhere('product.name ILIKE :name', {
          name: `%${escapeLike(query.name)}%`,
        });
      }

      if (query.search) {
        qb.andWhere(
          '(product.name ILIKE :search OR product.sku ILIKE :search)',
          { search: `%${escapeLike(query.search)}%` },
        );
      }

      if (query.categoryId) {
        qb.andWhere('product.categoryId = :categoryId', {
          categoryId: query.categoryId,
        });
      }

      if (query.minPrice !== undefined) {
        qb.andWhere('product.price >= :minPrice', {
          minPrice: query.minPrice,
        });
      }

      if (query.maxPrice !== undefined) {
        qb.andWhere('product.price <= :maxPrice', {
          maxPrice: query.maxPrice,
        });
      }

      return qb;
    };

    const countQb = applyFilters(
      this.productRepository.createQueryBuilder('product'),
    );
    const total = await countQb.getCount();

    const dataQb = applyFilters(
      this.productRepository.createQueryBuilder('product'),
    )
      .leftJoinAndSelect('product.category', 'category')
      .orderBy('product.createdAt', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const data = await dataQb.getMany();

    const result = { data, total, page, limit };

    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      CACHE_TTL_SECONDS,
    );

    return result;
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.findOne(id);

    const { categoryId, ...rest } = dto;

    const product = await this.productRepository.preload({
      id: existing.id,
      ...rest,
      ...(categoryId !== undefined && {
        category: categoryId ? ({ id: categoryId } as Category) : null,
      }),
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    try {
      const saved = await this.productRepository.save(product);
      await this.bumpCacheVersion();
      return saved;
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.productRepository.update(id, { isActive: false });
    await this.bumpCacheVersion();
  }

  private async getCacheVersion(): Promise<number> {
    const version = await this.redis.get(CACHE_VERSION_KEY);
    return version ? Number(version) : 0;
  }

  private async bumpCacheVersion(): Promise<void> {
    await this.redis.incr(CACHE_VERSION_KEY);
  }

  private async buildListCacheKey(
    query: ProductQueryDto,
    page: number,
    limit: number,
  ): Promise<string> {
    const version = await this.getCacheVersion();

    const filterPayload = JSON.stringify({
      name: query.name ?? null,
      search: query.search ?? null,
      categoryId: query.categoryId ?? null,
      minPrice: query.minPrice ?? null,
      maxPrice: query.maxPrice ?? null,
      page,
      limit,
    });

    const hash = createHash('sha1').update(filterPayload).digest('hex');

    return `products:list:v${version}:${hash}`;
  }
}
