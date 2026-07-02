import { useEffect, useRef, useState } from 'react';
import { attachKeyboard, consumeSprint, inputVec } from '../input/keyboard';
import { Legend } from './Legend';
import { draw } from '../render/draw';
import { SimEngine } from '../sim/engine';
import { rollAttempt } from '../sim/randomizer';
import type { Icon, Result, Spot } from '../sim/types';

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
  result: Result | null;
}

const ROT_SPEED = Math.PI; // rad/s camera swing toward the new set's frame

export function GameView({
  spot,
  seed,
  rotateView,
  onRotateView,
  onNewSeed,
  onSameSeed,
  onExit,
}: {
  spot: Spot;
  seed: number;
  rotateView: boolean;
  onRotateView: (on: boolean) => void;
  onNewSeed: () => void;
  onSameSeed: () => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SimEngine | null>(null);
  const autopilotRef = useRef(false);
  const rotateViewRef = useRef(rotateView);
  const viewRotRef = useRef(0);
  const [autopilot, setAutopilot] = useState(false);
  const [ui, setUi] = useState<Ui | null>(null);
  const uiJson = useRef('');

  autopilotRef.current = autopilot;
  rotateViewRef.current = rotateView;

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
      engine.update(
        dt,
        { x: v.x * rc - v.y * rs, y: v.x * rs + v.y * rc },
        autopilotRef.current,
        consumeSprint(),
      );

      const cssSize = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssSize * dpr)) {
        canvas.width = Math.round(cssSize * dpr);
        canvas.height = Math.round(cssSize * dpr);
      }
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.scale(dpr, dpr);
      draw(ctx, engine, cssSize, rot);
      ctx.restore();

      const cast = engine.castBar;
      const sprint = engine.sprint;
      const snapshot: Ui = {
        hint: engine.hint,
        castLabel: cast?.label ?? null,
        castFrac: cast ? Math.round(cast.frac * 50) / 50 : 0,
        setIdx: engine.currentSet,
        icon: engine.icons[spot],
        pips: engine.stacksLeft[spot],
        sprintActive: Math.ceil(sprint.activeLeft),
        sprintCd: Math.ceil(sprint.cooldownLeft),
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

        <div className="hud-bottom">{ui?.hint}</div>
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
        </div>
      </div>

      <div className="toolbar">
        <label>
          <input
            type="checkbox"
            checked={autopilot}
            onChange={(e) => setAutopilot(e.target.checked)}
          />
          autopilot (watch a bot play your spot)
        </label>
        <label>
          <input
            type="checkbox"
            checked={rotateView}
            onChange={(e) => onRotateView(e.target.checked)}
          />
          rotate camera (towers always south)
        </label>
        <span className="seed">seed {seed}</span>
        <button onClick={onExit}>← change spot</button>
      </div>
    </div>
  );
}
