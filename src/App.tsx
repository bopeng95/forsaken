import { useState } from 'react';
import { GameView } from './components/GameView';
import { StartScreen } from './components/StartScreen';
import type { Spot } from './sim/types';

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export default function App() {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [seed, setSeed] = useState(randomSeed);
  const [run, setRun] = useState(0);
  const [rotateView, setRotateView] = useState(false);

  if (!spot) {
    return <StartScreen onStart={(s) => setSpot(s)} />;
  }

  return (
    <GameView
      key={`${spot}:${seed}:${run}`}
      spot={spot}
      seed={seed}
      rotateView={rotateView}
      onRotateView={setRotateView}
      onNewSeed={() => {
        setSeed(randomSeed());
        setRun((r) => r + 1);
      }}
      onSameSeed={() => setRun((r) => r + 1)}
      onExit={() => setSpot(null)}
    />
  );
}
