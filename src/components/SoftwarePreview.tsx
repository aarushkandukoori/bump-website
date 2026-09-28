import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { FS, PHASE_MARKERS, SCENARIO_DURATION_SEC, sampleAt, type Phase } from '../demo/sim';
import './SoftwarePreview.css';

/**
 * An auto-playing mockup of the monitoring app, driven by the same scenario
 * engine the /demo page runs (src/demo/sim.ts). Nothing here is invented: every
 * number on screen comes from sampleAt(), and the caption rail is rendered by
 * mapping over PHASE_MARKERS, so the prose cannot drift out of sync with the
 * engine's timings.
 *
 * Deliberately plain-language: no latency budgets, sample rates or threshold
 * jargon. A visitor should understand what the software does without knowing
 * what any of those mean.
 */

/** Six seconds of trace on screen at the engine's own sample rate. */
const WINDOW_SAMPLES = FS * 6;
/** Never push more than this many samples in one frame after a stall. */
const MAX_CATCHUP = 16;

const COPY: Record<Phase, { title: string; detail: string }> = {
  warmup: {
    title: 'The app starts up',
    detail: 'It connects to the monitor and begins reading the heartbeat.',
  },
  normal: {
    title: 'A normal heartbeat',
    detail: 'Around 72 beats a minute. Steady, so there is nothing to do.',
  },
  brady: {
    title: 'The heart rate starts to drop',
    detail: 'One slow moment is not an emergency, so the app keeps watching.',
  },
  alert: {
    title: 'It stays too low, and the alert fires',
    detail: 'This is the decision a wearable would act on.',
  },
  recover: {
    title: 'The heart rate recovers',
    detail: 'The alert clears on its own and the app goes back to watching.',
  },
};

const BEATS = PHASE_MARKERS.map((marker) => ({ ...marker, ...COPY[marker.id] }));

const STATUS: Record<Phase, string> = {
  warmup: 'Connecting',
  normal: 'Normal',
  brady: 'Falling',
  alert: 'Alert',
  recover: 'Recovering',
};

/** Map an ECG sample (roughly -0.35 … 1.35) into the trace viewBox. */
function traceY(ecg: number) {
  return 96 - ecg * 52;
}

export function SoftwarePreview() {
  const [phase, setPhase] = useState<Phase>('warmup');

  const traceRef = useRef<SVGPolylineElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const rateRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    const wave = new Float32Array(WINDOW_SAMPLES);
    const points: string[] = new Array(WINDOW_SAMPLES);
    const step = 600 / (WINDOW_SAMPLES - 1);
    let head = 0;

    /** Write the ring buffer out as a polyline, oldest sample on the left. */
    function paint() {
      for (let i = 0; i < WINDOW_SAMPLES; i += 1) {
        const v = wave[(head + i) % WINDOW_SAMPLES];
        points[i] = `${(i * step).toFixed(1)},${traceY(v).toFixed(1)}`;
      }
      traceRef.current?.setAttribute('points', points.join(' '));
      const last = wave[(head + WINDOW_SAMPLES - 1) % WINDOW_SAMPLES];
      headRef.current?.setAttribute('cy', traceY(last).toFixed(1));
    }

    function render(elapsed: number) {
      const sample = sampleAt(elapsed);

      if (rateRef.current) {
        rateRef.current.textContent = String(Math.round(sample.hr));
      }
      if (progressRef.current) {
        const frac = (elapsed % SCENARIO_DURATION_SEC) / SCENARIO_DURATION_SEC;
        progressRef.current.style.transform = `scaleX(${frac.toFixed(4)})`;
      }
      setPhase((prev) => (prev === sample.phase ? prev : sample.phase));
    }

    // Reduced motion: paint one representative frame (mid-alert) and stop.
    if (reduced.matches) {
      const still = 12;
      for (let i = 0; i < WINDOW_SAMPLES; i += 1) {
        wave[i] = sampleAt(still - (WINDOW_SAMPLES - 1 - i) / FS).ecg;
      }
      head = 0;
      paint();
      render(still);
      return;
    }

    let raf = 0;
    let lastTs: number | null = null;
    let elapsed = 0;
    let lastIdx = 0;

    // Seed the window with the tail of the previous loop. Starting from a
    // zero-filled buffer would draw six seconds of flat line — an ECG flatline
    // is the picture of asystole — next to a readout saying 72 bpm.
    for (let i = 0; i < WINDOW_SAMPLES; i += 1) {
      wave[i] = sampleAt(-(WINDOW_SAMPLES - 1 - i) / FS).ecg;
    }
    paint();

    function frame(ts: number) {
      if (lastTs === null) lastTs = ts;
      // A hidden tab stops rAF entirely, so the first frame back carries a huge
      // delta. Clamping it means the scenario resumes where it paused instead of
      // fast-forwarding through several loops.
      const dt = Math.min((ts - lastTs) / 1000, 1 / 30);
      lastTs = ts;
      elapsed += dt;

      // Advance the trace on a fixed sample clock rather than one point per
      // frame, so it scrolls at the same speed on 60 Hz and 120 Hz displays.
      const target = Math.floor(elapsed * FS);
      const pushes = Math.min(target - lastIdx, MAX_CATCHUP);
      for (let i = 0; i < pushes; i += 1) {
        lastIdx += 1;
        wave[head] = sampleAt(lastIdx / FS).ecg;
        head = (head + 1) % WINDOW_SAMPLES;
      }
      if (pushes > 0) lastIdx = target;

      paint();
      render(elapsed);
      raf = requestAnimationFrame(frame);
    }

    const onVisible = () => {
      lastTs = null;
    };
    document.addEventListener('visibilitychange', onVisible);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const alerting = phase === 'alert';

  return (
    <section className="software-preview" id="software">
      <div className="software-preview__inner">
        <motion.div
          className="software-preview__header"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
        >
          <span className="section__label">The software</span>
          <h2 className="software-preview__headline">What it looks like while it&apos;s running</h2>
          <p className="software-preview__lede">
            This is the monitoring app, playing a short episode on a loop: a steady
            heartbeat, a fall, the alert firing, and recovery. Nothing to click.
          </p>
        </motion.div>

        <div className="software-preview__stage">
          {/*
            Decorative: the caption rail beside it carries the same narrative as
            real text, so exposing a looping mockup to assistive tech would only
            announce a clinical alert that is not happening.
          */}
          <div
            className="software-window"
            data-phase={phase}
            data-alerting={alerting}
            aria-hidden="true"
          >
            <div className="software-window__bar">
              <span className="software-window__lights" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="software-window__title">BUMP Monitor</span>
            </div>

            <div className="software-window__body">
              {/*
                In flow rather than overlaid: an absolutely positioned banner
                covers the heart-rate readout when it fires. The row is reserved
                at its full height at all times and only its colour changes, so
                the window never grows — below 900px the caption rail stacks
                underneath, and a growing window would shove the whole page down
                twice every loop.
              */}
              <div className="software-window__alert">
                <p className="software-window__alert-text">
                  Heart rate has stayed too low — alert sent
                </p>
              </div>

              <div className="software-window__content">
              <div className="software-window__readout">
                <div className="software-window__rate">
                  <span className="software-window__rate-value" ref={rateRef}>
                    72
                  </span>
                  <span className="software-window__rate-unit">beats per minute</span>
                </div>
                <span className="software-window__status">{STATUS[phase]}</span>
              </div>

              <svg
                className="software-window__trace"
                viewBox="0 0 600 150"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline ref={traceRef} className="software-window__trace-line" points="" />
                <circle ref={headRef} className="software-window__trace-head" cx="600" cy="96" r="3.5" />
              </svg>
              </div>
            </div>

            <div className="software-window__progress" aria-hidden="true">
              <div className="software-window__progress-fill" ref={progressRef} />
            </div>
          </div>

          <ol className="software-preview__beats">
            {BEATS.map((beat) => (
              <li
                key={beat.id}
                className="software-preview__beat"
                data-active={beat.id === phase}
              >
                <span className="software-preview__beat-bar" aria-hidden="true" />
                <span className="software-preview__beat-text">
                  <span className="software-preview__beat-title">{beat.title}</span>
                  <span className="software-preview__beat-detail">{beat.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="software-preview__note">
          A mockup of the monitoring app replaying a simulated episode. The underlying
          detection software is an open engineering prototype, not a medical device.
        </p>
      </div>
    </section>
  );
}
