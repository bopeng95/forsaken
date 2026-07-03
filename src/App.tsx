import { useState } from 'react';
import { GameView } from './components/GameView';
import { StartScreen } from './components/StartScreen';
import { findSeed } from './sim/randomizer';
import type { Spot, StartPrefs } from './sim/types';

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export default function App() {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [prefs, setPrefs] = useState<StartPrefs>({ group: 'any', icon: 'any' });
  const [seed, setSeed] = useState(0);
  const [run, setRun] = useState(0);
  const [rotateView, setRotateView] = useState(false);
  const [showHints, setShowHints] = useState(false);

  if (!spot) {
    return (
      <StartScreen
        prefs={prefs}
        onPrefsChange={setPrefs}
        onStart={(s, p) => {
          setPrefs(p);
          setSeed(findSeed(s, p, randomSeed));
          setSpot(s);
        }}
      />
    );
  }

  return (
    <GameView
      key={`${spot}:${seed}:${run}`}
      spot={spot}
      seed={seed}
      rotateView={rotateView}
      onRotateView={setRotateView}
      showHints={showHints}
      onShowHints={setShowHints}
      onNewSeed={() => {
        setSeed(findSeed(spot, prefs, randomSeed));
        setRun((r) => r + 1);
      }}
      onSameSeed={() => setRun((r) => r + 1)}
      onExit={() => setSpot(null)}
    />
  );
}
