import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { StorageService } from '@/common/storage/storage.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/** Thư mục đích cho phép — tránh client ghi tuỳ ý vào uploads/. */
const FOLDER_BY_KIND: Record<string, string> = {
  listing: 'listings',
  avatar: 'avatars',
};

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private storage: StorageService) {}

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload 1 ảnh (listing/avatar) → trả về URL phục vụ qua /uploads.' })
  @ApiQuery({ name: 'kind', enum: Object.keys(FOLDER_BY_KIND), required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadImage(
    @Query('kind') kind: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const folder = FOLDER_BY_KIND[kind];
    if (!folder) {
      throw new BadRequestException('kind phải là "listing" hoặc "avatar".');
    }
    const url = await this.storage.saveImage(file, folder);
    return { url };
  }
}
