import { useEffect, useState } from 'react';
import { Toast, ReactionTask, CaptchaTask } from '../hooks/useGame';

interface Props {
  timeLeft: number;
  threatLevel: number;
  toasts: Toast[];
  missionsCompleted: number;
  reactionTask: ReactionTask | null;
  captchaTask: CaptchaTask | null;
  collisionFlash: boolean;
  onCompleteReactionTask: () => void;
  onCompleteCaptcha: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getThreatLabel(level: number): string {
  if (level < 25)  return 'ЧИСТО';
  if (level < 50)  return 'СЛЕЖКА';
  if (level < 75)  return 'ОПАСНО';
  return 'КРИТИЧНО';
}

function getThreatColor(level: number) {
  if (level < 40)  return 'threat-low';
  if (level < 70)  return 'threat-medium';
  return 'threat-high';
}

function toastClass(variant: Toast['variant'] = 'default') {
  if (variant === 'collision') return 'bg-orange-500/95 text-black font-bold font-mono text-sm px-4 py-2 rounded-xl shadow-lg shadow-orange-900/40';
  if (variant === 'danger')    return 'bg-red-600/95 text-white font-bold font-mono text-sm px-4 py-2 rounded-xl shadow-lg shadow-red-900/40';
  return 'bg-green-500/90 text-black font-bold font-mono text-sm px-4 py-2 rounded-xl shadow-lg shadow-green-900/40';
}

export default function HUD({
  timeLeft, threatLevel, toasts, missionsCompleted,
  reactionTask, captchaTask, collisionFlash,
  onCompleteReactionTask, onCompleteCaptcha,
}: Props) {
  const isLowTime  = timeLeft <= 10;
  const isCritical = threatLevel >= 80;

  return (
    <>
      {/* Collision flash */}
      {collisionFlash && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 15, background: 'rgba(251,146,60,0.30)' }} />
      )}

      <div className="fixed inset-0 z-20 flex flex-col pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* ── TOP BAR ── */}
        <div className="pointer-events-none px-4 pt-12 pb-3 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs font-mono tracking-widest opacity-80">🛴 САМОКАТ.EXE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>
            <div
              className={`font-mono font-bold text-3xl tabular-nums ${isLowTime ? 'timer-flash' : 'text-white'}`}
              style={{ textShadow: isLowTime ? '0 0 12px rgba(239,68,68,0.8)' : '0 0 10px rgba(255,255,255,0.3)' }}
            >
              {formatTime(timeLeft)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono tracking-widest w-20 ${isCritical ? 'text-red-400 threat-critical' : 'text-zinc-400'}`}>
              {getThreatLabel(threatLevel)}
            </span>
            <div className="flex-1 h-2 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getThreatColor(threatLevel)} ${isCritical ? 'threat-critical' : ''}`}
                style={{ width: `${threatLevel}%` }}
              />
            </div>
            <span className={`text-xs font-mono w-8 text-right ${isCritical ? 'text-red-400' : 'text-zinc-500'}`}>
              {Math.round(threatLevel)}%
            </span>
          </div>
        </div>

        {/* ── TOASTS ── */}
        <div className="absolute top-28 right-3 flex flex-col gap-2 pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`${toastClass(toast.variant)} ${toast.exiting ? 'toast-exit' : 'toast-enter'}`}
            >
              {toast.text}
            </div>
          ))}
        </div>

        {/* ── SPACER ── */}
        <div className="flex-1" />

        {/* ── TASK AREA ── */}
        <div className="pointer-events-auto px-4 pb-3 space-y-2">

          {/* Reaction task */}
          {reactionTask && (
            <ReactionTaskCard task={reactionTask} onComplete={onCompleteReactionTask} />
          )}

          {/* Permanent task — always visible */}
          <PermanentTaskCard />
        </div>

        {/* ── BOTTOM STATUS BAR ── */}
        <div className="pointer-events-none px-4 py-3 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 font-mono text-xs tracking-widest">В РЕЙСЕ</span>
          </div>
          <span className="text-zinc-500 font-mono text-xs">
            ВЫПОЛНЕНО: <span className="text-zinc-300">{missionsCompleted}</span>
          </span>
        </div>
      </div>

      {/* ── CAPTCHA OVERLAY (blocking) ── */}
      {captchaTask && (
        <CaptchaOverlay task={captchaTask} onComplete={onCompleteCaptcha} />
      )}
    </>
  );
}

// ── Permanent task card ────────────────────────────────────────────
function PermanentTaskCard() {
  return (
    <div
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-purple-500/40 bg-purple-950/50"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <span className="text-xl flex-shrink-0">💥</span>
      <div className="flex-1 min-w-0">
        <p
          className="font-bold text-sm tracking-wide text-purple-300 truncate"
          style={{ fontFamily: '"Russo One", sans-serif' }}
        >
          СБИТЬ ПЕШЕХОДА
        </p>
        <p className="text-purple-600 text-xs font-mono tracking-widest">АВТОДЕТЕКЦИЯ  •  ВСЕГДА АКТИВНО</p>
      </div>
      <div className="flex flex-col items-end flex-shrink-0">
        <span className="text-green-400 font-mono font-bold text-sm">+30с</span>
        <span className="text-purple-500 text-xs font-mono">ПЕШЕХОД</span>
      </div>
    </div>
  );
}

// ── Reaction task card ─────────────────────────────────────────────
function ReactionTaskCard({ task, onComplete }: { task: ReactionTask; onComplete: () => void }) {
  const elapsed   = (Date.now() - task.startedAt) / 1000;
  const remaining = Math.max(0.05, task.timeLimit - elapsed);

  return (
    <button
      onClick={onComplete}
      className="w-full flex flex-col rounded-2xl border-2 border-yellow-400/90 bg-yellow-950/80
                 card-enter active:scale-95 transition-transform duration-100 overflow-hidden"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-2xl">⚡</span>
        <div className="flex-1">
          <p
            className="text-yellow-300 font-bold text-sm tracking-wide"
            style={{ fontFamily: '"Russo One", sans-serif' }}
          >
            ЗАДАНИЕ: НАЖМИ!
          </p>
          <p className="text-yellow-600 text-xs font-mono">+{task.reward} СЕК ЗА РЕАКЦИЮ</p>
        </div>
        <span
          className="text-yellow-400 font-bold text-lg animate-pulse"
          style={{ fontFamily: '"Russo One", sans-serif' }}
        >
          НАЖМИ!
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 w-full">
        <div
          key={task.id}
          className="h-full bg-yellow-400 origin-left"
          style={{ animation: `bar-drain ${remaining}s linear forwards` }}
        />
      </div>
    </button>
  );
}

// ── Captcha overlay ────────────────────────────────────────────────
const CAPTCHA_GRID = ['🚥','🛴','🚗','🏠','🚥','🐦','🚗','🛴','🚥'];

function CaptchaOverlay({ task, onComplete }: { task: CaptchaTask; onComplete: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil(task.timeLimit - (Date.now() - task.startedAt) / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil(task.timeLimit - (Date.now() - task.startedAt) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [task]);

  const elapsed       = (Date.now() - task.startedAt) / 1000;
  const remainingAnim = Math.max(0.05, task.timeLimit - elapsed);
  const isUrgent      = secondsLeft <= 5;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-sm bg-zinc-900 border border-red-500/70 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(239,68,68,0.25)]">

        <div className="bg-red-950/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <p className="text-red-400 font-bold font-mono text-sm tracking-widest">АНТИБОТ СИСТЕМА</p>
              <p className="text-red-700 text-xs font-mono">ПРОВЕРЬТЕ ЛИЧНОСТЬ</p>
            </div>
          </div>
          <span className={`font-mono font-bold text-2xl tabular-nums ${isUrgent ? 'text-red-400 timer-flash' : 'text-white'}`}>
            {secondsLeft}с
          </span>
        </div>

        <div className="px-4 pt-4 pb-2 space-y-3">
          <p className="text-zinc-400 text-xs font-mono text-center tracking-wider">
            Выберите все изображения со светофорами
          </p>

          <div className="grid grid-cols-3 gap-1.5">
            {CAPTCHA_GRID.map((emoji, i) => (
              <div
                key={i}
                className="aspect-square bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-2xl"
              >
                {emoji}
              </div>
            ))}
          </div>

          <button
            onClick={onComplete}
            className="w-full py-4 rounded-xl bg-white text-black flex items-center justify-center gap-3
                       active:bg-zinc-200 transition-colors duration-100 shadow-lg"
          >
            <span className="text-2xl">☑</span>
            <span className="font-bold text-base" style={{ fontFamily: '"Russo One", sans-serif' }}>
              Я НЕ РОБОТ
            </span>
          </button>

          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden pb-1">
            <div
              key={task.id}
              className={`h-full rounded-full origin-left ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ animation: `bar-drain ${remainingAnim}s linear forwards` }}
            />
          </div>
        </div>

        <p className="text-zinc-700 text-xs font-mono text-center pb-3">
          reCAPTCHA v3  •  не пройдена = штраф 500₽
        </p>
      </div>
    </div>
  );
}
