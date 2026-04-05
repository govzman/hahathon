import { useState, useEffect, useRef, useCallback } from 'react';
import type { DetectionObject } from './useDetection';

export type GameState = 'idle' | 'playing' | 'gameover';

export interface Toast {
  id: string;
  text: string;
  exiting: boolean;
  variant?: 'default' | 'danger' | 'collision';
}

/** Short reaction window: tap "НАЖМИ" before timeLimit expires → +reward sec */
export interface ReactionTask {
  id: string;
  timeLimit: number;  // seconds, 2–3
  startedAt: number;  // Date.now()
  reward: number;     // 10 sec
}

/** Blocking captcha: tap "Я НЕ РОБОТ" before 15 s or GAME OVER */
export interface CaptchaTask {
  id: string;
  timeLimit: number;  // 15 seconds
  startedAt: number;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function playTaskSound() {
  try {
    const audio = new Audio('/task_sound.mp3');
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

export function useGame() {
  const [gameState, setGameState]               = useState<GameState>('idle');
  const [timeLeft, setTimeLeft]                 = useState(60);
  const [threatLevel, setThreatLevel]           = useState(0);
  const [toasts, setToasts]                     = useState<Toast[]>([]);
  const [missionsCompleted, setMissionsCompleted] = useState(0);
  const [totalBonusTime, setTotalBonusTime]     = useState(0);

  const [reactionTask, setReactionTask]         = useState<ReactionTask | null>(null);
  const [captchaTask, setCaptchaTask]           = useState<CaptchaTask | null>(null);
  const [pedCollisions, setPedCollisions]       = useState(0);
  const [collisionFlash, setCollisionFlash]     = useState(false);

  // ── Refs ─────────────────────────────────────────────────────
  const isPlayingRef = useRef(false);
  isPlayingRef.current = gameState === 'playing';

  const reactionTaskRef = useRef<ReactionTask | null>(null);
  reactionTaskRef.current = reactionTask;

  const captchaTaskRef = useRef<CaptchaTask | null>(null);
  captchaTaskRef.current = captchaTask;

  // ── Toast ────────────────────────────────────────────────────
  const showToast = useCallback((text: string, variant: Toast['variant'] = 'default') => {
    const id = makeId('toast');
    setToasts(prev => [...prev, { id, text, exiting: false, variant }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    }, 2000);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2350);
  }, []);

  // ── Random tasks: reaction + captcha ─────────────────────────
  const scheduleRandomTask = useCallback(() => {
    const delay = 12000 + Math.random() * 13000; // 12–25 s
    setTimeout(() => {
      if (!isPlayingRef.current) return;
      if (captchaTaskRef.current || reactionTaskRef.current) return;

      const isCaptcha = Math.random() < 0.25;
      if (isCaptcha) {
        const task: CaptchaTask = {
          id: makeId('captcha'),
          timeLimit: 15,
          startedAt: Date.now(),
        };
        captchaTaskRef.current = task;
        setCaptchaTask(task);
      } else {
        const timeLimit = 2 + Math.random(); // 2.0–3.0 s
        const task: ReactionTask = {
          id: makeId('reaction'),
          timeLimit,
          startedAt: Date.now(),
          reward: 10,
        };
        reactionTaskRef.current = task;
        setReactionTask(task);
      }
      playTaskSound();
    }, delay);
  }, []);

  const completeReactionTask = useCallback(() => {
    const task = reactionTaskRef.current;
    if (!task) return;
    reactionTaskRef.current = null;
    setReactionTask(null);
    setTimeLeft(t => Math.min(t + task.reward, 180));
    setMissionsCompleted(c => c + 1);
    setTotalBonusTime(bt => bt + task.reward);
    showToast(`⚡ +${task.reward} СЕК — РЕАКЦИЯ!`);
    scheduleRandomTask();
  }, [showToast, scheduleRandomTask]);

  const failReactionTask = useCallback(() => {
    if (!reactionTaskRef.current) return;
    reactionTaskRef.current = null;
    setReactionTask(null);
    showToast('💨 СЛИШКОМ МЕДЛЕННО', 'danger');
    scheduleRandomTask();
  }, [showToast, scheduleRandomTask]);

  const completeCaptcha = useCallback(() => {
    if (!captchaTaskRef.current) return;
    captchaTaskRef.current = null;
    setCaptchaTask(null);
    showToast('🤖 КАПЧА ПРОЙДЕНА  +5 СЕК');
    setTimeLeft(t => Math.min(t + 5, 180));
    scheduleRandomTask();
  }, [showToast, scheduleRandomTask]);

  const failCaptcha = useCallback(() => {
    if (!captchaTaskRef.current) return;
    captchaTaskRef.current = null;
    setCaptchaTask(null);
    reactionTaskRef.current = null;
    setReactionTask(null);
    setGameState('gameover');
  }, []);

  // ── Collision (from CV detection) ────────────────────────────
  const onCollision = useCallback((_obj: DetectionObject) => {
    if (!isPlayingRef.current) return;
    const REWARD = 30;
    setTimeLeft(t => Math.min(t + REWARD, 180));
    setPedCollisions(c => c + 1);
    setMissionsCompleted(c => c + 1);
    setTotalBonusTime(bt => bt + REWARD);
    setThreatLevel(t => Math.min(t + 15, 100));
    showToast(`💥 СБИЛ ПЕШЕХОДА!  +${REWARD} СЕК`, 'collision');
    setCollisionFlash(true);
    setTimeout(() => setCollisionFlash(false), 600);
  }, [showToast]);

  // ── Start / reset ────────────────────────────────────────────
  const startGame = useCallback(() => {
    setTimeLeft(60);
    setThreatLevel(0);
    setMissionsCompleted(0);
    setTotalBonusTime(0);
    setPedCollisions(0);
    setToasts([]);
    setReactionTask(null);
    setCaptchaTask(null);
    setCollisionFlash(false);
    reactionTaskRef.current = null;
    captchaTaskRef.current = null;
    setGameState('playing');
  }, []);

  // ── Seed first random task on game start ─────────────────────
  useEffect(() => {
    if (gameState !== 'playing') return;
    scheduleRandomTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // ── Game loop: timer + threat ─────────────────────────────────
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('gameover');
          setReactionTask(null);
          setCaptchaTask(null);
          return 0;
        }
        return prev - 1;
      });
      setThreatLevel(prev => Math.min(prev + 1.5, 100));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  // ── Reaction task timeout ─────────────────────────────────────
  useEffect(() => {
    if (!reactionTask) return;
    const remaining = reactionTask.timeLimit * 1000 - (Date.now() - reactionTask.startedAt);
    if (remaining <= 0) { failReactionTask(); return; }
    const id = setTimeout(failReactionTask, remaining);
    return () => clearTimeout(id);
  }, [reactionTask, failReactionTask]);

  // ── Captcha timeout → game over ───────────────────────────────
  useEffect(() => {
    if (!captchaTask) return;
    const remaining = captchaTask.timeLimit * 1000 - (Date.now() - captchaTask.startedAt);
    if (remaining <= 0) { failCaptcha(); return; }
    const id = setTimeout(failCaptcha, remaining);
    return () => clearTimeout(id);
  }, [captchaTask, failCaptcha]);

  return {
    gameState,
    timeLeft,
    threatLevel,
    toasts,
    missionsCompleted,
    totalBonusTime,
    pedCollisions,
    reactionTask,
    captchaTask,
    collisionFlash,
    startGame,
    completeReactionTask,
    completeCaptcha,
    onCollision,
  };
}
