import { useEffect, useRef, useState, useMemo } from 'react';

// Deterministic fake "buildings" for fallback background
const BLOCKS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left:   `${(i * 17 + 5) % 96}%`,
  top:    `${(i * 23 + 8) % 85}%`,
  width:  `${16 + (i * 7) % 60}px`,
  height: `${20 + (i * 11) % 90}px`,
  opacity: 0.05 + (i % 5) * 0.03,
}));

export default function CameraBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'pending' | 'granted' | 'denied'>('pending');

  useEffect(() => {
    // getUserMedia requires HTTPS on mobile (except localhost) — guard against undefined
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('denied');
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus('granted');
      })
      .catch(() => {
        if (!cancelled) setStatus('denied');
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <>
      {/* Camera feed */}
      <video
        ref={videoRef}
        id="camera-feed"
        autoPlay
        playsInline
        muted
        className="fixed inset-0 w-full h-full object-cover"
        style={{ display: status === 'granted' ? 'block' : 'none' }}
      />

      {/* Fallback background when no camera */}
      {status !== 'granted' && (
        <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black">
          {/* Abstract city silhouette */}
          {BLOCKS.map(b => (
            <div
              key={b.id}
              className="absolute bg-zinc-600 rounded-sm"
              style={{ left: b.left, top: b.top, width: b.width, height: b.height, opacity: b.opacity }}
            />
          ))}
          {status === 'pending' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-green-400 text-xs font-mono animate-pulse tracking-widest">
                ЗАПРОС ДОСТУПА К КАМЕРЕ...
              </span>
            </div>
          )}
          {status === 'denied' && (
            <div className="absolute bottom-24 left-0 right-0 flex justify-center">
              <span className="text-yellow-500/50 text-xs font-mono tracking-wider px-4 text-center">
                ⚠ КАМЕРА НЕДОСТУПНА — РЕЖИМ МАСКИРОВКИ АКТИВЕН
              </span>
            </div>
          )}
        </div>
      )}

      {/* Dark overlay to make HUD readable */}
      <div className="fixed inset-0 bg-black/40 pointer-events-none" />

      {/* Vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)' }}
      />
    </>
  );
}
