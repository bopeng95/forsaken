import { useEffect, useState } from 'react';
import { GameView } from './components/GameView';
import { StartScreen } from './components/StartScreen';
import { clearPresses } from './input/keyboard';
import {
  DEFAULT_FORSAKEN_PREFS,
  DEFAULT_KEFKA_PREFS,
  buildUrl,
  parseRoute,
  type Route,
} from './routes';
import type { MechanicId, Spot } from './sim/core/types';
import type { StartPrefs } from './sim/forsaken/types';
import type { KefkaPrefs } from './sim/kefkasays/types';
import { MECHANICS, findSeed } from './sim/registry';

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

// Parsed once at load so a deep link (e.g. /kefka-says?role=M1&mark=water) boots straight
// into a sim; null (including any malformed URL) boots to the start screen.
const initialRoute = parseRoute(location.pathname, location.search);

export default function App() {
  const [mechanic, setMechanic] = useState<MechanicId>(initialRoute?.mechanic ?? 'forsaken');
  const [spot, setSpot] = useState<Spot | null>(initialRoute?.spot ?? null);
  const [forsakenPrefs, setForsakenPrefs] = useState<StartPrefs>(
    initialRoute?.forsakenPrefs ?? DEFAULT_FORSAKEN_PREFS,
  );
  const [kefkaPrefs, setKefkaPrefs] = useState<KefkaPrefs>(
    initialRoute?.kefkaPrefs ?? DEFAULT_KEFKA_PREFS,
  );
  const [seed, setSeed] = useState(() =>
    initialRoute
      ? findSeed(
          MECHANICS[initialRoute.mechanic]!,
          initialRoute.spot,
          initialRoute.mechanic === 'forsaken'
            ? initialRoute.forsakenPrefs
            : initialRoute.kefkaPrefs,
          randomSeed,
        )
      : 0,
  );
  const [run, setRun] = useState(0);
  const [rotateView, setRotateView] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [blindBait, setBlindBait] = useState(false);
  const [persistIcons, setPersistIcons] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState<Spot | null>(null);

  // prefs handed to findSeed for the active mechanic
  const prefsFor = (m: MechanicId): StartPrefs | KefkaPrefs =>
    m === 'forsaken' ? forsakenPrefs : kefkaPrefs;

  // Sync React state to a parsed URL; shared by popstate and Change Spot. Uses only state
  // setters, so the closure never goes stale. Display toggles (hints/speed/rotate/...) are
  // personal settings, not URL customizations — they survive every route change.
  const applyRoute = (route: Route | null) => {
    clearPresses();
    if (!route) {
      // '/' always means a clean default start screen (matching its empty query)
      setMechanic('forsaken');
      setForsakenPrefs(DEFAULT_FORSAKEN_PREFS);
      setKefkaPrefs(DEFAULT_KEFKA_PREFS);
      setRun(0);
      setFocus(null);
      setSpot(null);
      return;
    }
    // no seed in the URL: back/forward into a sim rolls a fresh pattern matching the prefs
    const prefs = route.mechanic === 'forsaken' ? route.forsakenPrefs : route.kefkaPrefs;
    setMechanic(route.mechanic);
    setForsakenPrefs(route.forsakenPrefs);
    setKefkaPrefs(route.kefkaPrefs);
    setSeed(findSeed(MECHANICS[route.mechanic]!, route.spot, prefs, randomSeed));
    setRun(0);
    setFocus(null);
    setSpot(route.spot);
  };

  useEffect(() => {
    // a bad deep link (unknown slug / missing role) renders the start screen; make the URL
    // agree (replaceState is idempotent, so the StrictMode double-run is harmless)
    if (!initialRoute && location.pathname !== '/') history.replaceState(null, '', '/');
    const onPop = () => applyRoute(parseRoute(location.pathname, location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyRoute only touches stable setters
  }, []);

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
          history.pushState(null, '', buildUrl(mechanic, s, prefsFor(mechanic)));
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
      onExit={() => {
        // Change Spot behaves exactly like browser Back: land on a clean '/'
        history.pushState(null, '', '/');
        applyRoute(null);
      }}
    />
  );
}
