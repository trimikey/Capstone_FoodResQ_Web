import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { FaceMatchService } from '@/common/face-match/face-match.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private faceMatch: FaceMatchService,
  ) {}

  async getFaceEnrollmentStatus(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { faceImageUrl: true, faceDescriptor: true, idCardImageUrl: true },
    });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

    return {
      enrolled: receiver.faceDescriptor !== null,
      faceImageUrl: receiver.faceImageUrl,
      idCardImageUrl: receiver.idCardImageUrl,
    };
  }

  /**
   * Đăng ký khuôn mặt: chỉ cần MỘT trong hai — selfie hoặc ảnh CCCD
   * (người không có CCCD vẫn đăng ký được bằng selfie).
   * Nếu gửi cả hai thì so khớp chéo selfie ↔ chân dung CCCD để tăng độ tin cậy.
   */
  async enrollFace(
    userId: string,
    idCardPhoto?: Express.Multer.File,
    selfiePhoto?: Express.Multer.File,
  ) {
    if (!idCardPhoto && !selfiePhoto) {
      throw new BadRequestException('A selfie or an ID card photo is required');
    }

    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

    let selfieDescriptor: number[] | null = null;
    if (selfiePhoto) {
      selfieDescriptor = await this.faceMatch.getFaceDescriptor(selfiePhoto);
      if (!selfieDescriptor) {
        throw new BadRequestException(
          'No face detected in the selfie. Please retake with good lighting.',
        );
      }
    }

    let idCardDescriptor: number[] | null = null;
    if (idCardPhoto) {
      idCardDescriptor = await this.faceMatch.getFaceDescriptor(idCardPhoto);
      if (!idCardDescriptor) {
        throw new BadRequestException(
          'No face detected on the ID card photo. Please retake — keep the card flat and sharp.',
        );
      }
    }

    // Gửi cả hai → bắt buộc khớp chéo (chặn dùng CCCD của người khác)
    let matchDistance: number | null = null;
    if (selfieDescriptor && idCardDescriptor) {
      const result = this.faceMatch.compare(selfieDescriptor, idCardDescriptor);
      if (!result.matched) {
        throw new BadRequestException(
          'Selfie does not match the portrait on the ID card. Use your own ID card.',
        );
      }
      matchDistance = result.distance;
    }

    const [idCardUrl, faceUrl] = await Promise.all([
      idCardPhoto ? this.storage.saveImage(idCardPhoto, 'id-cards') : Promise.resolve(null),
      selfiePhoto ? this.storage.saveImage(selfiePhoto, 'faces') : Promise.resolve(null),
    ]);

    // Ưu tiên descriptor từ selfie (chất lượng tốt hơn chân dung in trên thẻ)
    await this.prisma.receiverProfile.update({
      where: { id: receiver.id },
      data: {
        ...(idCardUrl ? { idCardImageUrl: idCardUrl } : {}),
        ...(faceUrl ? { faceImageUrl: faceUrl } : {}),
        faceDescriptor: selfieDescriptor ?? idCardDescriptor!,
      },
    });

    return {
      enrolled: true,
      enrolledWith: selfiePhoto ? ('face' as const) : ('id_card' as const),
      matchDistance,
      message: 'Face enrolled successfully',
    };
  }
}
