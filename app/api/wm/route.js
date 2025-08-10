// app/api/wm/route.js
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs'; // Sharp için Node runtime

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');   // PRIVATE bucket için obje yolu (örn: "uuid.jpg" veya "folder/uuid.jpg")
  const directUrl = searchParams.get('url');  // Eski public URL kayıtları için fallback

  try {
    let imgBuffer;

    if (rawPath) {
      // Sadece güvenli karakterler (bucket adı YOK, yalnızca obje yolu)
      if (!/^[a-zA-Z0-9/_\-.]+$/.test(rawPath)) {
        return NextResponse.json({ error: 'invalid object path' }, { status: 400 });
      }

      // Private bucket'tan indir (bucket adı "images")
      const { data, error } = await supabaseAdmin.storage.from('images').download(rawPath);
      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'download failed' }, { status: 400 });
      }
      imgBuffer = Buffer.from(await data.arrayBuffer());

    } else if (directUrl) {
      // Eski public URL kayıtları için: sadece Supabase domainlerine izin ver
      let u;
      try { u = new URL(directUrl); } catch {
        return NextResponse.json({ error: 'invalid url' }, { status: 400 });
      }
      if (!u.hostname.endsWith('.supabase.co')) {
        return NextResponse.json({ error: 'forbidden origin' }, { status: 403 });
      }

      const r = await fetch(directUrl, { cache: 'no-store' });
      if (!r.ok) {
        return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
      }
      imgBuffer = Buffer.from(await r.arrayBuffer());

    } else {
      return NextResponse.json({ error: 'path or url required' }, { status: 400 });
    }

    // Boyutları al
    const meta = await sharp(imgBuffer).metadata();
    const width  = meta.width  || 1200;
    const height = meta.height || 800;

    // Watermark (diyagonal "do not use")
    const fontSize = Math.max(24, Math.floor(Math.min(width, height) * 0.10));
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="${fontSize}"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          fill="rgba(0,0,0,0.22)"
          font-weight="700"
          transform="rotate(-30, ${width/2}, ${height/2})"
        >do not use</text>
      </svg>
    `;

    const out = await sharp(imgBuffer)
      .composite([{ input: Buffer.from(svg), gravity: 'center' }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return new NextResponse(out, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Disposition': 'inline; filename="wm.jpg"',
      },
    });
  } catch (err) {
    console.error('wm error', err);
    return NextResponse.json({ error: err?.message || 'server error' }, { status: 500 });
  }
}
