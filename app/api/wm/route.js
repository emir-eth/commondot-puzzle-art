// app/api/wm/route.js
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// Basit 5x7 blok font (font bağımsız)
const PIX = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

function buildBlockTextSVG(
  phrase,
  targetW,
  fill = 'rgba(0,0,0,0.42)',       // daha görünür siyah
  stroke = 'rgba(255,255,255,0.45)' // beyaz kontur
) {
  const chars = phrase.toUpperCase().split('');
  const CHAR_W = 5, CHAR_H = 7;
  const LETTER_SPACING = 2;
  const WORD_SPACING = 4;

  // toplam sütun
  let totalCols = 0;
  chars.forEach((ch, i) => {
    totalCols += CHAR_W;
    if (i < chars.length - 1) totalCols += (ch === ' ' ? WORD_SPACING : LETTER_SPACING);
  });

  // hedef genişliğe göre hücre boyutu
  const cell = Math.max(2, Math.floor(targetW / totalCols));
  const dot  = Math.max(2, Math.floor(cell * 0.85)); // daha dolu blok
  const totalW = totalCols * cell;
  const totalH = CHAR_H * cell;
  const strokeW = Math.max(1, Math.floor(dot * 0.18)); // kontur kalınlığı

  let xCursor = 0;
  const rects = [];
  chars.forEach((ch) => {
    const grid = PIX[ch] || PIX[' '];
    for (let r = 0; r < CHAR_H; r++) {
      for (let c = 0; c < CHAR_W; c++) {
        if (grid[r][c] === '1') {
          const x = xCursor + c * cell + Math.floor((cell - dot) / 2);
          const y = r * cell + Math.floor((cell - dot) / 2);
          rects.push(`<rect x="${x}" y="${y}" width="${dot}" height="${dot}" rx="${Math.floor(dot*0.18)}" />`);
        }
      }
    }
    xCursor += CHAR_W * cell + (ch === ' ' ? WORD_SPACING : LETTER_SPACING) * cell;
  });

  return `
    <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <g fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}">
        ${rects.join('\n')}
      </g>
    </svg>
  `;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');
  const directUrl = searchParams.get('url');

  try {
    // 1) Görseli getir
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
      try { u = new URL(directUrl); } catch { return NextResponse.json({ error: 'invalid url' }, { status: 400 }); }
      if (!u.hostname.endsWith('.supabase.co')) {
        return NextResponse.json({ error: 'forbidden origin' }, { status: 403 });
      }
      const r = await fetch(directUrl, { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
      imgBuffer = Buffer.from(await r.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'path or url required' }, { status: 400 });
    }

    // 2) Boyutlar
    const meta = await sharp(imgBuffer).metadata();
    const width  = meta.width  || 1200;
    const height = meta.height || 800;

    // 3) Yazıyı üret (daha büyük) ve döndür
    const targetW = Math.floor(Math.min(width, height) * 0.85); // kısa kenarın %85'i
    const wordSvg = buildBlockTextSVG('DO NOT USE', targetW);
    const rotatedOverlay = await sharp(Buffer.from(wordSvg))
      .rotate(-30, { background: { r:0, g:0, b:0, alpha:0 } })
      .toBuffer();

    // 4) Composite → JPEG (overlay opaklığı SVG’den)
    const outBuffer = await sharp(imgBuffer)
      .composite([{ input: rotatedOverlay, gravity: 'center', blend: 'over' }])
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
