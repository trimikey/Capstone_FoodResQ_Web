import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizePlate(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-ZĐ]/g, '')
    .replace(/Đ/g, 'D');
}

@Injectable()
export class OcrService {
  async assertIdCardMatches(file: Express.Multer.File, expectedIdCardNumber: string) {
    const text = await this.readImageText(file, 'eng', '0123456789');
    const expected = normalizeDigits(expectedIdCardNumber);
    const digitRuns = text.match(/\d[\d\s.-]{8,}\d/g) ?? [];
    const candidates = digitRuns
      .map(normalizeDigits)
      .filter((candidate) => candidate.length >= 9 && candidate.length <= 15);

    if (!candidates.some((candidate) => candidate.includes(expected) || expected.includes(candidate))) {
      throw new BadRequestException(
        'OCR không đọc được số CCCD khớp với thông tin đã nhập. Vui lòng chụp lại CCCD rõ số.',
      );
    }
  }

  async assertVehiclePlateMatches(file: Express.Multer.File, expectedVehiclePlate: string) {
    const text = await this.readImageText(file, 'eng', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    const expected = normalizePlate(expectedVehiclePlate);
    const rawTokens = text.match(/[0-9A-ZĐ][0-9A-ZĐ\s.-]{4,}[0-9A-ZĐ]/gi) ?? [];
    const candidates = rawTokens
      .map(normalizePlate)
      .filter((candidate) => candidate.length >= 6 && candidate.length <= 12);

    if (!candidates.some((candidate) => candidate.includes(expected) || expected.includes(candidate))) {
      throw new BadRequestException(
        'OCR không đọc được biển số xe khớp với thông tin đã nhập. Vui lòng chụp lại biển số rõ nét.',
      );
    }
  }

  private async readImageText(
    file: Express.Multer.File,
    language: string,
    charWhitelist: string,
  ): Promise<string> {
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG hoặc WEBP.');

    const dir = await mkdtemp(join(tmpdir(), 'foodresq-ocr-'));
    const imagePath = join(dir, `input.${ext}`);
    try {
      await writeFile(imagePath, file.buffer);
      const { stdout } = await execFileAsync(
        'tesseract',
        [
          imagePath,
          'stdout',
          '-l',
          language,
          '--psm',
          '6',
          '-c',
          `tessedit_char_whitelist=${charWhitelist}`,
        ],
        { timeout: 15_000, maxBuffer: 1024 * 1024 },
      );
      return stdout;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'ENOENT') {
        throw new ServiceUnavailableException(
          'Máy chủ chưa cài Tesseract OCR nên chưa thể xác minh giấy tờ tự động.',
        );
      }
      throw new BadRequestException('Không OCR được ảnh giấy tờ. Vui lòng chụp lại ảnh rõ nét hơn.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
