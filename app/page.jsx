'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload, Grid as GridIcon, Wand2 } from "lucide-react";

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default function Page() {
  const [imageSrc, setImageSrc] = useState("/cow.jpg");
  const [gridSize, setGridSize] = useState(4);
  const [gap, setGap] = useState(6);
  const [rounded, setRounded] = useState(true);
  const [shadow, setShadow] = useState(true);
  const [tiles, setTiles] = useState([]);
  const containerRef = useRef(null);

  const total = gridSize * gridSize;
  const goal = useMemo(() => Array.from({ length: total }, (_, i) => i), [total]);

  const ALLOWED_MIME = ['image/jpeg', 'image/png'];
  const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png']);

  useEffect(() => {
    setTiles(Array.from({ length: total }, (_, i) => i));
  }, [gridSize, imageSrc, total]);

  const validateFile = (f) => {
    if (!f) return false;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.includes(f.type)) {
      alert('Only JPG/JPEG/PNG files are allowed.');
      return false;
    }
    return true;
  };

  const onFile = (file) => {
    if (!validateFile(file)) return;
    const reader = new FileReader();
    reader.onload = (e) => setImageSrc(e.target.result);
    reader.readAsDataURL(file);
  };

  const onDropFile = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const exportPNG = async () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(rect.width * scale);
    canvas.height = Math.floor(rect.height * scale);
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;

    await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; });

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--gap-color") || "#0b0b0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const side = Math.min(canvas.width, canvas.height);
    const offX = (canvas.width - side) / 2;
    const offY = (canvas.height - side) / 2;
    const tileSize = (side - (gridSize + 1) * gap * scale) / gridSize;
    const imgW = img.width, imgH = img.height;

    for (let i = 0; i < total; i++) {
      const cur = tiles[i];
      const targetRow = Math.floor(i / gridSize);
      const targetCol = i % gridSize;
      const srcRow = Math.floor(cur / gridSize);
      const srcCol = cur % gridSize;

      const sx = Math.floor((srcCol / gridSize) * imgW);
      const sy = Math.floor((srcRow / gridSize) * imgH);
      const sw = Math.floor(imgW / gridSize);
      const sh = Math.floor(imgH / gridSize);

      const dx = Math.floor(offX + (targetCol + 1) * gap * scale + targetCol * tileSize);
      const dy = Math.floor(offY + (targetRow + 1) * gap * scale + targetRow * tileSize);

      const r = rounded ? Math.min(18 * scale, tileSize / 6) : 0;
      if (r > 0) { ctx.save(); roundedRect(ctx, dx, dy, tileSize, tileSize, r); ctx.clip(); }
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, tileSize, tileSize);
      if (r > 0) ctx.restore();

      if (shadow) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.strokeStyle = "rgba(0,0,0,0)";
        roundedRect(ctx, dx, dy, tileSize, tileSize, r);
        ctx.stroke();
        ctx.restore();
      }
    }

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `cow-puzzle-art-${gridSize}x${gridSize}.png`;
    a.click();
  };

  return (
    <div
      className="min-h-[70vh] w-full text-white"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFile}
      style={{ ['--gap-color']: '#0b0b0c' }}
    >
      <main className="max-w-6xl mx-auto px-4 pb-24">
        <section className="grid md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-2">
            <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
              <GridIcon className="size-4" /> {gridSize}×{gridSize}
            </div>
            <div
              ref={containerRef}
              className="aspect-square w-full bg-[var(--gap-color)] rounded-3xl p-[--p-gap]"
              style={{ ['--p-gap']: `${gap}px` }}
            >
              <div
                className="grid size-full"
                style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gap: `${gap}px` }}
              >
                {Array.from({ length: total }).map((_, i) => {
                  const pieceIndex = tiles[i];
                  const row = Math.floor(pieceIndex / gridSize);
                  const col = pieceIndex % gridSize;
                  return (
                    <div
                      key={i}
                      className={`relative overflow-hidden ${rounded ? 'rounded-2xl' : ''} ${shadow ? 'shadow-xl shadow-black/30' : ''} ring-1 ring-white/5`}
                      style={{
                        backgroundImage: `url(${imageSrc})`,
                        backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                        backgroundPosition: `${(gridSize > 1 ? (col / (gridSize - 1)) * 100 : 0)}% ${(gridSize > 1 ? (row / (gridSize - 1)) * 100 : 0)}%`,
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="space-y-4 bg-white/5 rounded-3xl p-4 md:p-6">
            <h2 className="text-lg font-medium mb-2 flex items-center gap-2"><Wand2 className="size-4"/> Image Settings</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-zinc-300">Grid Size</label>
                <input type="range" min={2} max={8} value={gridSize} onChange={(e) => setGridSize(parseInt(e.target.value))} className="w-full" />
                <div className="text-xs text-zinc-400">{gridSize}×{gridSize}</div>
              </div>
              <div>
                <label className="text-sm text-zinc-300">Piece Gap</label>
                <input type="range" min={0} max={20} value={gap} onChange={(e) => setGap(parseInt(e.target.value))} className="w-full" />
                <div className="text-xs text-zinc-400">{gap}px</div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300">Rounded Corners</label>
                <input type="checkbox" checked={rounded} onChange={(e) => setRounded(e.target.checked)} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300">Shadow</label>
                <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />
              </div>
              <div>
                <label className="text-sm text-zinc-300">Image URL (optional)</label>
                <input
                  type="url"
                  placeholder="https://.../cow.png"
                  className="mt-1 w-full bg-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 ring-white/20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = e.currentTarget.value.trim();
                      if (v) setImageSrc(v);
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-3 mt-4">
                <label className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl cursor-pointer hover:bg-white/15 transition">
                  <Upload className="size-4" />
                  <span className="text-sm">Upload Image</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    className="hidden"
                    onChange={onPickFile}
                  />
                </label>
                <button
                  onClick={exportPNG}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-white text-black rounded-xl hover:bg-white/90 transition"
                >
                  <Download className="size-4" /> <span className="text-sm">Download PNG</span>
                </button>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
