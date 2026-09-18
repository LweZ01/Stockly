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
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let repository: Mocked<Repository<User>>;

  const mockQueryBuilder = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };

  const mockRepository = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOneBy: vi.fn(),
    preload: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(() => mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('debe hashear el password y crear el usuario', async () => {
      const dto = {
        email: 'test@test.com',
        password: 'plain123',
        name: 'Test',
      };
      const hashedPassword = 'hashed-password';
      const createdEntity = { ...dto, id: 'uuid-1', password: hashedPassword };

      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword as never);
      repository.create.mockReturnValue(createdEntity as User);
      repository.save.mockResolvedValue(createdEntity as User);

      const result = await service.create(dto as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('plain123', 12);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ password: hashedPassword }),
      );
      expect(result).toEqual(createdEntity);
    });
  });

  describe('findOne', () => {
    it('debe retornar el usuario si existe', async () => {
      const user = { id: 'uuid-1', email: 'test@test.com' } as User;
      repository.findOneBy.mockResolvedValue(user);

      const result = await service.findOne('uuid-1');

      expect(result).toEqual(user);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('debe retornar el usuario con password incluido', async () => {
      const user = {
        id: 'uuid-1',
        email: 'test@test.com',
        password: 'hash',
      } as User;
      mockQueryBuilder.getOne.mockResolvedValue(user);

      const result = await service.findByEmail('test@test.com');

      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('user.password');
      expect(result).toEqual(user);
    });
  });

  describe('changePassword', () => {
    it('debe cambiar el password si la contraseña actual es correcta', async () => {
      const user = { id: 'uuid-1', password: 'old-hash' } as User;
      const dto = { currentPassword: 'old123', newPassword: 'new123' };
      const newHash = 'new-hash';

      mockQueryBuilder.getOne.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue(newHash as never);

      await service.changePassword('uuid-1', dto);

      expect(bcrypt.compare).toHaveBeenCalledWith('old123', 'old-hash');
      expect(repository.update).toHaveBeenCalledWith('uuid-1', {
        password: newHash,
      });
    });

    it('debe lanzar UnauthorizedException si la contraseña actual es incorrecta', async () => {
      const user = { id: 'uuid-1', password: 'old-hash' } as User;
      const dto = { currentPassword: 'wrong', newPassword: 'new123' };

      mockQueryBuilder.getOne.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.changePassword('uuid-1', dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('debe hacer soft-delete (isActive: false)', async () => {
      const user = { id: 'uuid-1' } as User;
      repository.findOneBy.mockResolvedValue(user);

      await service.remove('uuid-1');

      expect(repository.update).toHaveBeenCalledWith('uuid-1', {
        isActive: false,
      });
    });
  });
});
