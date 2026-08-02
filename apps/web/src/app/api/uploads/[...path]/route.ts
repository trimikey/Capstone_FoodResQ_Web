import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // path = ['listings', 'xxx.jpg'], cần thêm /uploads/ prefix
  const filePath = '/uploads/' + path.join('/');

  try {
    const res = await fetch(`${API_BASE}${filePath}`);

    if (!res.ok) {
      return new NextResponse('Not found', { status: 404 });
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Proxy error', { status: 502 });
  }
}
