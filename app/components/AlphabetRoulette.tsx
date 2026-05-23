"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { Volume2 } from "lucide-react";

// ─── Static configuration ─────────────────────────────────────────────────────

/** Gap in ms between the two letter-audio plays */
const DOUBLE_PLAY_GAP_MS = 800;

/** Countdown seconds before moving to the next letter */
const COUNTDOWN_SECONDS = 5;

/** Tick sound frequency in Hz (synthesised via Web Audio — no file needed) */
const TICK_HZ = 880;

/**
 * How many px of drag equal one full letter step.
 * Lower = more sensitive. Proportional skipping kicks in beyond this threshold.
 */
const PX_PER_STEP = 80;

// ─── Audio helpers ────────────────────────────────────────────────────────────

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as string[];

type AudioMap = Record<string, HTMLAudioElement>;

// SSR guard: never call new Audio() on the server
function buildAudioMap(): AudioMap {
  if (typeof window === "undefined") return {};
  const map: AudioMap = {};
  for (const l of LETTERS) {
    map[l] = new Audio(`/alphabet/${l}.wav`);
    map[l].preload = "auto";
  }
  return map;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playTick(ctx: AudioContext, freq = TICK_HZ) {
  // Resume context first — required on HTTPS after page load
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

type Phase = "listen" | "countdown";

// ─── Draggable strip component ────────────────────────────────────────────────

interface StripProps {
  queue: string[];
  queueIdx: number;
  onNavigate: (newIdx: number) => void;
  variant: "roulette" | "letter";
  phase: Phase;
  countdown: number;
  onSoundClick: () => void;
}

function DraggableStrip({
  queue,
  queueIdx,
  onNavigate,
  variant,
  phase,
  countdown,
  onSoundClick,
}: StripProps) {
  const dragX = useMotionValue(0);
  const previewOffset = useTransform(dragX, (x) => -x / PX_PER_STEP);

  const [liveIdx, setLiveIdx] = useState<number>(queueIdx);

  useEffect(() => {
    const unsub = previewOffset.on("change", (v) => {
      const raw = queueIdx + v;
      setLiveIdx(Math.max(0, Math.min(queue.length - 1, raw)));
    });
    return unsub;
  }, [previewOffset, queueIdx, queue.length]);

  useEffect(() => {
    setLiveIdx(queueIdx);
    animate(dragX, 0, { duration: 0 });
  }, [queueIdx, dragX]);

  const handleDragEnd = useCallback(() => {
    const delta = -dragX.get() / PX_PER_STEP;
    const steps = Math.round(delta);
    const newIdx = Math.max(0, Math.min(queue.length - 1, queueIdx + steps));
    animate(dragX, 0, { type: "spring", stiffness: 400, damping: 35 });
    if (newIdx !== queueIdx) onNavigate(newIdx);
  }, [dragX, queueIdx, queue.length, onNavigate]);

  // ── Roulette variant ─────────────────────────────────────────────────────
  if (variant === "roulette") {
    const slots = [-2, -1, 0, 1, 2].map((offset) => {
      const idx = Math.round(liveIdx) + offset;
      const letter = idx >= 0 && idx < queue.length ? queue[idx] : "";
      return { letter, offset };
    });

    return (
      <motion.div
        className="strip-drag-zone"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        style={{ x: dragX }}
        onDragEnd={handleDragEnd}
      >
        <div className="roulette-panel">
          <p className="roulette-label">◀ drag ▶</p>
          <div className="roulette-track">
            {slots.map(({ letter, offset }) => {
              const distFromCenter = Math.abs(
                liveIdx - (Math.round(liveIdx) + offset)
              );
              const opacity = Math.max(0.15, 1 - distFromCenter * 0.35);
              const scale =
                offset === 0
                  ? 1
                  : 0.55 + (1 - Math.min(distFromCenter, 1)) * 0.1;
              return (
                <motion.div
                  key={offset}
                  className={`roulette-item ${offset === 0 ? "active" : ""}`}
                  animate={{ opacity, scale }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {letter}
                </motion.div>
              );
            })}
            <div className="roulette-highlight" />
          </div>
          <div className="drag-hint-dots">
            {queue.map((_, i) => (
              <span
                key={i}
                className="dot"
                style={{ opacity: i === queueIdx ? 1 : 0.2 }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Letter variant ───────────────────────────────────────────────────────
  const roundedIdx = Math.round(liveIdx);
  const displayLetter = queue[roundedIdx] ?? "";

  return (
    <motion.div
      className="strip-drag-zone"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      style={{ x: dragX }}
      onDragEnd={handleDragEnd}
    >
      <div className="letter-panel">
        <AnimatePresence mode="wait">
          {phase === "listen" ? (
            <motion.div
              key={`listen-${displayLetter}`}
              className="listen-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="neighbour-ghost left">
                {queue[roundedIdx - 1] ?? ""}
              </div>
              <div className="main-letter-wrap">
                <motion.div
                  className="big-letter"
                  animate={{
                    scale:
                      1 + (Math.abs(dragX.get()) / PX_PER_STEP) * 0.04,
                  }}
                >
                  {displayLetter}
                </motion.div>
                <motion.button
                  className="sound-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSoundClick();
                  }}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Play sound"
                >
                  <Volume2 size={36} />
                </motion.button>
              </div>
              <div className="neighbour-ghost right">
                {queue[roundedIdx + 1] ?? ""}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="countdown"
              className="countdown-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={countdown}
                  className="countdown-number"
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  {countdown}
                </motion.div>
              </AnimatePresence>
              <p className="countdown-hint">repeat the letter!</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AlphabetRoulette() {
  const audioMapRef = useRef<AudioMap | null>(null);
  const repeatRef = useRef<HTMLAudioElement | null>(null);
  // AudioContext is created lazily on first user gesture — required on HTTPS
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sequenceAbortRef = useRef<boolean>(false);

  const [queue, setQueue] = useState<string[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("listen");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const currentLetter = queue[queueIdx] ?? "";

  // ── Init — client-only, no window access at module level ─────────────────
  useEffect(() => {
    // buildAudioMap already guards typeof window, but the useEffect itself
    // only ever runs in the browser, so both are safe.
    audioMapRef.current = buildAudioMap();

    const repeat = new Audio("/alphabet/narrator/repeat_hint.wav");
    repeat.preload = "auto";
    repeatRef.current = repeat;

    // DO NOT create AudioContext here — browsers require a user gesture first.
    // audioCtxRef is populated lazily in getAudioContext() below.

    setQueue(shuffle(LETTERS));
  }, []);

  // ── Lazy AudioContext — created/resumed only after a user gesture ─────────
  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    }
    // Browsers may suspend the context even after creation; always resume.
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // ── Stop all audio ────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    sequenceAbortRef.current = true;
    if (!audioMapRef.current) return;
    for (const l of LETTERS) {
      const a = audioMapRef.current[l];
      if (!a) continue;
      a.pause();
      a.currentTime = 0;
      a.onended = null;
    }
    if (repeatRef.current) {
      repeatRef.current.pause();
      repeatRef.current.currentTime = 0;
      repeatRef.current.onended = null;
    }
  }, []);

  // ── Play sequence ─────────────────────────────────────────────────────────
  const playLetterSequence = useCallback(
    (letter: string) => {
      const map = audioMapRef.current;
      const repeat = repeatRef.current;
      if (!map || !repeat) return;

      // Ensure AudioContext is alive (user has already interacted at this point)
      getAudioContext();

      sequenceAbortRef.current = false;

      const audio = map[letter];
      if (!audio) return;
      audio.currentTime = 0;

      audio.play().catch(() => {
        // Autoplay blocked — silently ignore; user can tap the sound button
      });

      audio.onended = () => {
        if (sequenceAbortRef.current) return;
        setTimeout(() => {
          if (sequenceAbortRef.current) return;
          audio.currentTime = 0;
          audio.play().catch(() => {});
          audio.onended = () => {
            if (sequenceAbortRef.current) return;
            repeat.currentTime = 0;
            repeat.play().catch(() => {});
            repeat.onended = () => {
              if (sequenceAbortRef.current) return;
              setPhase("countdown");
              setCountdown(COUNTDOWN_SECONDS);
            };
          };
        }, DOUBLE_PLAY_GAP_MS);
      };
    },
    [getAudioContext]
  );

  // Trigger on letter change
  useEffect(() => {
    if (currentLetter && phase === "listen") {
      playLetterSequence(currentLetter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLetter]);

  // ── Navigate (from drag) ──────────────────────────────────────────────────
  const handleNavigate = useCallback(
    (newIdx: number) => {
      stopAll();
      setPhase("listen");
      setQueueIdx(newIdx);
    },
    [stopAll]
  );

  // ── Countdown + tick ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;

    if (countdown <= 0) {
      setPhase("listen");
      setQueueIdx((i) => {
        const next = i + 1;
        if (next >= queue.length) {
          setQueue(shuffle(LETTERS));
          return 0;
        }
        return next;
      });
      return;
    }

    // Tick is synthesised — uses the lazy AudioContext (safe; user clicked)
    const ctx = getAudioContext();
    if (ctx) playTick(ctx);

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, queue, getAudioContext]);

  // ── Sound-icon click ──────────────────────────────────────────────────────
  const handleSoundClick = useCallback(() => {
    if (phase === "listen") playLetterSequence(currentLetter);
  }, [phase, currentLetter, playLetterSequence]);

  // ─────────────────────────────────────────────────────────────────────────
  if (!queue.length) return null;

  return (
    <>
      <style>{css}</style>
      <div className="app-root">
        <header className="app-header">
          <span className="app-logo">🔤</span>
          <h1 className="app-title">Alphabet Roulette</h1>
          <div className="letter-badge">{currentLetter}</div>
        </header>

        <main className="panels-row">
          {/* Roulette panel */}
          <div className="panel-wrapper">
            <DraggableStrip
              queue={queue}
              queueIdx={queueIdx}
              onNavigate={handleNavigate}
              variant="roulette"
              phase={phase}
              countdown={countdown}
              onSoundClick={handleSoundClick}
            />
          </div>

          {/* Letter / countdown panel */}
          <div className="panel-wrapper">
            <DraggableStrip
              queue={queue}
              queueIdx={queueIdx}
              onNavigate={handleNavigate}
              variant="letter"
              phase={phase}
              countdown={countdown}
              onSoundClick={handleSoundClick}
            />
          </div>
        </main>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0f0e17;
    --surface:   #1a1829;
    --card:      #231f36;
    --accent1:   #ff6b6b;
    --accent2:   #ffd93d;
    --accent3:   #6bcb77;
    --accent4:   #4d96ff;
    --text:      #fffffe;
    --subtext:   #a7a9be;
    --radius:    20px;
    --font-head: 'Fredoka One', cursive;
    --font-body: 'Nunito', sans-serif;
  }

  .app-root {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  .app-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 28px;
    background: var(--surface);
    border-bottom: 2px solid #2e2b45;
    flex-shrink: 0;
  }
  .app-logo { font-size: 1.8rem; }
  .app-title {
    font-family: var(--font-head);
    font-size: 1.6rem;
    color: var(--accent2);
    letter-spacing: 0.5px;
    flex: 1;
  }
  .letter-badge {
    font-family: var(--font-head);
    font-size: 1.4rem;
    background: var(--accent1);
    color: #fff;
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Panels row ── */
  .panels-row {
    display: flex;
    flex: 1;
    align-items: stretch;
    padding: 20px;
    gap: 16px;
    height: calc(100vh - 82px);
    overflow: hidden;
  }

  .panel-wrapper {
    flex: 1;
    background: var(--card);
    border-radius: var(--radius);
    border: 1px solid #2e2b45;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    overflow: hidden;
    position: relative;
    cursor: grab;
  }
  .panel-wrapper:active { cursor: grabbing; }

  /* ── Drag zone fills panel ── */
  .strip-drag-zone {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: stretch;
    touch-action: pan-y;
    user-select: none;
  }

  /* ── Roulette panel ── */
  .roulette-panel {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 12px;
    gap: 12px;
    position: relative;
  }
  .roulette-label {
    font-size: 0.65rem;
    letter-spacing: 3px;
    color: var(--subtext);
    font-weight: 800;
    text-transform: uppercase;
  }
  .roulette-track {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    flex: 1;
    justify-content: center;
  }
  .roulette-item {
    font-family: var(--font-head);
    font-size: clamp(1.8rem, 5.5vw, 4.5rem);
    color: var(--subtext);
    line-height: 1.15;
    text-align: center;
    width: 100%;
    transition: color 0.2s;
  }
  .roulette-item.active {
    color: var(--accent2);
    font-size: clamp(3rem, 9vw, 7.5rem);
    text-shadow: 0 0 40px rgba(255,217,61,0.45);
  }
  .roulette-highlight {
    position: absolute;
    top: 50%; left: 12px; right: 12px;
    transform: translateY(-50%);
    height: clamp(55px, 12vw, 100px);
    border: 2px solid var(--accent2);
    border-radius: 14px;
    pointer-events: none;
    opacity: 0.2;
  }

  /* Progress dots */
  .drag-hint-dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    padding: 0 8px;
    max-width: 100%;
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent2);
    display: inline-block;
    transition: opacity 0.2s;
  }

  /* ── Letter panel ── */
  .letter-panel {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .listen-view {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    padding: 16px;
  }

  /* Ghost neighbours hint drag direction */
  .neighbour-ghost {
    font-family: var(--font-head);
    font-size: clamp(2rem, 6vw, 5rem);
    color: var(--subtext);
    opacity: 0.18;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    user-select: none;
  }
  .neighbour-ghost.left  { left: 14px; }
  .neighbour-ghost.right { right: 14px; }

  .main-letter-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    z-index: 1;
  }

  .big-letter {
    font-family: var(--font-head);
    font-size: clamp(5rem, 18vw, 16rem);
    line-height: 1;
    color: var(--text);
    text-shadow:
      0 0 80px rgba(255,107,107,0.3),
      0 4px 24px rgba(0,0,0,0.5);
    user-select: none;
    text-align: center;
  }

  .sound-btn {
    background: var(--accent4);
    border: none;
    color: #fff;
    border-radius: 50%;
    width: 68px; height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(77,150,255,0.4);
    transition: background 0.2s;
  }
  .sound-btn:hover { background: #3a7de8; }

  /* ── Countdown view ── */
  .countdown-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    height: 100%;
  }
  .countdown-number {
    font-family: var(--font-head);
    font-size: clamp(6rem, 20vw, 16rem);
    line-height: 1;
    color: var(--accent3);
    text-shadow: 0 0 60px rgba(107,203,119,0.45);
  }
  .countdown-hint {
    font-size: clamp(0.8rem, 1.8vw, 1.1rem);
    color: var(--subtext);
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .panels-row { padding: 10px; gap: 10px; }
    .app-title  { font-size: 1.2rem; }
    .dot        { width: 5px; height: 5px; }
  }
`;