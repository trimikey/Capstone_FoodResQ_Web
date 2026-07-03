import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';

/**
 * Thư viện công thức do đầu bếp (volunteer chuyên môn chef) đóng góp.
 * Công thức công khai có thể tái sử dụng giữa nhiều chiến dịch bếp ăn.
 */
@Injectable()
export class RecipesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** Chỉ đầu bếp (volunteer có chuyên môn chef) hoặc admin mới được đóng góp công thức. */
  private async assertCanAuthor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    if (user.role === 'admin') return;
    if (user.role !== 'volunteer') {
      throw new ForbiddenException('Chỉ đầu bếp hoặc quản trị viên mới được thêm công thức.');
    }
    const chef = await this.prisma.volunteerSpecializationEntry.findFirst({
      where: { volunteer: { userId }, specialization: 'chef' },
      select: { id: true },
    });
    if (!chef) {
      throw new ForbiddenException('Bạn cần có chuyên môn "Đầu bếp" để đóng góp công thức.');
    }
  }

  async create(userId: string, dto: CreateRecipeDto) {
    await this.assertCanAuthor(userId);

    const recipe = await this.prisma.recipe.create({
      data: {
        createdByUserId: userId,
        name: dto.name,
        description: dto.description ?? null,
        servings: dto.servings ?? 0,
        prepMinutes: dto.prepMinutes ?? null,
        cookMinutes: dto.cookMinutes ?? null,
        difficulty: dto.difficulty ?? 'medium',
        instructions: dto.instructions ?? null,
        imageUrls: dto.imageUrls ?? [],
        isPublic: dto.isPublic ?? true,
        ingredients: dto.ingredients?.length
          ? {
              create: dto.ingredients.map((i) => ({
                name: i.name,
                quantity: i.quantity ?? null,
                unit: i.unit ?? null,
                note: i.note ?? null,
              })),
            }
          : undefined,
      },
      include: { ingredients: true },
    });
    return recipe;
  }

  /** Danh sách công thức công khai (có tìm kiếm theo tên), phân trang. */
  async list(query: { search?: string; mine?: boolean; userId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(query.limit ?? 20, 50);

    const where: Prisma.RecipeWhereInput = { deletedAt: null };
    if (query.mine && query.userId) {
      where.createdByUserId = query.userId;
    } else {
      where.isPublic = true;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.recipe.findMany({
        where,
        orderBy: [{ timesUsed: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          servings: true,
          difficulty: true,
          imageUrls: true,
          timesUsed: true,
          isPublic: true,
          createdAt: true,
          createdBy: { select: { fullName: true, avatarUrl: true } },
          _count: { select: { ingredients: true } },
        },
      }),
      this.prisma.recipe.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        ...r,
        imageUrls: Array.isArray(r.imageUrls) ? (r.imageUrls as string[]) : [],
        ingredientCount: r._count.ingredients,
        authorName: r.createdBy.fullName,
        authorAvatar: r.createdBy.avatarUrl,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, deletedAt: null },
      include: {
        ingredients: true,
        createdBy: { select: { fullName: true, avatarUrl: true } },
      },
    });
    if (!recipe) throw new NotFoundException('Không tìm thấy công thức.');
    return {
      ...recipe,
      imageUrls: Array.isArray(recipe.imageUrls) ? (recipe.imageUrls as string[]) : [],
    };
  }

  /** Chỉ tác giả hoặc admin được sửa/xoá. */
  private async assertOwnerOrAdmin(recipeId: string, userId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, deletedAt: null },
      select: { id: true, createdByUserId: true },
    });
    if (!recipe) throw new NotFoundException('Không tìm thấy công thức.');
    if (recipe.createdByUserId === userId) return recipe;
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (me?.role !== 'admin') {
      throw new ForbiddenException('Chỉ tác giả hoặc quản trị viên mới sửa được công thức này.');
    }
    return recipe;
  }

  async update(id: string, userId: string, dto: UpdateRecipeDto) {
    await this.assertOwnerOrAdmin(id, userId);

    const data: Prisma.RecipeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.servings !== undefined) data.servings = dto.servings;
    if (dto.prepMinutes !== undefined) data.prepMinutes = dto.prepMinutes;
    if (dto.cookMinutes !== undefined) data.cookMinutes = dto.cookMinutes;
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty;
    if (dto.instructions !== undefined) data.instructions = dto.instructions;
    if (dto.imageUrls !== undefined) data.imageUrls = dto.imageUrls;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;

    // Nếu gửi kèm ingredients → thay toàn bộ danh sách nguyên liệu
    if (dto.ingredients !== undefined) {
      await this.prisma.$transaction([
        this.prisma.recipeIngredient.deleteMany({ where: { recipeId: id } }),
        this.prisma.recipe.update({
          where: { id },
          data: {
            ...data,
            ingredients: {
              create: dto.ingredients.map((i) => ({
                name: i.name,
                quantity: i.quantity ?? null,
                unit: i.unit ?? null,
                note: i.note ?? null,
              })),
            },
          },
        }),
      ]);
    } else {
      await this.prisma.recipe.update({ where: { id }, data });
    }
    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    await this.assertOwnerOrAdmin(id, userId);
    await this.prisma.recipe.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  async saveRecipeImage(photo: Express.Multer.File): Promise<string> {
    if (!photo) throw new BadRequestException('Thiếu file ảnh.');
    return this.storage.saveImage(photo, 'recipes');
  }
}
