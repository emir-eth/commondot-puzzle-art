// app/api/wm/route.js
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // cache kapat

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');
  const directUrl = searchParams.get('url');
  const mode = searchParams.get('mode'); // optional: 'thumb'

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

    // Font'a ihtiyaç duymayan diyagonal "şerit" watermark (her zaman görünür)
    const step = Math.max(60, Math.floor(Math.min(width, height) * 0.08)); // şerit aralığı
    const lineW = Math.max(2, Math.floor(step * 0.12));                   // şerit kalınlığı
    const stripeOpacity = 0.28;                                            // görünürlük

    const stripesSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wmstripe" width="${step}" height="${step}" patternUnits="userSpaceOnUse"
                   patternTransform="rotate(-35 ${step/2} ${step/2})">
            <rect x="0" y="${(step-lineW)/2}" width="${step}" height="${lineW}"
                  fill="rgba(0,0,0,${stripeOpacity})"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wmstripe)"/>
      </svg>
    `;

    // (İsteğe bağlı) Yazı overlay — bazı ortamlarda görünmeyebilir ama dursun
    const fontSize = Math.max(28, Math.floor(Math.min(width, height) * 0.12));
    const strokeW = Math.max(2, Math.floor(fontSize / 16));
    const textSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="${fontSize}"
          font-family="sans-serif"
          fill="rgba(0,0,0,0.32)"
          stroke="rgba(255,255,255,0.34)"
          stroke-width="${strokeW}"
          font-weight="800"
          transform="rotate(-30, ${width/2}, ${height/2})"
        >do not use</text>
      </svg>
    `;

    let pipeline = sharp(imgBuffer);
    if (mode === 'thumb') {
      pipeline = pipeline.resize({ width: Math.min(600, width) });
    }

    const out = await pipeline
      .composite([
        { input: Buffer.from(stripesSvg) },          // önce şeritler (garantili)
        { input: Buffer.from(textSvg), gravity: 'center' }, // sonra yazı (varsa)
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    const headers =
      mode === 'thumb'
        ? {
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
