'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Upload } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function CommunityPage() {
  const [username, setUsername] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState(null);
  const canvasRef = useRef(null);

  const ALLOWED_MIME = ['image/jpeg', 'image/png'];
  const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png']);

  const isUrlLike = (s) => /^https?:\/\//i.test(s || '');

  async function fetchGallery() {
    const { data, error } = await supabase
      .from('gallery')
      .select('id, username, image_path, created_at') // gereksiz kolonlar çıkarıldı
      .order('created_at', { ascending: false })
      .limit(60);
    if (!error) setItems(data || []);
  }
  useEffect(() => { fetchGallery(); }, []);

  function onPickFile(e) {
    const f = e.target.files?.[0] || null;
    if (!f) { setFile(null); return; }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.includes(f.type)) {
      alert('Only JPG/JPEG/PNG files are allowed.');
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.includes(file.type)) {
      alert('Only JPG/JPEG/PNG files are allowed.');
      return;
    }

    setSubmitting(true);
    try {
      const filePath = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase
        .storage.from('images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from('gallery').insert({
        username: username?.trim() || null,
        image_path: filePath,
      });
      if (insertErr) throw insertErr;

      setUsername('');
      setFile(null);
      await fetchGallery();
      alert('Added to Community Wall!');
    } catch (err) {
      console.error(err);
      alert('Upload failed. Check console.');
    } finally {
      setSubmitting(false);
    }
  }

  const openViewer = (item) => { setViewerItem(item); setViewerOpen(true); };
  const closeViewer = () => { setViewerOpen(false); setViewerItem(null); };

  useEffect(() => {
    if (!viewerOpen || !viewerItem) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    (async () => {
      try {
        const wmUrl =
          (viewerItem.image_path && !isUrlLike(viewerItem.image_path))
            ? `/api/wm?path=${encodeURIComponent(viewerItem.image_path)}`
            : '';

        if (!wmUrl) return;

        const res = await fetch(wmUrl, { cache: 'no-store' });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.error('wm fetch failed', res.status, txt);
          return;
        }

        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.src = objUrl;
        await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; });
        if (cancelled) return;

        const maxW = Math.min(window.innerWidth * 0.9, 1100);
        const maxH = Math.min(window.innerHeight * 0.8, 800);
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);

        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,w,h);
        ctx.drawImage(img, 0, 0, w, h);

        URL.revokeObjectURL(objUrl);
      } catch (e) {
        console.error('viewer draw error', e);
      }
    })();

    return () => { cancelled = true; };
  }, [viewerOpen, viewerItem]);

  const preventContext = (e) => e.preventDefault();
  const preventDrag = (e) => e.preventDefault();
  useEffect(() => {
    if (!viewerOpen) return;
    const onEsc = (e) => { if (e.key === 'Escape') closeViewer(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [viewerOpen]);

  return (
    <div className="max-w-6xl mx-auto px-4 pb-24">
      <h1 className="text-2xl font-semibold mb-6">Community Wall</h1>

      <form onSubmit={handleSubmit} className="bg-white/5 rounded-3xl p-4 md:p-6 mb-8">
        <h2 className="text-lg font-medium mb-3">Add your puzzle</h2>
        <div className="grid md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-1">
            <label className="text-sm text-zinc-300">X username (optional)</label>
            <input
              type="text"
              placeholder="@yourhandle"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full bg-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 ring-white/20"
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-sm text-zinc-300">Image file (JPG/PNG only)</label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png"
              onChange={onPickFile}
              className="mt-1 w-full text-sm"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={submitting || !file}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl hover:bg-white/90 transition disabled:opacity-60"
            >
              <Upload className="size-4" /> {submitting ? 'Uploading...' : 'Add to Community Wall'}
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Note: Images are stored privately in Supabase Storage and always shown with a watermark.
        </p>
      </form>

      <section>
        <h2 className="text-lg font-medium mb-3">Latest submissions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 select-none">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => openViewer(it)}
              className="group text-left bg-white/5 rounded-2xl overflow-hidden ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <div className="relative">
                <img
                  src={
                    (it.image_path && !isUrlLike(it.image_path))
                      ? `/api/wm?path=${encodeURIComponent(it.image_path)}`
                      : ''
                  }
                  alt="community"
                  className="w-full h-48 object-cover pointer-events-none select-none"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
              </div>
              <figcaption className="p-2 text-xs text-zinc-300">
                {it.username || 'anonymous'}
              </figcaption>
            </button>
          ))}
          {items.length === 0 && (
            <div className="text-sm text-zinc-400">No submissions yet. Be the first!</div>
          )}
        </div>
      </section>

      {viewerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onContextMenu={preventContext}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeViewer(); }}
        >
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="max-w-[90vw] max-h-[80vh] rounded-xl shadow-2xl"
              onContextMenu={preventContext}
              onDragStart={preventDrag}
              onMouseDown={(e) => e.preventDefault()}
            />
            <button
              onClick={closeViewer}
              className="absolute -top-3 -right-3 bg-white text-black rounded-full px-3 py-1 text-xs shadow"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
