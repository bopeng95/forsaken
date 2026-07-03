import { useEffect, useRef, useState } from 'react';
import {
  attachKeyboard,
  consumeDash,
  consumePause,
  consumeRestart,
  consumeSprint,
  inputVec,
} from '../input/keyboard';
import { Legend } from './Legend';
import { draw } from '../render/draw';
import { SimEngine } from '../sim/engine';
import { rollAttempt } from '../sim/randomizer';
import type { Icon, Result, Spot } from '../sim/types';
import { SPOTS } from '../sim/types';

interface Ui {
  hint: string;
  castLabel: string | null;
  castFrac: number;
  setIdx: number;
  icon: Icon | null;
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

const SPEEDS: Array<{ label: string; value: number }> = [
  { label: 'Slow', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: 'Fast', value: 1.5 },
];

const ROT_SPEED = Math.PI; // rad/s camera swing toward the new set's frame

export function GameView({
  spot,
  seed,
  rotateView,
  onRotateView,
  showHints,
  onShowHints,
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
  const autopilotRef = useRef(false);
  const rotateViewRef = useRef(rotateView);
  const showHintsRef = useRef(showHints);
  const speedRef = useRef(speed);
  const focusRef = useRef(focus);
  const pausedRef = useRef(true);
  const onExitRef = useRef(onExit);
  const viewRotRef = useRef(0);
  const [autopilot, setAutopilot] = useState(false);
  const [paused, setPaused] = useState(true);
  const [ui, setUi] = useState<Ui | null>(null);
  const uiJson = useRef('');

  autopilotRef.current = autopilot;
  rotateViewRef.current = rotateView;
  showHintsRef.current = showHints;
  speedRef.current = speed;
  focusRef.current = focus;
  pausedRef.current = paused;
  onExitRef.current = onExit;

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
          autopilotRef.current,
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
      draw(ctx, engine, cssSize, rot, showHintsRef.current, focusRef.current);
      ctx.restore();

      const cast = engine.castBar;
      const sprint = engine.sprint;
      const dash = engine.dash;
      const snapshot: Ui = {
        hint: engine.hint,
        castLabel: cast?.label ?? null,
        castFrac: cast ? Math.round(cast.frac * 50) / 50 : 0,
        setIdx: engine.currentSet,
        icon: engine.icons[spot],
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
            <div className="buttons">
              <button className="primary" onClick={onNewSeed}>
                Try Again
              </button>
              <button onClick={onSameSeed}>Retry Same Pattern</button>
              <button onClick={onExit}>Change Spot</button>
            </div>
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
            {spot} · {ui?.icon ? ui.icon.toUpperCase() : '—'} · {ui?.pips ?? 4} left
          </span>
        </div>

        {showHints && <div className="hud-bottom">{ui?.hint}</div>}
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
            <div className="controls-row">
              <span>Speed</span>
              {SPEEDS.map((o) => (
                <button
                  key={o.label}
                  className={`toggle${speed === o.value ? ' active' : ''}`}
                  onClick={() => onSpeed(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="controls-row">
              <span>Focus</span>
              <select
                value={focus ?? ''}
                onChange={(e) => onFocus(e.target.value === '' ? null : (e.target.value as Spot))}
              >
                <option value="">everyone</option>
                {SPOTS.filter((s) => s !== spot).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
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
                checked={autopilot}
                onChange={(e) => setAutopilot(e.target.checked)}
              />
              autopilot (bot plays your role)
            </label>
            <label className="controls-check">
              <input
                type="checkbox"
                checked={rotateView}
                onChange={(e) => onRotateView(e.target.checked)}
              />
              rotate towers south
            </label>
            <button className="panel-btn" onClick={onExit}>
              Restart <kbd>R</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
