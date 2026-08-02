import { useEffect, useRef, useState } from 'react';
import allaganIcon from '../assets/debuffs/allagan.png';
import accelIcon from '../assets/debuffs/accel.png';
import beyondIcon from '../assets/debuffs/beyond.png';
import entropyIcon from '../assets/debuffs/entropy.png';
import fluidIcon from '../assets/debuffs/fluid.png';
import lightningIcon from '../assets/debuffs/lightning.png';
import shriekIcon from '../assets/debuffs/shriek.png';
import waterIcon from '../assets/debuffs/water.png';
import woundBlackIcon from '../assets/debuffs/wound-black.png';
import woundWhiteIcon from '../assets/debuffs/wound-white.png';
import {
  attachKeyboard,
  consumeChangeSpot,
  consumeDash,
  consumePause,
  consumeReplay,
  consumeRestart,
  consumeRewind,
  consumeSprint,
  inputVec,
} from '../input/keyboard';
import { ROLE_COLOR, draw } from '../render/draw';
import type { RF } from '../sim/core/engine';
import type { MechanicId, Result, Spot } from '../sim/core/types';
import { SPOTS, roleOf } from '../sim/core/types';
import { ICON_SHOW_T } from '../sim/forsaken/constants';
import type { SimEngine } from '../sim/forsaken/engine';
import type { Icon } from '../sim/forsaken/types';
import type { KefkaEngine } from '../sim/kefkasays/engine';
import type { AnyEngine } from '../sim/registry';
import { MECHANICS } from '../sim/registry';
import { LegendForsaken } from './LegendForsaken';
import { LegendKefkaSays } from './LegendKefkaSays';

interface KefkaChip {
  kind: string;
  /** whole seconds until it resolves */
  left: number;
  /** wound color only — picks the white/black icon */
  color?: string;
  /** real/fake of the applying cast — hints mode marks fakes with a "?" */
  rf: RF;
}

/** the mechanic-specific slice of the per-frame Ui snapshot */
type HudData =
  | {
      kind: 'forsaken';
      /** the Future/Past bait window is live (bait call → cleave lock) */
      baitActive: boolean;
      setIdx: number;
      icon: Icon | null;
      /** hide-icons mode: the icon's display window has expired */
      iconHidden: boolean;
      pips: number;
    }
  | {
      kind: 'kefkasays';
      phase: string;
      debuffs: KefkaChip[];
      manaRings: { thunder: RF; ice: RF } | null;
    };

const KEFKA_CHIP_LABEL: Record<string, string> = {
  water: 'Compressed Water',
  lightning: 'Forked Lightning',
  shriek: 'Cursed Shriek',
  accel: 'Acceleration Bomb',
  entropy: 'Entropy',
  fluid: 'Dynamic Fluid',
  wound: 'Wound',
  allagan: 'Allagan Field',
  beyond: 'Beyond Death',
};
/**
 * FFXIV status icons (raidplan slides 2-5). Like in game, the icons never
 * reveal real/fake — read that from the cast-bar tells.
 */
const KEFKA_DEBUFF_ICON: Record<string, string> = {
  water: waterIcon,
  lightning: lightningIcon,
  shriek: shriekIcon,
  accel: accelIcon,
  entropy: entropyIcon,
  fluid: fluidIcon,
  allagan: allaganIcon,
  beyond: beyondIcon,
};
function debuffIconFor(kind: string, color?: string): string | undefined {
  if (kind === 'wound') return color === 'black' ? woundBlackIcon : woundWhiteIcon;
  return KEFKA_DEBUFF_ICON[kind];
}
function debuffLabelFor(kind: string, color?: string): string {
  if (kind === 'wound') return color === 'black' ? 'Black Wound' : 'White Wound';
  return KEFKA_CHIP_LABEL[kind] ?? kind;
}

/** slide-6 tell glyph: blue circle = REAL, "?" in a circle = FAKE */
function TellDot({ rf }: { rf: RF }) {
  return rf === 'real' ? (
    <svg className="tell-dot" viewBox="0 0 14 14" aria-label="real">
      <circle cx="7" cy="7" r="6" fill="#4A90E2" />
    </svg>
  ) : (
    <svg className="tell-dot" viewBox="0 0 14 14" aria-label="fake">
      <circle cx="7" cy="7" r="6" fill="none" stroke="#cf2621" strokeWidth="1.6" />
      <text x="7" y="7.6" textAnchor="middle" dominantBaseline="middle" fill="#cf2621" fontSize="9" fontWeight="700">
        ?
      </text>
    </svg>
  );
}

/** lightning above, ice below — each element glyph next to its real/fake dot */
function TellRows({ tells }: { tells: { thunder?: RF; ice?: RF } }) {
  return (
    <span className="tell-rows">
      {tells.thunder && (
        <span className="tell-row" title={`Thunder: ${tells.thunder}`}>
          <svg viewBox="0 0 14 14" className="tell-elem">
            <path d="M8.5 1 3.5 8h3l-1 5 5-7h-3z" fill="#d8c24a" />
          </svg>
          <TellDot rf={tells.thunder} />
        </span>
      )}
      {tells.ice && (
        <span className="tell-row" title={`Ice: ${tells.ice}`}>
          <svg viewBox="0 0 14 14" className="tell-elem">
            <g stroke="#9fd8f0" strokeWidth="1.4" strokeLinecap="round">
              <line x1="7" y1="1.5" x2="7" y2="12.5" />
              <line x1="2.2" y1="4.2" x2="11.8" y2="9.8" />
              <line x1="11.8" y1="4.2" x2="2.2" y2="9.8" />
            </g>
          </svg>
          <TellDot rf={tells.ice} />
        </span>
      )}
    </span>
  );
}

interface UiCastBar {
  label: string;
  frac: number;
  caster?: string;
}

interface Ui {
  hint: string;
  castBars: UiCastBar[];
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
  /** a rewind checkpoint exists to return to, only while dead to a fail */
  canRewind: boolean;
  hud: HudData;
}

function snapshotHud(eng: AnyEngine, spot: Spot, persistIcons: boolean): HudData {
  if (eng.mechanicId === 'forsaken') {
    const e = eng as SimEngine;
    return {
      kind: 'forsaken',
      baitActive: e.baitMarker !== null,
      setIdx: e.currentSet,
      icon: e.icons[spot],
      iconHidden: !persistIcons && e.t - e.iconSetAt[spot] >= ICON_SHOW_T,
      pips: e.stacksLeft[spot],
    };
  }
  const e = eng as KefkaEngine;
  return {
    kind: 'kefkasays',
    phase: e.phaseLabel,
    manaRings: e.manaRings,
    debuffs: e.debuffsOf(spot).map((d) => ({
      kind: d.kind,
      left: Math.max(0, Math.ceil(d.expiresAt - e.t)),
      color: d.color,
      rf: d.rf,
    })),
  };
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
  mechanic,
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
  mechanic: MechanicId;
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
  const def = MECHANICS[mechanic]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AnyEngine | null>(null);
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
    const engine = def.create(def.roll(seed), spot);
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

      // rewind: on death, or step further back while paused (chained rewinds escape
      // a checkpoint whose replay deterministically re-wipes, e.g. a misaimed bait)
      if (
        consumeRewind() &&
        (engine.result?.kind === 'fail' || pausedRef.current) &&
        engine.rewind()
      ) {
        pausedRef.current = true;
        setPaused(true);
      }

      if (consumePause() && !engine.result) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      }

      // ease the camera toward the mechanic's frame target
      const target = rotateViewRef.current ? def.viewRotTarget(engine) : 0;
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
      draw(ctx, engine, cssSize, {
        viewRotRad: rot,
        showHints: showHintsRef.current,
        focus: focusRef.current,
        blindBait: blindBaitRef.current,
        persistIcons: persistIconsRef.current,
      });
      ctx.restore();

      const sprint = engine.sprint;
      const dash = engine.dash;
      const snapshot: Ui = {
        hint: engine.hint,
        castBars: engine.castBars.map((c) => ({
          label: c.label,
          frac: Math.round(c.frac * 50) / 50,
          caster: c.caster,
        })),
        sprintActive: Math.ceil(sprint.activeLeft),
        sprintCd: Math.ceil(sprint.cooldownLeft),
        dashCharges: dash.charges,
        dashCd: Math.ceil(dash.rechargeLeft),
        started: engine.t > 0,
        result: engine.result,
        canRewind: engine.result?.kind === 'fail' && engine.rewindInfo() !== null,
        hud: snapshotHud(engine, spot, persistIconsRef.current),
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
    // def is derived from the mechanic prop, which is part of the remount key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, spot, mechanic]);

  const fHud = ui?.hud.kind === 'forsaken' ? ui.hud : null;
  const kHud = ui?.hud.kind === 'kefkasays' ? ui.hud : null;

  return (
    <div className="game">
      <div className="game-row">
        <div className="canvas-wrap">
        <div className="hud-top">
          <span className="hud-set">
            {fHud ? (fHud.setIdx ? `Towers ${fHud.setIdx}/8` : 'Setup') : (kHud?.phase ?? def.title)}
          </span>
          <div className="castbar-stack">
            {(ui?.castBars ?? []).map((c) => (
              <div className="castbar" key={c.caster ?? c.label}>
                <div className="castbar-fill" style={{ width: `${(c.frac * 100).toFixed(0)}%` }} />
                <span>
                  {c.caster ? `${c.caster}: ` : ''}
                  {c.label}
                </span>
              </div>
            ))}
          </div>
          {fHud && (
            <span className="hud-you">
              {spot} · {fHud.icon ? (fHud.iconHidden ? '?' : fHud.icon.toUpperCase()) : '—'} ·{' '}
              {fHud.pips} left
            </span>
          )}
          {kHud && <span className="hud-you">{spot}</span>}
        </div>

        <canvas ref={canvasRef} className="arena" />

        {kHud && (kHud.debuffs.length > 0 || kHud.manaRings) && (
          <div className="debuff-tray">
            {kHud.debuffs.map((d, i) => (
              <div key={`${d.kind}${i}`} className="debuff" title={debuffLabelFor(d.kind, d.color)}>
                {showHints && d.rf === 'fake' && <span className="debuff-fake">?</span>}
                <img src={debuffIconFor(d.kind, d.color)} alt={debuffLabelFor(d.kind, d.color)} />
                <span className="debuff-timer">{d.left}</span>
              </div>
            ))}
            {kHud.manaRings && (
              <span className="chip chip-rings">
                Rings <TellRows tells={kHud.manaRings} />
              </span>
            )}
          </div>
        )}

        {ui?.result && (
          <div className={`result-banner ${ui.result.kind}`}>
            <strong>{ui.result.kind === 'clear' ? `${def.title} resolved!` : 'Wipe'}</strong>
            {ui.result.kind === 'fail' && <span className="reason">{ui.result.reason}</span>}
            {ui.result.kind === 'fail' && ui.canRewind && (
              <button
                className="panel-btn primary"
                onClick={() => {
                  const eng = engineRef.current;
                  if (eng?.rewind()) {
                    pausedRef.current = true;
                    setPaused(true);
                  }
                }}
              >
                Rewind <kbd>E</kbd>
              </button>
            )}
          </div>
        )}

        {showHints && !(blindBait && fHud?.baitActive) && ui?.hint && (
          <div className="hud-bottom">{ui.hint}</div>
        )}
        </div>
        <div className="side-col">
          {mechanic === 'forsaken' ? <LegendForsaken /> : <LegendKefkaSays />}
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
            {mechanic === 'forsaken' && (
              <>
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
              </>
            )}
            {def.rotateLabel && (
              <label className="controls-check">
                <input
                  type="checkbox"
                  checked={rotateView}
                  onChange={(e) => onRotateView(e.target.checked)}
                />
                {def.rotateLabel}
              </label>
            )}
            <button className="panel-btn" onClick={onNewSeed}>
              Restart <kbd>R</kbd>
            </button>
            <button className="panel-btn" onClick={onSameSeed}>
              Replay Pattern <kbd>T</kbd>
            </button>
            <button className="panel-btn" onClick={onExit}>
              Change Spot <kbd>C</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
