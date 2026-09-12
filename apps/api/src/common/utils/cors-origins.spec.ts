import { allowedOrigins, corsOriginDelegate, originMatches } from './cors-origins';

/** Gọi delegate và trả về true nếu origin được cho qua. */
function allows(origin: string | undefined): boolean {
  let allowed = false;
  corsOriginDelegate(origin, (err, ok) => {
    allowed = !err && ok === true;
  });
  return allowed;
}

describe('cors-origins', () => {
  const originalEnv = process.env['ALLOWED_ORIGINS'];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['ALLOWED_ORIGINS'];
    else process.env['ALLOWED_ORIGINS'] = originalEnv;
  });

  describe('originMatches', () => {
    it('khớp tuyệt đối khi entry không có wildcard', () => {
      expect(originMatches('http://localhost:3000', 'http://localhost:3000')).toBe(true);
      expect(originMatches('http://localhost:3000', 'http://localhost:3001')).toBe(false);
    });

    it('wildcard bao domain chính và các preview của cùng project', () => {
      const entry = 'https://capstonefoodresqweb*.vercel.app';
      expect(originMatches(entry, 'https://capstonefoodresqweb.vercel.app')).toBe(true);
      expect(originMatches(entry, 'https://capstonefoodresqweb-git-master-abc.vercel.app')).toBe(true);
    });

    it('wildcard KHÔNG nhảy sang domain/đuôi khác — chỉ khớp ký tự hostname', () => {
      const entry = 'https://capstonefoodresqweb*.vercel.app';
      // dấu chấm không thuộc [a-z0-9-] nên không thể chèn subdomain lạ
      expect(originMatches(entry, 'https://capstonefoodresqweb.evil.com')).toBe(false);
      expect(originMatches(entry, 'https://capstonefoodresqweb.attacker.vercel.app')).toBe(false);
      expect(originMatches(entry, 'https://evil-capstonefoodresqweb.vercel.app')).toBe(false);
    });
  });

  describe('allowedOrigins', () => {
    it('luôn kèm domain của project FE dù env chỉ khai localhost', () => {
      process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000';
      const list = allowedOrigins();
      expect(list).toContain('http://localhost:3000');
      expect(list).toContain('https://capstonefoodresqweb*.vercel.app');
    });

    it('bỏ nháy, khoảng trắng và dấu / cuối khi đọc env', () => {
      process.env['ALLOWED_ORIGINS'] = ' "https://foo.example.com/" , https://bar.example.com ';
      const list = allowedOrigins();
      expect(list).toContain('https://foo.example.com');
      expect(list).toContain('https://bar.example.com');
    });
  });

  describe('corsOriginDelegate', () => {
    it('cho qua domain Vercel MỚI dù env trên server còn domain cũ', () => {
      process.env['ALLOWED_ORIGINS'] =
        'http://localhost:3000,https://capstone-food-res-q-web-web.vercel.app';
      expect(allows('https://capstonefoodresqweb.vercel.app')).toBe(true);
    });

    it('cho qua request không có origin (curl, health check)', () => {
      expect(allows(undefined)).toBe(true);
    });

    it('chặn origin lạ', () => {
      process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000';
      expect(allows('https://evil.example.com')).toBe(false);
    });
  });
});
