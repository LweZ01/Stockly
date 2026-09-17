import { ConflictException, BadRequestException } from '@nestjs/common';

interface PostgresError {
  code: string;
}

export function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function handlePostgresError(error: unknown): never {
  if (isPostgresError(error)) {
    switch (error.code) {
      case '23505':
        throw new ConflictException('Ya existe un registro con ese valor');
      case '23503':
        throw new BadRequestException('La referencia indicada no existe');
    }
  }

  throw error;
}
