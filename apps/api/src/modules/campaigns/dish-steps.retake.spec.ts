import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DishStepsService } from './dish-steps.service';

const photo = { mimetype: 'image/jpeg', buffer: Buffer.from('x') } as Express.Multer.File;

function build(step: Record<string, unknown> | null, volunteerId: string | null = 'vol-1') {
  const prisma = {
    campaignDishStep: {
      findUnique: jest.fn().mockResolvedValue(step),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'step-1', ...data })),
    },
    volunteerProfile: {
      findUnique: jest.fn().mockResolvedValue(volunteerId ? { id: volunteerId } : null),
    },
  };
  const storage = { saveImage: jest.fn().mockResolvedValue('https://cdn/new.jpg') };
  const service = new DishStepsService(prisma as never, storage as never, {} as never, {} as never);
  return { service, prisma, storage };
}

const doneStep = (over: Record<string, unknown> = {}) => ({
  id: 'step-1',
  campaignId: 'camp-1',
  stepOrder: 1,
  status: 'done',
  reviewStatus: null,
  completedByVolunteerId: 'vol-1',
  campaign: { status: 'in_progress' },
  ...over,
});

describe('DishStepsService.retakeStepProof', () => {
  it('thay ảnh của khâu đã xong, không đổi trạng thái', async () => {
    const { service, prisma, storage } = build(doneStep());
    await service.retakeStepProof('camp-1', 'user-1', 'step-1', photo);
    expect(storage.saveImage).toHaveBeenCalledTimes(1);
    expect(prisma.campaignDishStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: { proofUrl: 'https://cdn/new.jpg' },
    });
  });

  it('ảnh QC còn chờ duyệt vẫn thay được', async () => {
    const { service, prisma } = build(doneStep({ stepOrder: 3, reviewStatus: 'pending' }));
    await service.retakeStepProof('camp-1', 'user-1', 'step-1', photo);
    expect(prisma.campaignDishStep.update).toHaveBeenCalled();
  });

  it('ảnh QC đã được tổ chức duyệt thì khoá', async () => {
    const { service, storage } = build(doneStep({ stepOrder: 3, reviewStatus: 'approved' }));
    await expect(service.retakeStepProof('camp-1', 'user-1', 'step-1', photo)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('người khác không thay được ảnh của khâu', async () => {
    const { service, storage } = build(doneStep(), 'vol-2');
    await expect(service.retakeStepProof('camp-1', 'user-2', 'step-1', photo)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('khâu chưa xong, chiến dịch đã kết thúc, hoặc thiếu ảnh đều bị chặn', async () => {
    await expect(
      build(doneStep({ status: 'available' })).service.retakeStepProof('camp-1', 'user-1', 'step-1', photo),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      build(doneStep({ campaign: { status: 'completed' } })).service.retakeStepProof('camp-1', 'user-1', 'step-1', photo),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      build(doneStep()).service.retakeStepProof('camp-1', 'user-1', 'step-1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
