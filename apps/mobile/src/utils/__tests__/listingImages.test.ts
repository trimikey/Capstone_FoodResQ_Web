import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listingImageValues } from '../listingImages';

describe('listingImageValues', () => {
  it('keeps regular image URL arrays', () => {
    assert.deepEqual(listingImageValues(['https://res.cloudinary.com/demo/image.jpg']), [
      'https://res.cloudinary.com/demo/image.jpg',
    ]);
  });

  it('parses stringified image URL arrays', () => {
    assert.deepEqual(
      listingImageValues('["https://res.cloudinary.com/demo/listing-1.jpg"]'),
      ['https://res.cloudinary.com/demo/listing-1.jpg'],
    );
  });

  it('reads Cloudinary secure_url objects', () => {
    assert.deepEqual(
      listingImageValues({ secure_url: 'https://res.cloudinary.com/demo/upload/listing-2.jpg' }),
      ['https://res.cloudinary.com/demo/upload/listing-2.jpg'],
    );
  });

  it('flattens nested object and JSON values', () => {
    const input = [
      { url: 'https://res.cloudinary.com/demo/upload/listing-3.jpg' },
      '{"uri":"https://res.cloudinary.com/demo/upload/listing-4.jpg"}',
    ];

    assert.deepEqual(listingImageValues(input), [
      'https://res.cloudinary.com/demo/upload/listing-3.jpg',
      'https://res.cloudinary.com/demo/upload/listing-4.jpg',
    ]);
  });
});
