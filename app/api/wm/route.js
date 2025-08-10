// app/api/wm/route.js
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { readFile } from 'node:fs/promises';
import * as opentype from 'opentype.js';

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

    // 2) Görsel ölçüleri
    const meta = await sharp(imgBuffer).metadata();
    const width  = meta.width  || 1200;
    const height = meta.height || 800;

    // 3) Yazıyı "path"e çevir (font bağımlılığı yok)
    //    - segoe-ui-bold.woff dosyasını aynı klasöre koymuştun
    const fontUrl = new URL('./segoe-ui-bold.woff', import.meta.url);
    const fontBytes = await readFile(fontUrl);
    const font = opentype.parse(fontBytes.buffer);

    const text = 'do not use';
    const targetSize = Math.max(24, Math.floor(Math.min(width, height) * 0.12)); // biraz daha görünür olsun
    // path’i (0,0) referansıyla üret
    const pathObj = font.getPath(text, 0, 0, targetSize);
    const bbox = pathObj.getBoundingBox();
    // path ‘d’ verisi
    const d = pathObj.toPathData(3); // 3: precision

    // Ortalamak için translate değerleri (merkezi width/2,height/2’ye getir)
    const textW = bbox.x2 - bbox.x1;
    const textH = bbox.y2 - bbox.y1;
    // opentype koordinatlarında y aşağı negatif, o yüzden +/- ayarlıyoruz:
    const centerX = width / 2;
    const centerY = height / 2;
    const translateX = centerX - (bbox.x1 + textW / 2);
    const translateY = centerY - (bbox.y1 + textH / 2);

    // 4) SVG overlay: path + rotate(-30deg)
    const fillOpacity = 0.30; // daha belirgin olsun
    const strokeOpacity = 0.35;
    const strokeWidth = Math.max(2, Math.floor(targetSize / 18));

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(${translateX}, ${translateY}) rotate(-30, ${bbox.x1 + textW/2}, ${bbox.y1 + textH/2})">
          <path d="${d}"
            fill="rgba(0,0,0,${fillOpacity})"
            stroke="rgba(255,255,255,${strokeOpacity})"
            stroke-width="${strokeWidth}" />
        </g>
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
