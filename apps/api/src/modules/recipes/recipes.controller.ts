import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('Recipes')
@Controller('recipes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RecipesController {
  constructor(private recipesService: RecipesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Thư viện công thức công khai (tìm kiếm + phân trang)' })
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recipesService.list({
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('mine')
  @ApiOperation({ summary: 'Đầu bếp: công thức của tôi' })
  mine(@CurrentUser() user: User, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.recipesService.list({
      mine: true,
      userId: user.id,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết công thức + nguyên liệu' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.recipesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Đầu bếp: tạo công thức mới' })
  create(@CurrentUser() user: User, @Body() dto: CreateRecipeDto) {
    return this.recipesService.create(user.id, dto);
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Đầu bếp: upload ảnh món → trả về URL' })
  async uploadImage(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('Thiếu file ảnh.');
    const url = await this.recipesService.saveRecipeImage(image);
    return { url };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Tác giả: cập nhật công thức (gửi kèm ingredients sẽ thay toàn bộ)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateRecipeDto,
  ) {
    return this.recipesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Tác giả: xoá công thức (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.recipesService.remove(id, user.id);
  }
}
