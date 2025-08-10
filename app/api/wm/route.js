// app/api/wm/route.js
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs'; // Sharp için Node runtime

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');   // PRIVATE bucket object path (e.g. "uuid.jpg")
  const directUrl = searchParams.get('url');  // legacy public URL fallback
  const mode = searchParams.get('mode');      // optional: 'thumb' küçült, 'tile' döşe

  try {
    let imgBuffer;

    if (rawPath) {
      if (!/^[a-zA-Z0-9/_\-.]+$/.test(rawPath)) {
        return NextResponse.json({ error: 'invalid object path' }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin.storage.from('images').download(rawPath);
      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'download failed' }, { status: 400 });
      }
      imgBuffer = Buffer.from(await data.arrayBuffer());
    } else if (directUrl) {
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

    const meta = await sharp(imgBuffer).metadata();
    const width  = meta.width  || 1200;
    const height = meta.height || 800;

    // ---- Watermark ayarları: daha görünür ----
    const fontSize = Math.max(32, Math.floor(Math.min(width, height) * 0.12));
    const strokeW = Math.max(2, Math.floor(fontSize / 16));

    // Tek büyük diyagonal yazı
    const svgCenter = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="${fontSize}"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          fill="rgba(0,0,0,0.35)"
          stroke="rgba(255,255,255,0.35)"
          stroke-width="${strokeW}"
          font-weight="800"
          transform="rotate(-30, ${width/2}, ${height/2})"
        >do not use</text>
      </svg>
    `;

    // Tiled (tüm yüzeye döşeme) seçeneği
    const step = Math.max(280, Math.floor(Math.min(width, height) * 0.35));
    const svgTiled = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wm" width="${step}" height="${step}" patternUnits="userSpaceOnUse"
                   patternTransform="rotate(-30 ${step/2} ${step/2})">
            <text x="${step/2}" y="${step/2}"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="${Math.floor(fontSize*0.8)}"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(255,255,255,0.35)"
              stroke-width="${Math.max(2, Math.floor(strokeW*0.9))}"
              font-weight="800">do not use</text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wm)" />
      </svg>
    `;

    let pipeline = sharp(imgBuffer);

    // Thumbnail modu (grid için hızlı)
    if (mode === 'thumb') {
      pipeline = pipeline.resize({ width: Math.min(600, width) });
    }

    const overlay = Buffer.from(mode === 'tile' ? svgTiled : svgCenter);

    const out = await pipeline
      .composite([{ input: overlay }])
      .jpeg({ quality: 90 })
      .toBuffer();

    const headers =
      mode === 'thumb'
        ? { // küçük önizlemelerde cache aç: hızlanır
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=600, s-maxage=600',
            'Content-Disposition': 'inline; filename="wm.jpg"',
          }
        : {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Content-Disposition': 'inline; filename="wm.jpg"',
          };

    return new NextResponse(out, { status: 200, headers });
  } catch (err) {
    console.error('wm error', err);
    return NextResponse.json({ error: err?.message || 'server error' }, { status: 500 });
  }
}
