interface Props {
  missionsCompleted: number;
  totalBonusTime: number;
  onRestart: () => void;
}

export default function GameOver({ missionsCompleted, totalBonusTime, onRestart }: Props) {
  const rank = missionsCompleted >= 10
    ? { label: 'ЛЕГЕНДА САМОКАТА', color: 'text-yellow-400', icon: '👑' }
    : missionsCompleted >= 6
    ? { label: 'ОПЫТНЫЙ НЕЛЕГАЛ',  color: 'text-green-400',  icon: '🏆' }
    : missionsCompleted >= 3
    ? { label: 'ПОДОЗРИТЕЛЬНЫЙ',   color: 'text-amber-400',  icon: '😅' }
    : { label: 'СЛИШКОМ ЗАМЕТНЫЙ', color: 'text-red-400',    icon: '💀' };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-30 fade-up px-6">
      {/* Red overlay flash */}
      <div className="absolute inset-0 bg-red-900/30 pointer-events-none" />

      {/* Glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-80 h-80 bg-red-600/10 rounded-full blur-3xl" />
      </div>

      {/* Icon */}
      <div className="text-7xl mb-4">⛔</div>

      {/* Title */}
      <h1
        className="text-4xl font-bold tracking-widest text-red-500 mb-2 text-center glitch"
        style={{ fontFamily: '"Russo One", sans-serif' }}
      >
        ВАС ВЫЧИСЛИЛИ
      </h1>
      <p className="text-zinc-400 font-mono text-sm tracking-widest mb-8">
        ОПЕРАЦИЯ ПРОВАЛЕНА
      </p>

      {/* Stats */}
      <div className="bg-black/70 border border-red-900/60 rounded-2xl px-6 py-5 w-full max-w-sm mb-6 font-mono space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-zinc-500 text-sm">ВЫПОЛНЕНО ЗАДАНИЙ</span>
          <span className="text-white text-lg font-bold">{missionsCompleted}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-500 text-sm">БОНУСНОЕ ВРЕМЯ</span>
          <span className="text-green-400 text-lg font-bold">+{totalBonusTime} сек</span>
        </div>
        <div className="border-t border-zinc-800 pt-3 flex justify-between items-center">
          <span className="text-zinc-500 text-sm">ЗВАНИЕ</span>
          <span className={`text-sm font-bold ${rank.color}`}>
            {rank.icon} {rank.label}
          </span>
        </div>
      </div>

      {/* Restart button */}
      <button
        onClick={onRestart}
        className="w-full max-w-sm py-5 rounded-2xl text-white font-bold text-lg tracking-widest
                   bg-red-600 active:bg-red-500 transition-all duration-100
                   shadow-[0_0_30px_rgba(239,68,68,0.3)]"
        style={{ fontFamily: '"Russo One", sans-serif' }}
      >
        ПОПРОБОВАТЬ СНОВА
      </button>

      <p className="text-zinc-700 text-xs font-mono mt-4 text-center">
        штраф 500₽ уже списан с карты
      </p>
    </div>
  );
}
