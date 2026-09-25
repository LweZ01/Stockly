import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from './entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import { handlePostgresError } from '../common/utils/postgres-error.util.js';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

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
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    // Los filtros son comunes a la query de datos y a la de conteo.
    // Se aplican sobre un query builder base sin joins ni paginación,
    // así el COUNT nunca carga relaciones que no necesita.
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

    // Query de conteo: sin join, sin skip/take. Postgres puede resolverla
    // con un index-only scan sobre los índices de isActive/categoryId/price.
    const countQb = applyFilters(
      this.productRepository.createQueryBuilder('product'),
    );
    const total = await countQb.getCount();

    // Query de datos: con el join para traer la categoría, paginada.
    // NOTA: cuando hay leftJoinAndSelect + skip/take, TypeORM arma una
    // subquery interna para paginar sin duplicar filas por el join —
    // por eso un COUNT(*) OVER() en esta misma query da el tamaño de
    // la página, no el total real. De ahí la necesidad de separarlo.
    const dataQb = applyFilters(
      this.productRepository.createQueryBuilder('product'),
    )
      .leftJoinAndSelect('product.category', 'category')
      .orderBy('product.createdAt', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const data = await dataQb.getMany();

    return { data, total, page, limit };
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
