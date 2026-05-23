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

const DOUBLE_PLAY_GAP_MS = 800;
const COUNTDOWN_SECONDS  = 5;
const TICK_HZ            = 880;
/**
 * Pixels of drag per letter step. Lower = more sensitive on mobile.
 * 60px feels snappy on a phone without being accidental.
 */
const PX_PER_STEP = 60;

// ─── Audio helpers ────────────────────────────────────────────────────────────

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as string[];
type AudioMap = Record<string, HTMLAudioElement>;

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
  if (ctx.state === "suspended") ctx.resume();
  const osc  = ctx.createOscillator();
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

// ─── Horizontal Roulette strip (top bar) ─────────────────────────────────────
// Shows a wide row of letters; drag left/right to navigate.
// touch-action: none so iOS/Android don't intercept the horizontal swipe.

interface RouletteBarProps {
  queue: string[];
  queueIdx: number;
  onNavigate: (newIdx: number) => void;
}

function RouletteBar({ queue, queueIdx, onNavigate }: RouletteBarProps) {
  const dragX    = useMotionValue(0);
  const previewOffset = useTransform(dragX, (x) => -x / PX_PER_STEP);
  const [liveIdx, setLiveIdx] = useState(queueIdx);

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
    const steps  = Math.round(-dragX.get() / PX_PER_STEP);
    const newIdx = Math.max(0, Math.min(queue.length - 1, queueIdx + steps));
    animate(dragX, 0, { type: "spring", stiffness: 500, damping: 40 });
    if (newIdx !== queueIdx) onNavigate(newIdx);
  }, [dragX, queueIdx, queue.length, onNavigate]);

  // Show 7 slots centred on the live position
  const slots = [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const idx    = Math.round(liveIdx) + offset;
    const letter = idx >= 0 && idx < queue.length ? queue[idx] : "";
    return { letter, offset };
  });

  return (
    <motion.div
      className="roulette-bar-drag"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.25}
      style={{ x: dragX }}
      onDragEnd={handleDragEnd}
    >
      <div className="roulette-bar-inner">
        {slots.map(({ letter, offset }) => {
          const dist    = Math.abs(liveIdx - (Math.round(liveIdx) + offset));
          const opacity = Math.max(0.1, 1 - dist * 0.28);
          const scale   = Math.max(0.45, 1 - dist * 0.18);
          const isActive = offset === 0;
          return (
            <motion.div
              key={offset}
              className={`roulette-bar-item${isActive ? " active" : ""}`}
              animate={{ opacity, scale }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            >
              {letter}
            </motion.div>
          );
        })}
        {/* Selection window */}
        <div className="roulette-bar-window" />
      </div>

      {/* Progress strip */}
      <div className="roulette-progress">
        {queue.map((_, i) => (
          <span
            key={i}
            className="prog-dot"
            style={{ opacity: i === queueIdx ? 1 : 0.18,
                     transform: i === queueIdx ? "scaleX(2.2)" : "scaleX(1)" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Letter / countdown panel (bottom 3/4) ───────────────────────────────────
// Also draggable left/right for navigation on this panel.

interface LetterPanelProps {
  queue: string[];
  queueIdx: number;
  onNavigate: (newIdx: number) => void;
  phase: Phase;
  countdown: number;
  onSoundClick: () => void;
}

function LetterPanel({
  queue,
  queueIdx,
  onNavigate,
  phase,
  countdown,
  onSoundClick,
}: LetterPanelProps) {
  const dragX         = useMotionValue(0);
  const previewOffset = useTransform(dragX, (x) => -x / PX_PER_STEP);
  const [liveIdx, setLiveIdx] = useState(queueIdx);

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
    const steps  = Math.round(-dragX.get() / PX_PER_STEP);
    const newIdx = Math.max(0, Math.min(queue.length - 1, queueIdx + steps));
    animate(dragX, 0, { type: "spring", stiffness: 500, damping: 40 });
    if (newIdx !== queueIdx) onNavigate(newIdx);
  }, [dragX, queueIdx, queue.length, onNavigate]);

  const roundedIdx    = Math.round(liveIdx);
  const displayLetter = queue[roundedIdx] ?? "";

  return (
    <motion.div
      className="letter-drag-zone"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      style={{ x: dragX }}
      onDragEnd={handleDragEnd}
    >
      <AnimatePresence mode="wait">
        {phase === "listen" ? (
          <motion.div
            key={`listen-${displayLetter}`}
            className="listen-view"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -28 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Ghost neighbours hint which direction to drag */}
            <div className="ghost left">{queue[roundedIdx - 1] ?? ""}</div>

            <div className="letter-center">
              <motion.div
                className="big-letter"
                animate={{ scale: 1 + (Math.abs(dragX.get()) / PX_PER_STEP) * 0.03 }}
              >
                {displayLetter}
              </motion.div>

              <motion.button
                className="sound-btn"
                onClick={(e) => { e.stopPropagation(); onSoundClick(); }}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                aria-label="Play sound"
              >
                <Volume2 size={32} />
              </motion.button>
            </div>

            <div className="ghost right">{queue[roundedIdx + 1] ?? ""}</div>
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
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              >
                {countdown}
              </motion.div>
            </AnimatePresence>
            <p className="countdown-hint">repeat the letter!</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function AlphabetRoulette() {
  const audioMapRef      = useRef<AudioMap | null>(null);
  const repeatRef        = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  // Each play gets a unique ID. Callbacks check they still own the current ID
  // before proceeding — bulletproof against React batching and rapid navigation.
  const seqIdRef = useRef<number>(0);

  const [queue,    setQueue]    = useState<string[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [phase,    setPhase]    = useState<Phase>("listen");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const currentLetter = queue[queueIdx] ?? "";

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // --vh fix: window.innerHeight is the only reliable full-screen value on
    // mobile browsers — dvh/svh/vh all include the browser chrome at load time.
    const setVh = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`
      );
    };
    setVh();
    window.addEventListener("resize", setVh);

    audioMapRef.current = buildAudioMap();
    const repeat = new Audio("/alphabet/narrator/repeat_hint.wav");
    repeat.preload = "auto";
    repeatRef.current = repeat;
    setQueue(shuffle(LETTERS));

    return () => window.removeEventListener("resize", setVh);
  }, []);

  // ── Lazy AudioContext — only after user gesture ───────────────────────────
  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  // ── Stop all audio ────────────────────────────────────────────────────────
  // Incrementing seqId invalidates every in-flight onended callback instantly.
  const stopAll = useCallback(() => {
    seqIdRef.current += 1;          // any pending callback sees a stale ID → bails
    if (audioMapRef.current) {
      for (const l of LETTERS) {
        const a = audioMapRef.current[l];
        if (!a) continue;
        a.pause(); a.currentTime = 0; a.onended = null;
      }
    }
    if (repeatRef.current) {
      repeatRef.current.pause();
      repeatRef.current.currentTime = 0;
      repeatRef.current.onended = null;
    }
  }, []);

  // ── Play letter → letter → narrator → countdown ───────────────────────────
  const playLetterSequence = useCallback((letter: string) => {
    const map    = audioMapRef.current;
    const repeat = repeatRef.current;
    if (!map || !repeat) return;

    getAudioContext();

    // Claim a new sequence ID. Any callback that doesn't hold THIS id is stale.
    seqIdRef.current += 1;
    const myId = seqIdRef.current;
    const owned = () => seqIdRef.current === myId;

    const audio = map[letter];
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});

    audio.onended = () => {
      if (!owned()) return;
      setTimeout(() => {
        if (!owned()) return;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        audio.onended = () => {
          if (!owned()) return;
          repeat.currentTime = 0;
          repeat.play().catch(() => {});
          repeat.onended = () => {
            if (!owned()) return;
            setPhase("countdown");
            setCountdown(COUNTDOWN_SECONDS);
          };
        };
      }, DOUBLE_PLAY_GAP_MS);
    };
  }, [getAudioContext]);

  useEffect(() => {
    if (currentLetter && phase === "listen") playLetterSequence(currentLetter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLetter]);

  // ── Navigate from drag ────────────────────────────────────────────────────
  const handleNavigate = useCallback((newIdx: number) => {
    stopAll();          // increments seqId — kills any in-flight sequence NOW
    setPhase("listen"); // cancel any active countdown
    setCountdown(COUNTDOWN_SECONDS);
    setQueueIdx(newIdx);
  }, [stopAll]);

  // ── Countdown tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;

    // Snapshot the sequence ID at the moment this countdown step runs.
    // If the user navigates away (stopAll increments seqId), the timeout
    // cleanup fires but even if it doesn't, the stale-id check guards us.
    const myId = seqIdRef.current;
    const owned = () => seqIdRef.current === myId;

    if (countdown <= 0) {
      if (!owned()) return;
      setPhase("listen");
      setQueueIdx((i) => {
        const next = i + 1;
        if (next >= queue.length) { setQueue(shuffle(LETTERS)); return 0; }
        return next;
      });
      return;
    }
    const ctx = getAudioContext();
    if (ctx) playTick(ctx);
    const t = setTimeout(() => {
      if (owned()) setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, queue, getAudioContext]);

  const handleSoundClick = useCallback(() => {
    if (phase === "listen") playLetterSequence(currentLetter);
  }, [phase, currentLetter, playLetterSequence]);

  if (!queue.length) return null;

  return (
    <>
      <style>{css}</style>
      <div className="app-root">

        {/* ── Top: roulette bar (25% height) ── */}
        <div className="roulette-wrapper">
          <RouletteBar
            queue={queue}
            queueIdx={queueIdx}
            onNavigate={handleNavigate}
          />
        </div>

        {/* ── Bottom: letter / countdown (75% height) ── */}
        <div className="letter-wrapper">
          <LetterPanel
            queue={queue}
            queueIdx={queueIdx}
            onNavigate={handleNavigate}
            phase={phase}
            countdown={countdown}
            onSoundClick={handleSoundClick}
          />
        </div>

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
    --surface:   #191727;
    --card:      #231f36;
    --accent1:   #ff6b6b;
    --accent2:   #ffd93d;
    --accent3:   #6bcb77;
    --accent4:   #4d96ff;
    --text:      #fffffe;
    --subtext:   #a7a9be;
    --radius:    18px;
    --font-head: 'Fredoka One', cursive;
    --font-body: 'Nunito', sans-serif;
  }

  html {
    height: 100%;
    --vh: 1vh;
  }
  body {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }
  #__next {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .app-root {
    height: calc(var(--vh, 1vh) * 100);
    max-height: calc(var(--vh, 1vh) * 100);
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Roulette wrapper — top 25% ── */
  .roulette-wrapper {
    flex: 0 0 25%;
    min-height: 0;
    background: var(--surface);
    border-bottom: 2px solid #2e2b45;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  /* Drag zone fills the wrapper */
  .roulette-bar-drag {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* CRITICAL for mobile: none lets framer-motion receive the touch */
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .roulette-bar-drag:active { cursor: grabbing; }

  .roulette-bar-inner {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    position: relative;
    overflow: hidden;
    padding: 0 8px;
  }

  /* Each letter slot in the bar */
  .roulette-bar-item {
    font-family: var(--font-head);
    font-size: clamp(1.6rem, 5.5vw, 3.2rem);
    color: var(--subtext);
    line-height: 1;
    text-align: center;
    flex: 0 0 calc(100% / 7);  /* 7 visible slots */
    transition: color 0.15s;
    pointer-events: none;
  }
  .roulette-bar-item.active {
    color: var(--accent2);
    text-shadow: 0 0 28px rgba(255,217,61,0.5);
    font-size: clamp(2.2rem, 7.5vw, 4.4rem);
  }

  /* Frosted selection window centred on active slot */
  .roulette-bar-window {
    position: absolute;
    top: 8px; bottom: 8px;
    left: calc(50% - calc(100% / 14));   /* one slot wide, centred */
    width: calc(100% / 7);
    border: 2px solid rgba(255,217,61,0.35);
    border-radius: 12px;
    background: rgba(255,217,61,0.05);
    pointer-events: none;
  }

  /* Thin progress strip at the very bottom of the roulette bar */
  .roulette-progress {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 3px;
    padding: 4px 12px 6px;
    flex-shrink: 0;
  }
  .prog-dot {
    display: inline-block;
    width: 5px; height: 4px;
    border-radius: 2px;
    background: var(--accent2);
    transition: opacity 0.2s, transform 0.2s;
  }

  /* ── Letter wrapper — bottom 75% ── */
  .letter-wrapper {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* Drag zone */
  .letter-drag-zone {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    /* touch-action: none lets framer intercept horizontal swipes on mobile */
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .letter-drag-zone:active { cursor: grabbing; }

  /* Listen view */
  .listen-view {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    inset: 0;
  }

  /* Ghost letters on left/right edges */
  .ghost {
    font-family: var(--font-head);
    font-size: clamp(2.5rem, 8vw, 6rem);
    color: var(--subtext);
    opacity: 0.14;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    user-select: none;
  }
  .ghost.left  { left: clamp(10px, 3vw, 28px); }
  .ghost.right { right: clamp(10px, 3vw, 28px); }

  .letter-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(16px, 3vh, 32px);
    z-index: 1;
  }

  .big-letter {
    font-family: var(--font-head);
    font-size: clamp(7rem, 26vw, 22rem);
    line-height: 0.9;
    color: var(--text);
    text-shadow:
      0 0 100px rgba(255,107,107,0.25),
      0 6px 28px rgba(0,0,0,0.6);
    user-select: none;
    text-align: center;
  }

  .sound-btn {
    background: var(--accent4);
    border: none;
    color: #fff;
    border-radius: 50%;
    width: clamp(56px, 10vw, 72px);
    height: clamp(56px, 10vw, 72px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 24px rgba(77,150,255,0.45);
    transition: background 0.18s;
    flex-shrink: 0;
  }
  .sound-btn:hover { background: #3a7de8; }

  /* Countdown view */
  .countdown-view {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    position: absolute;
    inset: 0;
  }
  .countdown-number {
    font-family: var(--font-head);
    font-size: clamp(7rem, 26vw, 22rem);
    line-height: 0.9;
    color: var(--accent3);
    text-shadow: 0 0 80px rgba(107,203,119,0.4);
  }
  .countdown-hint {
    font-size: clamp(0.75rem, 2.5vw, 1.1rem);
    color: var(--subtext);
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
`;