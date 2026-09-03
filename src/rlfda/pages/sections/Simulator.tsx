import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PHENOTYPES, sampleSubject, type PhenotypeId, type VirtualSubject } from '../../engine/patient.ts';
import { EcgSynth } from '../../engine/ecg.ts';
import { ChronotropicEnv, screenSubject, ACTIONS } from '../../envs/chronotropic.ts';
import { guidelineAction, newGuidelineState, updateGuidelineState, type GuidelineState } from '../../envs/guideline.ts';
import { Policy, type PolicyBundle } from '../../rl/policy.ts';
import bundle from '../../data/policy-chronotropic.json';
import '../simulator.css';

const ECG_HZ = 200;
const ECG_SECONDS = 6;
const ECG_SAMPLES = ECG_HZ * ECG_SECONDS;
const TRACE_SECONDS = 2700;

interface LogEntry {
  id: number;
  minute: string;
  text: string;
  kind: 'action' | 'shield' | 'event';
}

/**
 * One arm of the comparison. Owns an environment, drives it a few
 * milliseconds at a time, and keeps the ring buffers the display reads.
 *
 * The therapy logic is not reimplemented here: the arm calls the same
 * environment, the same safety shield and the same policy code that produced
 * the trial results.
 */
class Arm {
  env: ChronotropicEnv;
  ecg = new EcgSynth();
  ecgBuf = new Float32Array(ECG_SAMPLES);
  ecgIdx = 0;
  mapTrace: { t: number; map: number; hr: number }[] = [];
  log: LogEntry[] = [];
  logId = 0;
  done = false;
  totalReward = 0;
  private nextEcgSample = 0;
  private nextTraceSample = 0;
  private gstate: GuidelineState = newGuidelineState();

  readonly label: string;
  readonly decide: (arm: Arm) => number;

  constructor(label: string, subject: VirtualSubject, decide: (arm: Arm) => number) {
    this.label = label;
    this.decide = decide;
    this.env = new ChronotropicEnv(subject, { mode: 'evaluation', useShield: true });
  }

  start(): void {
    this.env.reset();
    this.env.model.onActivation = (e) => this.ecg.push(e);
    this.nextEcgSample = this.env.model.t;
    this.nextTraceSample = this.env.model.t;
    this.ecgBuf.fill(0);
    this.ecgIdx = 0;
    this.mapTrace = [];
    this.log = [];
    this.done = false;
    this.totalReward = 0;
    this.gstate = newGuidelineState();
    this.beginNext();
  }

  private beginNext(): void {
    const proposed = this.decide(this);
    const d = this.env.beginInterval(proposed);
    const minute = (this.env.elapsed / 60).toFixed(1);
    if (d.rule) {
      this.push(
        `Shield ${d.rule}: proposed "${ACTIONS[proposed]}", executed "${ACTIONS[d.action]}"`,
        'shield',
        minute,
      );
    } else if (d.action !== 0) {
      this.push(ACTIONS[d.action], 'action', minute);
    }
  }

  private push(text: string, kind: LogEntry['kind'], minute: string): void {
    this.log.unshift({ id: this.logId++, minute, text, kind });
    if (this.log.length > 60) this.log.pop();
  }

  /** Advance by `seconds` of simulated time, sampling traces as it goes. */
  advance(seconds: number): void {
    if (this.done) return;
    let remaining = seconds;
    // Step in small slices so the traces are sampled evenly.
    while (remaining > 1e-6 && !this.done) {
      const slice = Math.min(remaining, 0.02);
      const complete = this.env.advanceInterval(slice);
      remaining -= slice;
      const t = this.env.model.t;
      this.ecg.prune(t);
      while (this.nextEcgSample <= t) {
        this.ecgBuf[this.ecgIdx] = this.ecg.sample(this.nextEcgSample);
        this.ecgIdx = (this.ecgIdx + 1) % ECG_SAMPLES;
        this.nextEcgSample += 1 / ECG_HZ;
      }
      while (this.nextTraceSample <= t) {
        this.mapTrace.push({
          t: this.env.elapsed,
          map: this.env.model.map,
          hr: this.env.model.heartRate,
        });
        this.nextTraceSample += 2;
      }
      if (complete) {
        const res = this.env.endInterval();
        this.totalReward += res.reward;
        if (this.env.model.atropineCollapse && !this.log.some((l) => l.kind === 'event')) {
          this.push(
            'Conduction collapse after atropine in a denervated heart',
            'event',
            (this.env.elapsed / 60).toFixed(1),
          );
        }
        if (res.done) {
          this.done = true;
          this.push(
            this.env.model.arrested ? 'Cardiac arrest' : 'Episode complete',
            'event',
            (this.env.elapsed / 60).toFixed(1),
          );
        } else {
          this.beginNext();
        }
      }
    }
  }

  guidelineDecision(subject: VirtualSubject): number {
    const a = guidelineAction(this.env.lastObservation, this.gstate, {
      weightKg: subject.weightKg,
      ischaemic: subject.ischaemic,
    });
    updateGuidelineState(this.gstate, a, this.env.lastObservation.elapsedSeconds);
    return a;
  }
}

function EcgCanvas({ arm, tick }: { arm: Arm; tick: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Calibration grid at 0.2 s and 0.5 mV.
    ctx.strokeStyle = 'rgba(122, 24, 24, 0.10)';
    ctx.lineWidth = 1;
    const pxPerSec = w / ECG_SECONDS;
    ctx.beginPath();
    for (let s = 0; s <= ECG_SECONDS; s += 0.2) {
      const x = Math.round(s * pxPerSec) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let v = -1.5; v <= 1.5; v += 0.5) {
      const y = Math.round(h / 2 - v * (h / 3.4)) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#7a1818';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < ECG_SAMPLES; i++) {
      const idx = (arm.ecgIdx + i) % ECG_SAMPLES;
      const x = (i / ECG_SAMPLES) * w;
      const y = h / 2 - arm.ecgBuf[idx] * (h / 3.4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [arm, tick]);
  return <canvas ref={ref} className="sim-ecg" aria-label={`Electrocardiogram, ${arm.label}`} />;
}

function TraceChart({ arms, tick }: { arms: Arm[]; tick: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const padL = 40;
    const padB = 22;
    const lo = 30;
    const hi = 120;
    const x = (t: number): number => padL + (t / TRACE_SECONDS) * (w - padL - 8);
    const y = (v: number): number => (h - padB) - ((v - lo) / (hi - lo)) * (h - padB - 8);

    // Target band.
    ctx.fillStyle = 'rgba(28, 107, 58, 0.08)';
    ctx.fillRect(padL, y(110), w - padL - 8, y(65) - y(110));

    ctx.strokeStyle = 'rgba(10,10,18,0.12)';
    ctx.lineWidth = 1;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(10,10,18,0.45)';
    ctx.textAlign = 'right';
    for (const v of [40, 65, 80, 100, 120]) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(w - 8, yy);
      ctx.stroke();
      ctx.fillText(String(v), padL - 6, yy + 3);
    }
    ctx.textAlign = 'center';
    for (let m = 0; m <= 45; m += 15) {
      const xx = x(m * 60);
      ctx.fillText(`${m}m`, xx, h - 6);
    }

    const colours = ['#7a1818', '#4a5568'];
    arms.forEach((arm, i) => {
      ctx.strokeStyle = colours[i];
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      arm.mapTrace.forEach((p, j) => {
        const px = x(p.t);
        const py = y(Math.min(hi, Math.max(lo, p.map)));
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
  }, [arms, tick]);
  return <canvas ref={ref} className="sim-trace" aria-label="Mean arterial pressure over the episode" />;
}

function Vitals({ arm }: { arm: Arm }) {
  const m = arm.env.model;
  const o = arm.env.lastObservation;
  const inTarget = m.map >= 65 && m.map <= 110;
  return (
    <div className="sim-vitals">
      <div className="sim-vital">
        <span className="sim-vital__label">Heart rate</span>
        <span className="sim-vital__value">{m.heartRate.toFixed(0)}<em>bpm</em></span>
      </div>
      <div className={`sim-vital ${inTarget ? '' : 'sim-vital--alarm'}`}>
        <span className="sim-vital__label">Mean pressure</span>
        <span className="sim-vital__value">{m.map.toFixed(0)}<em>mmHg</em></span>
      </div>
      <div className="sim-vital">
        <span className="sim-vital__label">Cardiac output</span>
        <span className="sim-vital__value">{m.cardiacOutput.toFixed(1)}<em>L/min</em></span>
      </div>
      <div className="sim-vital">
        <span className="sim-vital__label">Rhythm</span>
        <span className="sim-vital__value sim-vital__value--text">
          {m.conduction.lastSource.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="sim-vital">
        <span className="sim-vital__label">Atropine</span>
        <span className="sim-vital__value">{o?.atropineTotalMg.toFixed(1) ?? '0.0'}<em>mg</em></span>
      </div>
      <div className="sim-vital">
        <span className="sim-vital__label">Pacing</span>
        <span className="sim-vital__value sim-vital__value--text">
          {arm.env.pacing.mode === 'off'
            ? 'off'
            : `${arm.env.pacing.rate}/min at ${arm.env.pacing.outputMa} mA`}
        </span>
      </div>
    </div>
  );
}

export function Simulator() {
  const policy = useMemo(() => new Policy(bundle as unknown as PolicyBundle), []);
  const [phenotype, setPhenotype] = useState<PhenotypeId | 'random'>('av_block_infranodal');
  const [seed, setSeed] = useState(70021);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [tick, setTick] = useState(0);
  const [subject, setSubject] = useState<VirtualSubject | null>(null);
  const [baseline, setBaseline] = useState<{ map: number; hr: number } | null>(null);
  const armsRef = useRef<Arm[] | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const build = useCallback(() => {
    /*
     * Draw a subject that meets the trial's enrolment criterion, so the
     * simulator shows the population the controller is indicated for rather
     * than an arbitrary draw. Screening simulates each candidate untreated,
     * which is the same procedure the trial uses.
     */
    let subj = sampleSubject(0, seed, phenotype === 'random' ? undefined : phenotype);
    for (let attempt = 1; attempt < 24; attempt++) {
      const base = screenSubject(subj);
      if (base.hr < 55 && (base.map < 65 || base.hr < 42)) break;
      subj = sampleSubject(0, seed + attempt * 7919, phenotype === 'random' ? undefined : phenotype);
    }
    const learned = new Arm('Learned controller', subj, (a) => policy.act(a.env.currentFeatures()));
    const guide = new Arm('Guideline algorithm', subj, (a) => a.guidelineDecision(subj));
    learned.start();
    guide.start();
    armsRef.current = [learned, guide];
    setSubject(subj);
    setBaseline(screenSubject(subj));
    setTick((t) => t + 1);
  }, [seed, phenotype, policy]);

  useEffect(() => {
    build();
    return () => cancelAnimationFrame(rafRef.current);
  }, [build]);

  useEffect(() => {
    if (!running) return;
    lastRef.current = performance.now();
    const loop = (now: number): void => {
      const dtWall = Math.min((now - lastRef.current) / 1000, 0.1);
      lastRef.current = now;
      const arms = armsRef.current;
      if (arms) {
        for (const a of arms) a.advance(dtWall * speed);
        if (arms.every((a) => a.done)) setRunning(false);
      }
      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, speed]);

  const arms = armsRef.current;
  const ph = subject ? PHENOTYPES.find((p) => p.id === subject.phenotype) : null;

  return (
    <>
      <section className="rl-hero">
        <div className="rl__inner">
          <span className="rl-hero__label">Live simulator</span>
          <h1 className="rl-hero__title">Two controllers, one patient, in your browser</h1>
          <p className="rl-hero__lede">
            This is the engine, not a recording. The cardiovascular model, the conduction system,
            the pharmacokinetics, the sensor noise, the safety shield and the trained network all
            run locally, and the same virtual subject is presented to both controllers from an
            identical initial state. Pick a lesion and watch where the two diverge.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <div className="sim-controls">
            <label className="sim-control">
              <span>Conduction lesion</span>
              <select
                value={phenotype}
                onChange={(e) => setPhenotype(e.target.value as PhenotypeId | 'random')}
              >
                <option value="random">Sample from the population</option>
                {PHENOTYPES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="sim-control">
              <span>Speed</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {[1, 5, 10, 20, 60].map((s) => (
                  <option key={s} value={s}>{s}&times; real time</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="sim-btn sim-btn--primary"
              onClick={() => setRunning((r) => !r)}
              disabled={!!arms && arms.every((a) => a.done)}
            >
              {running ? 'Pause' : 'Run'}
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => {
                setRunning(false);
                setSeed((s) => s + 104729);
              }}
            >
              New patient
            </button>
            <button
              type="button"
              className="sim-btn"
              onClick={() => {
                setRunning(false);
                build();
              }}
            >
              Restart episode
            </button>
          </div>

          {ph && baseline && (
            <p className="sim-subject">
              <strong>{ph.label}.</strong> {ph.description} Presenting untreated at{' '}
              <strong>{baseline.hr.toFixed(0)} bpm</strong> and{' '}
              <strong>{baseline.map.toFixed(0)} mmHg</strong> mean pressure.
              {subject && (
                <>
                  {' '}Subject is {subject.ageYears}, {subject.sex === 'F' ? 'female' : 'male'},{' '}
                  {subject.weightKg.toFixed(0)} kg
                  {subject.ischaemic ? ', with documented ischaemia' : ''}. Guideline expectation
                  for a muscarinic antagonist here: <strong>{ph.atropineExpectation}</strong>.
                </>
              )}
            </p>
          )}

          <div className="sim-grid">
            {arms?.map((arm, i) => (
              <div className="sim-arm" key={arm.label}>
                <div className="sim-arm__head">
                  <h3>{arm.label}</h3>
                  <span className="sim-arm__clock">
                    {(arm.env.elapsed / 60).toFixed(1)} min{arm.done ? ' · complete' : ''}
                  </span>
                </div>
                <EcgCanvas arm={arm} tick={tick} />
                <Vitals arm={arm} />
                <ol className="sim-log">
                  {arm.log.slice(0, 9).map((l) => (
                    <li key={l.id} className={`sim-log__item sim-log__item--${l.kind}`}>
                      <span className="sim-log__time">{l.minute}m</span>
                      <span>{l.text}</span>
                    </li>
                  ))}
                  {arm.log.length === 0 && (
                    <li className="sim-log__item sim-log__item--empty">
                      No therapy delivered yet
                    </li>
                  )}
                </ol>
                {i === 0 && <span className="sim-arm__key">policy version {policy.bundle.version}</span>}
              </div>
            ))}
          </div>

          <h3 className="sim-tracetitle">Mean arterial pressure over the episode</h3>
          <p className="rl-caption">
            Shaded band is the 65 to 110 mmHg target. Dark red is the learned controller, grey the
            guideline algorithm. Both arms see the same patient and the same noise.
          </p>
          {arms && <TraceChart arms={arms} tick={tick} />}
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner rl__inner--narrow">
          <span className="rl-section__label">What to watch for</span>
          <h2 className="rl-section__title">The interesting cases are the ones where atropine is wrong</h2>
          <p className="rl-section__body">
            In <strong>vagally mediated sinus bradycardia</strong> both controllers do well, because
            the guideline&rsquo;s first move is the right one. The difference appears where the
            guideline&rsquo;s first move is wrong or useless.
          </p>
          <p className="rl-section__body">
            In <strong>infranodal second-degree block</strong>, accelerating the sinus node makes
            the diseased conduction tissue below it drop more beats, and the ventricular rate can
            fall. Nothing in this model hard-codes that; it emerges from a vagally innervated node
            sitting above un-innervated tissue whose conduction fails at higher input rates. The
            shield refuses atropine here on the documented-lesion rule, and the log records the
            refusal.
          </p>
          <p className="rl-section__body">
            In a <strong>denervated heart</strong> there is no vagal tone to block, so the drug does
            nothing at all — and in one in five such patients it has been reported to precipitate
            complete block or sinus arrest, in most of those with no escape rhythm appearing
            before pacing was started. That hazard is present in the
            evaluation model, it is dose-independent and unpredictable by design, and the only
            defence is the constraint that refuses the drug outright.
          </p>
        </div>
      </section>
    </>
  );
}
