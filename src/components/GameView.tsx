import { useEffect, useRef, useState } from 'react';
import {
  attachKeyboard,
  consumeChangeSpot,
  consumeDash,
  consumePause,
  consumeReplay,
  consumeRestart,
  consumeSprint,
  inputVec,
} from '../input/keyboard';
import { Legend } from './Legend';
import { ROLE_COLOR, draw } from '../render/draw';
import { ICON_SHOW_T } from '../sim/constants';
import { SimEngine } from '../sim/engine';
import { rollAttempt } from '../sim/randomizer';
import type { Icon, Result, Spot } from '../sim/types';
import { SPOTS, roleOf } from '../sim/types';

interface Ui {
  hint: string;
  /** the Future/Past bait window is live (bait call → cleave lock) */
  baitActive: boolean;
  castLabel: string | null;
  castFrac: number;
  setIdx: number;
  icon: Icon | null;
  /** hide-icons mode: the icon's display window has expired */
  iconHidden: boolean;
  pips: number;
  /** whole seconds of sprint buff left (0 = not sprinting) */
  sprintActive: number;
  /** whole seconds until Shift is available again (0 = ready) */
  sprintCd: number;
  /** dash charges remaining (max 3) */
  dashCharges: number;
  /** whole seconds until the next dash charge (0 = full) */
  dashCd: number;
  /** sim clock has advanced past 0 (Start vs Resume label) */
  started: boolean;
  result: Result | null;
}

const ROT_SPEED = Math.PI; // rad/s camera swing toward the new set's frame

/** Custom dropdown: native <select> popups ignore option colors, so the role dots need our own menu. */
function FocusSelect({
  spot,
  focus,
  onFocus,
}: {
  spot: Spot;
  focus: Spot | null;
  onFocus: (s: Spot | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const pick = (s: Spot | null) => {
    onFocus(s);
    setOpen(false);
  };

  return (
    <div className="focus-select" ref={rootRef}>
      <button type="button" className="focus-btn" onClick={() => setOpen((o) => !o)}>
        {focus ? (
          <>
            <span className="focus-dot" style={{ background: ROLE_COLOR[roleOf(focus)] }} />
            {focus}
          </>
        ) : (
          'everyone'
        )}
      </button>
      {open && (
        <div className="focus-menu">
          <button
            type="button"
            className={`focus-option${focus === null ? ' selected' : ''}`}
            onClick={() => pick(null)}
          >
            everyone
          </button>
          {SPOTS.filter((s) => s !== spot).map((s) => (
            <button
              type="button"
              key={s}
              className={`focus-option${focus === s ? ' selected' : ''}`}
              onClick={() => pick(s)}
            >
              <span className="focus-dot" style={{ background: ROLE_COLOR[roleOf(s)] }} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GameView({
  spot,
  seed,
  rotateView,
  onRotateView,
  showHints,
  onShowHints,
  blindBait,
  onBlindBait,
  persistIcons,
  onPersistIcons,
  speed,
  onSpeed,
  focus,
  onFocus,
  onNewSeed,
  onSameSeed,
  onExit,
}: {
  spot: Spot;
  seed: number;
  rotateView: boolean;
  onRotateView: (on: boolean) => void;
  showHints: boolean;
  onShowHints: (on: boolean) => void;
  blindBait: boolean;
  onBlindBait: (on: boolean) => void;
  persistIcons: boolean;
  onPersistIcons: (on: boolean) => void;
  speed: number;
  onSpeed: (x: number) => void;
  focus: Spot | null;
  onFocus: (s: Spot | null) => void;
  onNewSeed: () => void;
  onSameSeed: () => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SimEngine | null>(null);
  const rotateViewRef = useRef(rotateView);
  const showHintsRef = useRef(showHints);
  const blindBaitRef = useRef(blindBait);
  const persistIconsRef = useRef(persistIcons);
  const speedRef = useRef(speed);
  const focusRef = useRef(focus);
  const pausedRef = useRef(true);
  const onExitRef = useRef(onExit);
  const onNewSeedRef = useRef(onNewSeed);
  const onSameSeedRef = useRef(onSameSeed);
  const viewRotRef = useRef(0);
  const [paused, setPaused] = useState(true);
  const [ui, setUi] = useState<Ui | null>(null);
  const uiJson = useRef('');

  rotateViewRef.current = rotateView;
  showHintsRef.current = showHints;
  blindBaitRef.current = blindBait;
  persistIconsRef.current = persistIcons;
  speedRef.current = speed;
  focusRef.current = focus;
  pausedRef.current = paused;
  onExitRef.current = onExit;
  onNewSeedRef.current = onNewSeed;
  onSameSeedRef.current = onSameSeed;

  useEffect(() => {
    attachKeyboard();
    const engine = new SimEngine(rollAttempt(seed), spot);
    engineRef.current = engine;

    const canvas = canvasRef.current!;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      if (consumeRestart()) {
        onNewSeedRef.current(); // remount cancels this rAF loop
        return;
      }

      if (consumeReplay()) {
        onSameSeedRef.current(); // remount cancels this rAF loop
        return;
      }

      if (consumeChangeSpot()) {
        onExitRef.current(); // unmount cancels this rAF loop
        return;
      }

      if (consumePause() && !engine.result) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      }

      // ease the camera toward the current set's frame (towers at screen-south)
      const target =
        rotateViewRef.current && engine.currentSet > 0
          ? (((180 - engine.plans[engine.currentSet - 1].southDeg) % 360) * Math.PI) / 180
          : 0;
      let diff = target - viewRotRef.current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest arc, ±π
      const maxStep = ROT_SPEED * Math.min(dt, 0.1);
      viewRotRef.current += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
      const rot = viewRotRef.current;

      // keyboard is screen-relative: undo the camera rotation for the engine
      const v = inputVec();
      const rc = Math.cos(-rot);
      const rs = Math.sin(-rot);
      const sprintPressed = consumeSprint(); // consume even while paused so queued
      const dashPressed = consumeDash(); // presses don't fire on resume
      if (!pausedRef.current) {
        engine.update(
          dt * speedRef.current,
          { x: v.x * rc - v.y * rs, y: v.x * rs + v.y * rc },
          sprintPressed,
          dashPressed,
        );
      }

      const cssSize = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssSize * dpr)) {
        canvas.width = Math.round(cssSize * dpr);
        canvas.height = Math.round(cssSize * dpr);
      }
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.scale(dpr, dpr);
      draw(
        ctx,
        engine,
        cssSize,
        rot,
        showHintsRef.current,
        focusRef.current,
        blindBaitRef.current,
        persistIconsRef.current,
      );
      ctx.restore();

      const cast = engine.castBar;
      const sprint = engine.sprint;
      const dash = engine.dash;
      const snapshot: Ui = {
        hint: engine.hint,
        baitActive: engine.baitMarker !== null,
        castLabel: cast?.label ?? null,
        castFrac: cast ? Math.round(cast.frac * 50) / 50 : 0,
        setIdx: engine.currentSet,
        icon: engine.icons[spot],
        iconHidden: !persistIconsRef.current && engine.t - engine.iconSetAt[spot] >= ICON_SHOW_T,
        pips: engine.stacksLeft[spot],
        sprintActive: Math.ceil(sprint.activeLeft),
        sprintCd: Math.ceil(sprint.cooldownLeft),
        dashCharges: dash.charges,
        dashCd: Math.ceil(dash.rechargeLeft),
        started: engine.t > 0,
        result: engine.result,
      };
      const json = JSON.stringify(snapshot);
      if (json !== uiJson.current) {
        uiJson.current = json;
        setUi(snapshot);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seed, spot]);

  return (
    <div className="game">
      <div className="game-row">
        <div className="canvas-wrap">
        <canvas ref={canvasRef} className="arena" />

        {ui?.result && (
          <div className={`result-banner ${ui.result.kind}`}>
            <strong>{ui.result.kind === 'clear' ? 'Forsaken resolved!' : 'Wipe'}</strong>
            {ui.result.kind === 'fail' && <span className="reason">{ui.result.reason}</span>}
          </div>
        )}

        <div className="hud-top">
          <span className="hud-set">{ui?.setIdx ? `Towers ${ui.setIdx}/8` : 'Setup'}</span>
          {ui?.castLabel && (
            <div className="castbar">
              <div className="castbar-fill" style={{ width: `${(ui.castFrac * 100).toFixed(0)}%` }} />
              <span>{ui.castLabel}</span>
            </div>
          )}
          <span className="hud-you">
            {spot} · {ui?.icon ? (ui.iconHidden ? '?' : ui.icon.toUpperCase()) : '—'} ·{' '}
            {ui?.pips ?? 4} left
          </span>
        </div>

        {showHints && !(blindBait && ui?.baitActive) && (
          <div className="hud-bottom">{ui?.hint}</div>
        )}
        </div>
        <div className="side-col">
          <Legend />
          <div className={`sprint-panel${ui && ui.sprintActive > 0 ? ' active' : ''}`}>
            {!ui || ui.sprintCd === 0
              ? 'Sprint ready — press Shift'
              : ui.sprintActive > 0
                ? `Sprinting — ${ui.sprintActive}s (recharge ${ui.sprintCd}s)`
                : `Sprint recharging — ${ui.sprintCd}s`}
          </div>
          <div className="dash-panel">
            {(() => {
              const charges = ui?.dashCharges ?? 3;
              const pips = '●'.repeat(charges) + '○'.repeat(3 - charges);
              return charges === 3
                ? `Dash ${pips} — press 1`
                : `Dash ${pips} — next in ${ui!.dashCd}s`;
            })()}
          </div>
          <div className="controls-panel">
            <button
              className={`panel-btn${paused ? ' primary' : ''}`}
              disabled={!!ui?.result}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (ui?.started ? 'Resume' : 'Start') : 'Pause'} <kbd>Space</kbd>
            </button>
            <label className="controls-row">
              <span>Speed</span>
              <input
                type="range"
                min={1}
                max={2}
                step={0.2}
                value={speed}
                onChange={(e) => onSpeed(Number(e.target.value))}
              />
              <span className="speed-val">{speed.toFixed(1)}×</span>
            </label>
            <div className="controls-row">
              <span>Focus</span>
              <FocusSelect spot={spot} focus={focus} onFocus={onFocus} />
            </div>
            <label className="controls-check">
              <input
                type="checkbox"
                checked={showHints}
                onChange={(e) => onShowHints(e.target.checked)}
              />
              hints
            </label>
            <label className="controls-check">
              <input
                type="checkbox"
                checked={blindBait}
                onChange={(e) => onBlindBait(e.target.checked)}
              />
              blind F/P bait
            </label>
            <label className="controls-check">
              <input
                type="checkbox"
                checked={persistIcons}
                onChange={(e) => onPersistIcons(e.target.checked)}
              />
              display debuff indefinitely
            </label>
            <label className="controls-check">
              <input
                type="checkbox"
                checked={rotateView}
                onChange={(e) => onRotateView(e.target.checked)}
              />
              rotate towers south
            </label>
            <button className="panel-btn" onClick={onNewSeed}>
              Restart <kbd>R</kbd>
            </button>
            <button className="panel-btn" onClick={onSameSeed}>
              Replay Pattern <kbd>T</kbd>
            </button>
            <button className="panel-btn" onClick={onExit}>
              Change Role <kbd>C</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
