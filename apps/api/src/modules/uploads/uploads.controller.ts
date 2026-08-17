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
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { StorageService } from '@/common/storage/storage.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/** Thư mục đích cho phép — tránh client ghi tuỳ ý vào uploads/. */
const FOLDER_BY_KIND: Record<string, string> = {
  listing: 'listings',
  avatar: 'avatars',
  verification: 'verifications',
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
  @ApiOperation({ summary: 'Upload 1 ảnh (listing/avatar/verification) → trả về URL ảnh.' })
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
      throw new BadRequestException(`kind phải là một trong: ${Object.keys(FOLDER_BY_KIND).join(', ')}`);
    }
    // Ảnh listing cần hiển thị đồng nhất trên web + mobile trong môi trường dev
    // đang dùng DB cloud nhưng filesystem local. Nếu trả /uploads/... thì DB vẫn
    // còn path sau khi file local mất/đổi máy, receiver sẽ rơi về fallback.
    // Data URL hơi nặng hơn nhưng bền và render trực tiếp được ở cả <img> lẫn expo-image.
    if (kind === 'listing') {
      return { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` };
    }
    const url = await this.storage.saveImage(file, folder);
    return { url };
  }

  /**
   * Ảnh minh chứng khi ĐĂNG KÝ nhà cung cấp (GPKD/mặt tiền/biển hiệu) —
   * người dùng CHƯA có tài khoản nên không thể yêu cầu JWT. Chỉ nhận ảnh,
   * lưu vào verifications/, giới hạn tốc độ để chống spam.
   */
  @Post('register-evidence')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload ảnh minh chứng lúc đăng ký NCC (không cần đăng nhập).' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadRegisterEvidence(
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
    const url = await this.storage.saveImage(file, 'verifications');
    return { url };
  }
}
