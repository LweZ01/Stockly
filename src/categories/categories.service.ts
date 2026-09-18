import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { handlePostgresError } from '../common/utils/postgres-error.util.js';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoryRepository.create(dto);

    try {
      return await this.categoryRepository.save(category);
    } catch (error) {
      handlePostgresError(error);
      throw error;
    }
  }

  findAll(): Promise<Category[]> {
    return this.categoryRepository.find();
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOneBy({ id });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);

    const category = await this.categoryRepository.preload({ id, ...dto });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    try {
      return await this.categoryRepository.save(category);
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
  }
}
