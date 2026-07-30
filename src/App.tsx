import { useState } from 'react';
import { GameView } from './components/GameView';
import { StartScreen } from './components/StartScreen';
import type { MechanicId, Spot } from './sim/core/types';
import type { StartPrefs } from './sim/forsaken/types';
import type { KefkaPrefs } from './sim/kefkasays/types';
import { MECHANICS, findSeed } from './sim/registry';

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export default function App() {
  const [mechanic, setMechanic] = useState<MechanicId>('forsaken');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [forsakenPrefs, setForsakenPrefs] = useState<StartPrefs>({ group: 'any', icon: 'any' });
  const [kefkaPrefs, setKefkaPrefs] = useState<KefkaPrefs>({
    mark: 'any',
    markWindow: 'any',
    gaze: 'any',
    field: 'any',
  });
  const [seed, setSeed] = useState(0);
  const [run, setRun] = useState(0);
  const [rotateView, setRotateView] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [blindBait, setBlindBait] = useState(false);
  const [persistIcons, setPersistIcons] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState<Spot | null>(null);

  // prefs handed to findSeed for the active mechanic
  const prefsFor = (m: MechanicId): unknown => (m === 'forsaken' ? forsakenPrefs : kefkaPrefs);

  if (!spot) {
    return (
      <StartScreen
        mechanic={mechanic}
        onMechanic={setMechanic}
        forsakenPrefs={forsakenPrefs}
        onForsakenPrefs={setForsakenPrefs}
        kefkaPrefs={kefkaPrefs}
        onKefkaPrefs={setKefkaPrefs}
        onStart={(s) => {
          setSeed(findSeed(MECHANICS[mechanic]!, s, prefsFor(mechanic), randomSeed));
          setFocus(null);
          setSpot(s);
        }}
      />
    );
  }

  return (
    <GameView
      key={`${mechanic}:${spot}:${seed}:${run}`}
      mechanic={mechanic}
      spot={spot}
      seed={seed}
      rotateView={rotateView}
      onRotateView={setRotateView}
      showHints={showHints}
      onShowHints={setShowHints}
      blindBait={blindBait}
      onBlindBait={setBlindBait}
      persistIcons={persistIcons}
      onPersistIcons={setPersistIcons}
      speed={speed}
      onSpeed={setSpeed}
      focus={focus}
      onFocus={setFocus}
      onNewSeed={() => {
        setSeed(findSeed(MECHANICS[mechanic]!, spot, prefsFor(mechanic), randomSeed));
        setRun((r) => r + 1);
      }}
      onSameSeed={() => setRun((r) => r + 1)}
      onExit={() => setSpot(null)}
    />
  );
}
