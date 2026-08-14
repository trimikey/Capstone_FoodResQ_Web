import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeCreateListingSchema } from '../validators';

/** Tạo Date "now + N phút" */
const NOW = new Date('2026-08-07T08:00:00.000Z');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** Base input hợp lệ — override từng field trong mỗi test. */
const VALID_BASE = {
  title: 'Cơm hộp cuối ngày',
  categories: ['cooked_meal'],
  categoryOtherLabel: undefined as string | undefined,
  quantityTotal: 20,
  quantityUnit: 'portion',
  maxPerReservation: 3,
  pickupStartTime: min(60),
  pickupEndTime: min(180),
  expiryTime: min(300),
  pickupAddress: '123 Nguyễn Huệ, Q.1, TP.HCM',
  description: undefined as string | undefined,
  weightPerUnitKg: undefined as number | undefined,
  storageConditions: undefined as string | undefined,
  allergenNotes: undefined as string | undefined,
};

function parse(overrides: Partial<typeof VALID_BASE>) {
  return makeCreateListingSchema(NOW).safeParse({ ...VALID_BASE, ...overrides });
}

function errPaths(overrides: Partial<typeof VALID_BASE>): string[] {
  const r = parse(overrides);
  if (r.success) return [];
  return r.error.issues.map((i) => i.path.join('.'));
}

// ─── categories ───────────────────────────────────────────────────────────────

describe('categories', () => {
  it('accepts a single valid category', () => {
    assert.equal(parse({ categories: ['cooked_meal'] }).success, true);
  });

  it('accepts multiple valid categories', () => {
    assert.equal(parse({ categories: ['bakery', 'fresh_fruit'] }).success, true);
  });

  it('rejects empty array', () => {
    assert.ok(errPaths({ categories: [] }).includes('categories'));
  });

  it('rejects unknown category key', () => {
    assert.ok(errPaths({ categories: ['mystery_food'] }).includes('categories'));
  });

  it('rejects mix of valid and invalid keys', () => {
    assert.ok(errPaths({ categories: ['cooked_meal', 'not_real'] }).includes('categories'));
  });
});

// ─── categoryOtherLabel ───────────────────────────────────────────────────────

describe('categoryOtherLabel when "other" selected', () => {
  it('requires label when other is in categories', () => {
    assert.ok(errPaths({ categories: ['other'], categoryOtherLabel: undefined }).includes('categoryOtherLabel'));
  });

  it('requires label of at least 3 characters', () => {
    assert.ok(errPaths({ categories: ['other'], categoryOtherLabel: 'AB' }).includes('categoryOtherLabel'));
  });

  it('rejects label that is only digits', () => {
    assert.ok(errPaths({ categories: ['other'], categoryOtherLabel: '12345' }).includes('categoryOtherLabel'));
  });

  it('rejects label that is only special characters', () => {
    assert.ok(errPaths({ categories: ['other'], categoryOtherLabel: '!!!@@@' }).includes('categoryOtherLabel'));
  });

  it('accepts valid Vietnamese food name', () => {
    assert.equal(parse({ categories: ['other'], categoryOtherLabel: 'bánh cuốn' }).success, true);
  });

  it('accepts valid ASCII food name', () => {
    assert.equal(parse({ categories: ['other'], categoryOtherLabel: 'snack food' }).success, true);
  });

  it('does not require label when "other" is not selected', () => {
    assert.equal(parse({ categories: ['cooked_meal'], categoryOtherLabel: undefined }).success, true);
  });

  it('rejects label exceeding 100 characters', () => {
    assert.ok(errPaths({ categories: ['other'], categoryOtherLabel: 'á'.repeat(101) }).includes('categoryOtherLabel'));
  });
});

// ─── maxPerReservation vs quantityTotal ───────────────────────────────────────

describe('maxPerReservation ≤ quantityTotal', () => {
  it('rejects when maxPerReservation exceeds quantityTotal', () => {
    assert.ok(errPaths({ quantityTotal: 5, maxPerReservation: 6 }).includes('maxPerReservation'));
  });

  it('accepts when equal', () => {
    assert.equal(parse({ quantityTotal: 5, maxPerReservation: 5 }).success, true);
  });

  it('accepts when less', () => {
    assert.equal(parse({ quantityTotal: 10, maxPerReservation: 3 }).success, true);
  });
});

// ─── integer constraint for discrete units ────────────────────────────────────

describe('quantityTotal integer for discrete units', () => {
  it('rejects decimal with unit "portion"', () => {
    assert.ok(errPaths({ quantityTotal: 5.5, quantityUnit: 'portion' }).includes('quantityTotal'));
  });

  it('rejects decimal with unit "item"', () => {
    assert.ok(errPaths({ quantityTotal: 3.2, quantityUnit: 'item' }).includes('quantityTotal'));
  });

  it('rejects decimal with unit "box"', () => {
    assert.ok(errPaths({ quantityTotal: 10.1, quantityUnit: 'box' }).includes('quantityTotal'));
  });

  it('allows decimal with unit "kg"', () => {
    assert.equal(parse({ quantityTotal: 2.5, quantityUnit: 'kg', maxPerReservation: 1 }).success, true);
  });

  it('allows decimal with unit "liter"', () => {
    assert.equal(parse({ quantityTotal: 5.5, quantityUnit: 'liter', maxPerReservation: 2 }).success, true);
  });
});

// ─── quantityTotal max 10 000 ─────────────────────────────────────────────────

describe('quantityTotal maximum', () => {
  it('rejects above 10 000', () => {
    assert.ok(errPaths({ quantityTotal: 10001 }).includes('quantityTotal'));
  });

  it('accepts exactly 10 000', () => {
    assert.equal(parse({ quantityTotal: 10000 }).success, true);
  });
});

// ─── pickupStartTime ≥ now + 30 min ───────────────────────────────────────────

describe('pickupStartTime minimum lead time', () => {
  it('rejects start time less than 30 min from now', () => {
    assert.ok(errPaths({ pickupStartTime: min(29) }).includes('pickupStartTime'));
  });

  it('accepts start time exactly 30 min from now', () => {
    assert.equal(
      parse({ pickupStartTime: min(30), pickupEndTime: min(60), expiryTime: min(90) }).success,
      true,
    );
  });

  it('accepts start time well in the future', () => {
    assert.equal(parse({ pickupStartTime: min(120) }).success, true);
  });
});

// ─── time ordering ────────────────────────────────────────────────────────────

describe('time ordering rules', () => {
  it('rejects pickupEndTime before pickupStartTime', () => {
    assert.ok(errPaths({ pickupStartTime: min(60), pickupEndTime: min(50) }).includes('pickupEndTime'));
  });

  it('rejects expiryTime before pickupEndTime', () => {
    assert.ok(errPaths({ pickupEndTime: min(180), expiryTime: min(120) }).includes('expiryTime'));
  });
});
