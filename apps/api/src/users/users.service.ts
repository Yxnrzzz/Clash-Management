import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { toUserView, UserView } from '../common/user.view';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

/** Password given to accounts created from the Admin panel. */
const DEFAULT_PASSWORD = 'demo1234';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(toUserView);
  }

  async create(dto: CreateUserDto): Promise<UserView> {
    const email = dto.email.trim().toLowerCase();
    await this.assertEmailFree(email);

    const passwordHash = await AuthService.hashPassword(dto.password ?? DEFAULT_PASSWORD);
    const user = await this.prisma.user.create({
      data: { name: dto.name.trim(), email, role: dto.role, passwordHash },
    });

    // Multi-project: a new account starts with no project membership at all.
    // An Admin must assign it to specific projects via
    // POST /projects/:projectId/members (see ProjectsController).
    return toUserView(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserView> {
    await this.getOrThrow(id);

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      await this.assertEmailFree(email, id);
      data.email = email;
    }

    return toUserView(await this.prisma.user.update({ where: { id }, data }));
  }

  async setActive(id: string, isActive: boolean): Promise<UserView> {
    await this.getOrThrow(id);
    return toUserView(await this.prisma.user.update({ where: { id }, data: { isActive } }));
  }

  private async getOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    return user;
  }

  private async assertEmailFree(email: string, exceptId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Email sudah digunakan user lain');
    }
  }
}
