/**
 * Test cho phần logic THUẦN của web (lib/*.ts): tính nhân sự chiến dịch, khung giờ
 * nhận hàng, format… Không dựng DOM — component React vẫn kiểm bằng type-check + lint.
 *
 * Chỉ bắt `*.spec.ts` (không `.tsx`) để jest không phải biên dịch JSX và kéo theo
 * toàn bộ hạ tầng test React mà dự án chưa cần.
 *
 * jest + ts-jest có sẵn ở node_modules gốc của workspace, không phải cài thêm.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
