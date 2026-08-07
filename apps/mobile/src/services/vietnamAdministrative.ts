const BASE_URL = 'https://provinces.open-api.vn/api/v2';

export interface AdministrativeUnit {
  code: number;
  name: string;
  codename?: string;
  division_type?: string;
  province_code?: number;
}

interface ProvinceResponse extends AdministrativeUnit {
  wards?: AdministrativeUnit[] | null;
}

export const FALLBACK_PROVINCES: AdministrativeUnit[] = [
  { code: 92, name: 'Thành phố Cần Thơ' },
  { code: 48, name: 'Thành phố Đà Nẵng' },
  { code: 1, name: 'Thành phố Hà Nội' },
  { code: 31, name: 'Thành phố Hải Phòng' },
  { code: 79, name: 'Thành phố Hồ Chí Minh' },
  { code: 46, name: 'Thành phố Huế' },
  { code: 91, name: 'Tỉnh An Giang' },
  { code: 24, name: 'Tỉnh Bắc Ninh' },
  { code: 96, name: 'Tỉnh Cà Mau' },
  { code: 4, name: 'Tỉnh Cao Bằng' },
  { code: 66, name: 'Tỉnh Đắk Lắk' },
  { code: 11, name: 'Tỉnh Điện Biên' },
  { code: 75, name: 'Tỉnh Đồng Nai' },
  { code: 82, name: 'Tỉnh Đồng Tháp' },
  { code: 52, name: 'Tỉnh Gia Lai' },
  { code: 42, name: 'Tỉnh Hà Tĩnh' },
  { code: 33, name: 'Tỉnh Hưng Yên' },
  { code: 56, name: 'Tỉnh Khánh Hòa' },
  { code: 20, name: 'Tỉnh Lạng Sơn' },
  { code: 12, name: 'Tỉnh Lai Châu' },
  { code: 68, name: 'Tỉnh Lâm Đồng' },
  { code: 15, name: 'Tỉnh Lào Cai' },
  { code: 40, name: 'Tỉnh Nghệ An' },
  { code: 37, name: 'Tỉnh Ninh Bình' },
  { code: 25, name: 'Tỉnh Phú Thọ' },
  { code: 51, name: 'Tỉnh Quảng Ngãi' },
  { code: 22, name: 'Tỉnh Quảng Ninh' },
  { code: 44, name: 'Tỉnh Quảng Trị' },
  { code: 14, name: 'Tỉnh Sơn La' },
  { code: 80, name: 'Tỉnh Tây Ninh' },
  { code: 19, name: 'Tỉnh Thái Nguyên' },
  { code: 38, name: 'Tỉnh Thanh Hóa' },
  { code: 8, name: 'Tỉnh Tuyên Quang' },
  { code: 86, name: 'Tỉnh Vĩnh Long' },
];

export function normalizeAdministrativeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function filterAdministrativeUnits<T extends AdministrativeUnit>(items: T[], query: string) {
  const normalizedQuery = normalizeAdministrativeSearch(query);
  if (!normalizedQuery) return items;
  return items.filter((item) => normalizeAdministrativeSearch(item.name).includes(normalizedQuery));
}

export async function fetchProvinces(signal?: AbortSignal): Promise<AdministrativeUnit[]> {
  try {
    const res = await fetch(`${BASE_URL}/p/`, { signal });
    if (!res.ok) return FALLBACK_PROVINCES;
    const data = (await res.json()) as ProvinceResponse[];
    const provinces = data
      .map((item) => ({
        code: item.code,
        name: item.name,
        codename: item.codename,
        division_type: item.division_type,
      }))
      .filter((item) => Number.isFinite(item.code) && item.name);
    return provinces.length > 0 ? provinces : FALLBACK_PROVINCES;
  } catch {
    return FALLBACK_PROVINCES;
  }
}

export async function fetchWards(provinceCode: number, signal?: AbortSignal): Promise<AdministrativeUnit[]> {
  try {
    const res = await fetch(`${BASE_URL}/p/${provinceCode}?depth=2`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as ProvinceResponse;
    return (data.wards ?? [])
      .map((item) => ({
        code: item.code,
        name: item.name,
        codename: item.codename,
        division_type: item.division_type,
        province_code: item.province_code,
      }))
      .filter((item) => Number.isFinite(item.code) && item.name);
  } catch {
    return [];
  }
}
