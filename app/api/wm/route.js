// app/api/wm/route.js
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');
  const directUrl = searchParams.get('url');

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

      // Buffer'a çevir (arrayBuffer → Buffer)
      const arrBuf = await data.arrayBuffer();
      imgBuffer = Buffer.from(arrBuf);

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
      const arrBuf = await r.arrayBuffer();
      imgBuffer = Buffer.from(arrBuf);

    } else {
      return NextResponse.json({ error: 'path or url required' }, { status: 400 });
    }

    const meta = await sharp(imgBuffer).metadata();
    const width  = meta.width  || 1200;
    const height = meta.height || 800;

    const fontSize = Math.max(24, Math.floor(Math.min(width, height) * 0.1));
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>text { font-family: Arial, sans-serif; font-weight: 700; }</style>
        <text x="50%" y="50%" text-anchor="middle" dy=".35em"
          font-size="${fontSize}" fill="rgba(0,0,0,0.25)"
          transform="rotate(-30, ${width/2}, ${height/2})">
          do not use
        </text>
      </svg>
    `;

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
        'Content-Disposition': 'inline; filename="wm.jpg"',
        'Content-Length': outBuffer.length.toString()
      }
    });

  } catch (err) {
    console.error('wm error', err);
    return NextResponse.json({ error: err?.message || 'server error' }, { status: 500 });
  }
}
