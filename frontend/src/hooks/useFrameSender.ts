/**
 * Периодически захватывает кадр с <video id="camera-feed">
 * и отправляет его как JPEG на POST /upload_frame.
 */

import { useEffect } from 'react';

interface UseFrameSenderOptions {
  uploadUrl: string;   // e.g. https://192.168.x.x:5000/upload_frame
  enabled: boolean;
  intervalMs?: number; // default 1000 ms (1 fps достаточно для детекции)
}

export function useFrameSender({ uploadUrl, enabled, intervalMs = 1000 }: UseFrameSenderOptions) {
  useEffect(() => {
    if (!enabled) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const id = setInterval(() => {
      const video = document.getElementById('camera-feed') as HTMLVideoElement | null;
      if (!video || video.readyState < 2) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      // Уменьшаем кадр в 2× — снижает нагрузку на сеть без потери качества для YOLO
      const scale = 0.5;
      canvas.width  = Math.round(video.videoWidth  * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        if (!blob) return;
        fetch(uploadUrl, {
          method: 'POST',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' },
        }).catch(() => { /* silently ignore network errors */ });
      }, 'image/jpeg', 0.8);
    }, intervalMs);

    return () => clearInterval(id);
  }, [enabled, uploadUrl, intervalMs]);
}
