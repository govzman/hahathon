import CameraBackground from './components/CameraBackground';
import HUD from './components/HUD';
import StartScreen from './components/StartScreen';
import GameOver from './components/GameOver';
import { useGame } from './hooks/useGame';
import { useDetection } from './hooks/useDetection';
import { useFrameSender } from './hooks/useFrameSender';

// CV-сервер (hahathon/server.py) работает на том же хосте, порт 5000.
// window.location.hostname автоматически даёт правильный IP (хотспот, WiFi или localhost).
const CV_SERVER = `https://${window.location.hostname}:5000`;

export default function App() {
  const {
    gameState,
    timeLeft,
    threatLevel,
    toasts,
    missionsCompleted,
    totalBonusTime,
    reactionTask,
    captchaTask,
    collisionFlash,
    startGame,
    completeReactionTask,
    completeCaptcha,
    onCollision,
  } = useGame();

  const isPlaying = gameState === 'playing';

  // Отправляем кадры с камеры на CV-сервер (включить когда сервер готов)
  useFrameSender({
    uploadUrl: `${CV_SERVER}/upload_frame`,
    enabled: false, // isPlaying — включить для реальных детекций
  });

  // mock — случайные события каждые 12 сек
  // real  — поменяй mode на 'real' и убери enabled: false выше
  useDetection({
    mode: 'mock',
    cvServerUrl: CV_SERVER,
    enabled: isPlaying,
    onCollision,
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      <CameraBackground />
      <div className="scanline" />

      {gameState === 'idle' && <StartScreen onStart={startGame} />}

      {gameState === 'playing' && (
        <HUD
          timeLeft={timeLeft}
          threatLevel={threatLevel}
          toasts={toasts}
          missionsCompleted={missionsCompleted}
          reactionTask={reactionTask}
          captchaTask={captchaTask}
          collisionFlash={collisionFlash}
          onCompleteReactionTask={completeReactionTask}
          onCompleteCaptcha={completeCaptcha}
        />
      )}

      {gameState === 'gameover' && (
        <GameOver
          missionsCompleted={missionsCompleted}
          totalBonusTime={totalBonusTime}
          onRestart={startGame}
        />
      )}
    </div>
  );
}
