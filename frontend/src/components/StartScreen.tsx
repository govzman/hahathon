interface Props {
  onStart: () => void;
}

export default function StartScreen({ onStart }: Props) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-30 fade-up px-6">
      {/* Glow backdrop */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 bg-green-500/5 rounded-full blur-3xl" />
      </div>

      {/* App icon */}
      <div className="text-7xl mb-4 flicker">🛴</div>

      {/* Title */}
      <h1
        className="text-4xl font-bold tracking-widest text-white mb-1 text-center"
        style={{ fontFamily: '"Russo One", sans-serif', textShadow: '0 0 20px rgba(0,255,65,0.4)' }}
      >
        САМОКАТ
      </h1>
      <h2
        className="text-xl font-bold tracking-[0.3em] text-green-400 mb-1 text-center"
        style={{ fontFamily: '"Russo One", sans-serif' }}
      >
        БЕЗ ЛИЦЕНЗИИ
      </h2>
      <p className="text-zinc-500 text-xs tracking-widest mb-8 font-mono">
        v0.0.1-alpha • нелегальное такси
      </p>

      {/* Rules */}
      <div className="bg-black/60 border border-zinc-700 rounded-xl px-5 py-4 mb-8 w-full max-w-sm font-mono text-sm space-y-2">
        <p className="text-zinc-400">
          <span className="text-green-400">⏱</span>  Есть 60 секунд. Таймер убывает.
        </p>
        <p className="text-zinc-400">
          <span className="text-amber-400">📋</span>  Выполняй задания — получай время.
        </p>
        <p className="text-zinc-400">
          <span className="text-red-400">🚨</span>  Угроза растёт. Действуй быстрее.
        </p>
        <p className="text-zinc-400">
          <span className="text-purple-400">💀</span>  Таймер = 0? Тебя вычислили.
        </p>
      </div>

      {/* Start button */}
      <button
        onClick={onStart}
        className="w-full max-w-sm py-5 rounded-2xl text-black font-bold text-lg tracking-widest
                   bg-green-400 active:bg-green-300 transition-all duration-100
                   shadow-[0_0_30px_rgba(0,255,65,0.4)]"
        style={{ fontFamily: '"Russo One", sans-serif' }}
      >
        НАЧАТЬ РЕЙС
      </button>

      <p className="text-zinc-600 text-xs font-mono mt-6 text-center">
        нажимая кнопку, вы соглашаетесь нарушить ПДД
      </p>
    </div>
  );
}
