import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { Logo } from '../components/Logo';
import {
  FS,
  LATENCY_BUDGET_MS,
  PHASE_MARKERS,
  SCENARIO_DURATION_SEC,
  phaseCopy,
  sampleAt,
  type Phase,
  type SimSample,
} from '../demo/sim';
import './DemoPage.css';

const WAVE_LEN = 200;
const HR_LEN = 100;

interface WavePt {
  i: number;
  v: number;
}
interface HrPt {
  i: number;
  hr: number;
  t: number;
}
interface LogEvent {
  id: number;
  time: string;
  text: string;
  kind: 'info' | 'warn' | 'alert';
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

export function DemoPage() {
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [sample, setSample] = useState<SimSample>(() => sampleAt(0));
  const [wave, setWave] = useState<WavePt[]>(() =>
    Array.from({ length: WAVE_LEN }, (_, i) => ({ i, v: 0 })),
  );
  const [hrSeries, setHrSeries] = useState<HrPt[]>(() =>
    Array.from({ length: HR_LEN }, (_, i) => ({ i, hr: 72, t: 0 })),
  );
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [log, setLog] = useState<LogEvent[]>([
    { id: 0, time: '0.0s', text: 'Session started · synthetic ECG stream', kind: 'info' },
  ]);
  const [beats, setBeats] = useState(0);

  const startRef = useRef(performance.now());
  const pausedAccumRef = useRef(0);
  const pauseBeganRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const idxRef = useRef(0);
  const forcedUntilRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<Phase>('warmup');
  const lastAlertRef = useRef(false);
  const logIdRef = useRef(1);
  const beatCarryRef = useRef(0);

  useEffect(() => {
    document.title = 'BUMP — Detection Demo';
    return () => {
      document.title = 'BUMP — Emergency Cardiac Response';
    };
  }, []);

  function pushLog(text: string, kind: LogEvent['kind'] = 'info') {
    const id = logIdRef.current++;
    const time = `${elapsedRef.current.toFixed(1)}s`;
    setLog((prev) => [{ id, time, text, kind }, ...prev].slice(0, 40));
  }

  function seekTo(sec: number) {
    const now = performance.now();
    elapsedRef.current = sec;
    startRef.current = now - (sec * 1000) / speed - pausedAccumRef.current;
    pauseBeganRef.current = running ? null : now;
    lastPhaseRef.current = sampleAt(sec, forcedUntilRef.current).phase;
    setAlertDismissed(false);
    pushLog(`Jumped to ${sec.toFixed(1)}s (${sampleAt(sec).phase})`, 'info');
  }

  function replay() {
    forcedUntilRef.current = null;
    pausedAccumRef.current = 0;
    pauseBeganRef.current = null;
    startRef.current = performance.now();
    elapsedRef.current = 0;
    idxRef.current = 0;
    beatCarryRef.current = 0;
    lastPhaseRef.current = 'warmup';
    lastAlertRef.current = false;
    setAlertVisible(false);
    setAlertDismissed(false);
    setBeats(0);
    setSample(sampleAt(0));
    setWave(Array.from({ length: WAVE_LEN }, (_, i) => ({ i, v: 0 })));
    setHrSeries(Array.from({ length: HR_LEN }, (_, i) => ({ i, hr: 72, t: 0 })));
    setLog([
      { id: logIdRef.current++, time: '0.0s', text: 'Scenario replayed from start', kind: 'info' },
    ]);
    setRunning(true);
  }

  function toggle() {
    if (running) {
      pauseBeganRef.current = performance.now();
      setRunning(false);
      pushLog('Stream paused', 'warn');
    } else {
      if (pauseBeganRef.current != null) {
        pausedAccumRef.current += performance.now() - pauseBeganRef.current;
      }
      pauseBeganRef.current = null;
      setRunning(true);
      pushLog('Stream resumed', 'info');
    }
  }

  function injectBrady() {
    const until = elapsedRef.current + 6;
    forcedUntilRef.current = until;
    setAlertDismissed(false);
    pushLog('Injected crashing bradycardia (~40 bpm, 6s)', 'alert');
  }

  function clearInject() {
    forcedUntilRef.current = null;
    pushLog('Cleared forced bradycardia', 'info');
  }

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const elapsed =
        ((now - startRef.current - pausedAccumRef.current) / 1000) * speed;
      elapsedRef.current = elapsed;
      const s = sampleAt(elapsed, forcedUntilRef.current);
      setSample(s);

      if (s.phase !== lastPhaseRef.current) {
        pushLog(phaseCopy(s.phase), s.phase === 'alert' ? 'alert' : 'info');
        lastPhaseRef.current = s.phase;
      }
      if (s.alert && !lastAlertRef.current) {
        lastAlertRef.current = true;
        setAlertVisible(true);
        setAlertDismissed(false);
        pushLog(
          `ALERT · sustained bradycardia · ${s.latencyMs.toFixed(0)} ms latency`,
          'alert',
        );
      }
      if (!s.alert) lastAlertRef.current = false;

      // Approximate beat counter from HR
      beatCarryRef.current += (s.hr / 60) * (1 / 60) * speed;
      if (beatCarryRef.current >= 1) {
        const n = Math.floor(beatCarryRef.current);
        beatCarryRef.current -= n;
        setBeats((b) => b + n);
      }

      idxRef.current += 1;
      const i = idxRef.current;
      setWave((prev) => {
        const next = prev.slice(1);
        next.push({ i, v: s.ecg });
        return next;
      });
      if (i % 3 === 0) {
        setHrSeries((prev) => {
          const next = prev.slice(1);
          next.push({ i, hr: s.hr, t: s.t });
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional sim loop
  }, [running, speed]);

  const progress = (sample.t / SCENARIO_DURATION_SEC) * 100;
  const showAlert = alertVisible && !alertDismissed && (sample.alert || sample.bradycardia);
  const waveData = useMemo(() => wave, [wave]);
  const hrData = useMemo(() => hrSeries, [hrSeries]);

  return (
    <div className="demo-page">
      <header className="demo-top">
        <div className="demo-top__left">
          <Link to="/" className="demo-top__logo" aria-label="BUMP home">
            <Logo height={44} showText={false} />
          </Link>
          <div>
            <p className="demo-top__title">Detection demo</p>
            <p className="demo-top__sub">Interactive · client-side simulation</p>
          </div>
        </div>
        <Link to="/" className="demo-top__back">
          ← Back to bump-labs.com
        </Link>
      </header>

      {showAlert && (
        <div className="demo-alert" role="alert">
          <span className="demo-alert__dot" aria-hidden />
          <div className="demo-alert__body">
            <strong>Bradycardia detected</strong>
            <p>
              Sustained HR ~{Math.round(sample.hr)} bpm — this is the software
              decision that would trigger atropine delivery and multi-channel
              alerts on device.
            </p>
          </div>
          <span className="demo-alert__lat">{sample.latencyMs.toFixed(0)} ms</span>
          <button
            type="button"
            className="demo-alert__dismiss"
            onClick={() => setAlertDismissed(true)}
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      )}

      <main className="demo-main">
        <section className="demo-intro">
          <h1>Watch the detection layer decide</h1>
          <p>
            Drive a synthetic ECG through the same decision path as the open
            BUMP pipeline: R-peaks → heart rate → sustained bradycardia rule →
            alert under a <strong>{LATENCY_BUDGET_MS} ms</strong> budget. Scrub,
            speed up, or inject a crash yourself.
          </p>
        </section>

        <section className="demo-controls">
          <div className="demo-controls__row">
            <button type="button" className="demo-btn demo-btn--primary" onClick={replay}>
              Replay
            </button>
            <button type="button" className="demo-btn" onClick={toggle}>
              {running ? 'Pause' : 'Resume'}
            </button>
            <button type="button" className="demo-btn demo-btn--danger" onClick={injectBrady}>
              Inject bradycardia
            </button>
            <button type="button" className="demo-btn" onClick={clearInject}>
              Clear inject
            </button>
          </div>

          <div className="demo-controls__row demo-controls__row--meta">
            <div className="demo-speeds" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`demo-chip ${speed === s ? 'is-active' : ''}`}
                  onClick={() => {
                    // Keep wall-clock continuity when changing speed
                    const now = performance.now();
                    const elapsed = elapsedRef.current;
                    startRef.current = now - (elapsed * 1000) / s - pausedAccumRef.current;
                    setSpeed(s);
                    pushLog(`Speed → ${s}×`, 'info');
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="demo-phases" role="group" aria-label="Jump to phase">
              {PHASE_MARKERS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`demo-chip ${sample.phase === m.id ? 'is-active' : ''}`}
                  onClick={() => seekTo(m.at + 0.05)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <label className="demo-scrub">
            <span className="demo-scrub__label">
              Timeline · {sample.t.toFixed(1)}s / {SCENARIO_DURATION_SEC}s
            </span>
            <input
              type="range"
              min={0}
              max={SCENARIO_DURATION_SEC}
              step={0.1}
              value={sample.t}
              onChange={(e) => seekTo(Number(e.target.value))}
            />
            <div className="demo-scrub__track" aria-hidden>
              <div className="demo-scrub__fill" style={{ width: `${progress}%` }} />
              {PHASE_MARKERS.map((m) => (
                <span
                  key={m.id}
                  className="demo-scrub__mark"
                  style={{ left: `${(m.at / SCENARIO_DURATION_SEC) * 100}%` }}
                  title={m.label}
                />
              ))}
            </div>
          </label>

          <p className="demo-phase-copy">{phaseCopy(sample.phase)}</p>
        </section>

        <div className="demo-stats">
          <Stat
            label="Heart rate"
            value={Math.round(sample.hr).toString()}
            unit="bpm"
            tone={sample.bradycardia ? 'bad' : 'good'}
          />
          <Stat
            label="Classification"
            value={sample.classLabel}
            tone={sample.bradycardia ? 'bad' : ''}
          />
          <Stat
            label="Latency"
            value={sample.latencyMs.toFixed(0)}
            unit={`/ ${LATENCY_BUDGET_MS}ms`}
            tone={sample.latencyMs <= LATENCY_BUDGET_MS ? 'good' : 'bad'}
          />
          <Stat label="Beats seen" value={beats.toString()} />
          <Stat
            label="Stream"
            value={running ? 'live' : 'paused'}
            tone={running ? 'good' : 'warn'}
          />
        </div>

        <div className="demo-grid">
          <section className="demo-panel">
            <div className="demo-panel__head">
              <h2>Live ECG</h2>
              <span className="demo-mono">{FS} Hz display · synthetic</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={waveData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <YAxis domain={[-0.6, 1.5]} width={36} stroke="#8a8a9a" tick={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={sample.bradycardia ? '#a61f32' : '#1f7a52'}
                  dot={false}
                  strokeWidth={1.7}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="demo-panel">
            <div className="demo-panel__head">
              <h2>Heart-rate trend</h2>
              <span className="demo-mono">60 bpm threshold</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hrData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <YAxis domain={[30, 100]} width={36} stroke="#8a8a9a" tick={{ fontSize: 11 }} />
                <ReferenceLine y={60} stroke="#7a1818" strokeDasharray="4 4" />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(0)} bpm`, 'HR']}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid rgba(10,10,18,0.1)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="hr"
                  stroke="#7a1818"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="demo-panel demo-panel--log">
            <div className="demo-panel__head">
              <h2>Event log</h2>
              <button
                type="button"
                className="demo-chip"
                onClick={() => setLog([])}
              >
                Clear
              </button>
            </div>
            <ul className="demo-log">
              {log.length === 0 && <li className="demo-log__empty">No events yet</li>}
              {log.map((e) => (
                <li key={e.id} className={`demo-log__item demo-log__item--${e.kind}`}>
                  <span className="demo-log__time">{e.time}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="demo-footnote">
          <strong>Not a medical device.</strong> Browser simulation only — not
          clinical data. Full pipeline (Redis, ONNX, TimescaleDB):{' '}
          <a
            href="https://github.com/aarushkandukoori/bump-detection"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/aarushkandukoori/bump-detection
          </a>
        </p>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className={`demo-stat ${tone ?? ''}`}>
      <div className="demo-stat__label">{label}</div>
      <div className="demo-stat__value">
        {value}
        {unit ? <span className="demo-stat__unit"> {unit}</span> : null}
      </div>
    </div>
  );
}
