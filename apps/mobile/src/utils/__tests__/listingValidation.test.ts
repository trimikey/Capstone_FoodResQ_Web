import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildValidationMessage } from '../listingValidation';

// ─── empty errors ─────────────────────────────────────────────────────────────

describe('buildValidationMessage', () => {
  it('returns empty string when errors object is empty', () => {
    assert.equal(buildValidationMessage({}), '');
  });

  it('formats a single field error with Vietnamese label', () => {
    const result = buildValidationMessage({
      title: { message: 'Nhập tiêu đề', type: 'min' },
    });
    assert.equal(result, '• Tiêu đề: Nhập tiêu đề');
  });

  it('formats multiple field errors as separate bullet lines', () => {
    const result = buildValidationMessage({
      title: { message: 'Nhập tiêu đề', type: 'min' },
      pickupAddress: { message: 'Nhập địa chỉ lấy hàng', type: 'min' },
    });
    assert.equal(result, '• Tiêu đề: Nhập tiêu đề\n• Địa chỉ lấy hàng: Nhập địa chỉ lấy hàng');
  });

  it('falls back to raw field name when field is not in the label map', () => {
    const result = buildValidationMessage({
      unknownField: { message: 'Lỗi không xác định', type: 'custom' },
    } as Parameters<typeof buildValidationMessage>[0]);
    assert.equal(result, '• unknownField: Lỗi không xác định');
  });

  it('skips fields that have no message', () => {
    const result = buildValidationMessage({
      title: { message: 'Nhập tiêu đề', type: 'min' },
      categories: { type: 'min' } as { message?: string; type: string },
    });
    assert.equal(result, '• Tiêu đề: Nhập tiêu đề');
  });
});
