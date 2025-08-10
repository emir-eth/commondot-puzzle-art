// app/api/wm/route.js
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { readFile } from 'node:fs/promises';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');
  const directUrl = searchParams.get('url');

  try {
    // 1) Kaynak görseli al
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

    // 2) Boyutlar
    const meta = await sharp(imgBuffer).metadata();
    const width  = meta.width  || 1200;
    const height = meta.height || 800;

    // 3) WOFF fontu modüle göre göreli oku ve base64 göm
    let embeddedFontCss = '';
    try {
      const fontUrl = new URL('./segoe-ui-bold.woff', import.meta.url); // app/api/wm/segoe-ui-bold.woff
      const fontBytes = await readFile(fontUrl);
      const fontB64 = fontBytes.toString('base64');
      embeddedFontCss = `
        @font-face {
          font-family: 'WMFont';
          src: url(data:font/woff;base64,${fontB64}) format('woff');
          font-weight: 700;
          font-style: normal;
        }
      `;
    } catch (e) {
      // Font okunamazsa sistem fontuna düşer (prod'da kare görebilirsin)
      embeddedFontCss = '';
    }

    // 4) Watermark SVG (font gömülü)
    const fontSize = Math.max(24, Math.floor(Math.min(width, height) * 0.1));
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          ${embeddedFontCss}
          text { font-family: ${embeddedFontCss ? "'WMFont'" : "Arial, sans-serif"}; font-weight: 700; }
        </style>
        <text x="50%" y="50%" text-anchor="middle" dy=".35em"
          font-size="${fontSize}" fill="rgba(0,0,0,0.28)"
          transform="rotate(-30, ${width/2}, ${height/2})">
          do not use
        </text>
      </svg>
    `;

    // 5) Composite ve yanıt
    const outBuffer = await sharp(imgBuffer)
      .composite([{ input: Buffer.from(svg), gravity: 'center' }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'Content-Disposition': 'inline; filename="wm.jpg"',
        'Content-Length': outBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error('wm error', err);
    return NextResponse.json({ error: err?.message || 'server error' }, { status: 500 });
  }
}
