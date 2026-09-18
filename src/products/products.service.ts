import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from './entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import { handlePostgresError } from '../common/utils/postgres-error.util.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create({
      ...dto,
      category: dto.categoryId ? ({ id: dto.categoryId } as Category) : null,
    });

    try {
      return await this.productRepository.save(product);
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  async findAll(query: ProductQueryDto) {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true });

    if (query.name) {
      qb.andWhere('product.name ILIKE :name', { name: `%${query.name}%` });
    }

    if (query.categoryId) {
      qb.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    qb.orderBy('product.createdAt', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page: query.page, limit: query.limit };
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
      return await this.productRepository.save(product);
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.productRepository.update(id, { isActive: false });
  }
}
