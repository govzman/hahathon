/**
 * Detection hook — wraps mock/real object detection.
 *
 * MODE mock  — генерирует случайные события каждые ~12 сек
 * MODE real  — поллит /predictions на локальном CV-сервере каждые 2 сек
 *
 * "Collision" = person с distance < 5 м → вызывает onCollision()
 */

import { useEffect, useRef } from 'react';

export type DetectedType = 'person' | 'animal' | 'car';

export interface DetectionObject {
  type: DetectedType;
  distance: number; // metres
}

interface UseDetectionOptions {
  mode?: 'mock' | 'real';
  /** Base URL CV-сервера, например https://192.168.x.x:5000 */
  cvServerUrl?: string;
  enabled: boolean;
  onCollision: (obj: DetectionObject) => void;
}

const MOCK_TYPES: DetectedType[] = ['person', 'animal', 'car'];

// Формат одного объекта из /predictions сервера hahathon
interface RawPrediction {
  label: string;
  confidence: number;
  distance_3d_m: number;
  [key: string]: unknown;
}

export function useDetection({
  mode = 'mock',
  cvServerUrl = '',
  enabled,
  onCollision,
}: UseDetectionOptions) {
  const onCollisionRef = useRef(onCollision);
  onCollisionRef.current = onCollision;

  useEffect(() => {
    if (!enabled) return;

    // ── MOCK ────────────────────────────────────────────────────
    if (mode === 'mock') {
      const fire = () => {
        const type = MOCK_TYPES[Math.floor(Math.random() * MOCK_TYPES.length)];
        const isClose = Math.random() < 0.3; // 30% — рядом
        const distance = isClose ? 1.5 + Math.random() * 3 : 6 + Math.random() * 10;
        if (type === 'person' && distance < 5) {
          onCollisionRef.current({ type, distance });
        }
      };
      const id = setInterval(fire, 12000);
      return () => clearInterval(id);
    }

    // ── REAL ────────────────────────────────────────────────────
    if (mode === 'real' && cvServerUrl) {
      const predictionsUrl = `${cvServerUrl}/predictions`;

      const poll = async () => {
        try {
          const res = await fetch(predictionsUrl);
          if (!res.ok) return;

          // Сервер возвращает { predictions: [{label, distance_3d_m, ...}] }
          const data = await res.json() as { predictions: RawPrediction[] };
          const preds = data.predictions ?? [];

          for (const pred of preds) {
            if (pred.label === 'person' && pred.distance_3d_m < 5) {
              onCollisionRef.current({ type: 'person', distance: pred.distance_3d_m });
            }
          }
        } catch { /* сервер недоступен — игнорируем */ }
      };

      const id = setInterval(poll, 2000);
      return () => clearInterval(id);
    }
  }, [enabled, mode, cvServerUrl]);
}
