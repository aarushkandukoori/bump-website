import { useMemo } from 'react';
import raw from '../../data/trial-results.json';
import curveRaw from '../../data/training-curve.json';
import type { TrialResult, EndpointResult, SubgroupResult } from '../../trial/trial.ts';
import '../trial.css';

const result = raw as unknown as TrialResult;

function fmt(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}

/**
 * Plain-language reading of the primary result.
 *
 * Written to be correct whichever way the comparison falls. A trial that can
 * only be described when it wins is not a trial.
 */
function interpretPrimary(e: EndpointResult): string {
  const d = e.difference;
  const superior = d.low > 0;
  const inferior = d.high < 0;
  const width = `${fmt(d.low, 1)} to ${fmt(d.high, 1)} percentage points`;
  if (superior) {
    return (
      `The interval lies entirely above zero, so on this cohort and in this model the learned ` +
      `controller held pressure in target longer than the guideline algorithm, by ${width}. ` +
      `That is a statement about the model, and it is worth exactly what the credibility ` +
      `assessment supports — no more.`
    );
  }
  if (inferior) {
    return (
      `The interval lies entirely below zero: the learned controller held pressure in target ` +
      `for less of the episode than the guideline algorithm, by ${width}. The comparator here ` +
      `is a well-tuned deterministic algorithm applied to the population it was written for, ` +
      `and being beaten by it is a real result rather than a bug to be tuned away. The safety ` +
      `and control-performance endpoints below are where the difference between the two ` +
      `approaches actually shows up.`
    );
  }
  return (
    `The interval spans zero (${width}), so this cohort does not distinguish the two ` +
    `controllers on the primary endpoint. The comparator is a well-tuned deterministic ` +
    `algorithm applied to the population it was written for; matching it is the outcome a ` +
    `non-inferiority design would be built around, and the secondary and safety endpoints ` +
    `below are where the two approaches differ.`
  );
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p < 1e-4) return '<0.0001';
  return p.toFixed(4);
}

/** Paired scatter: each subject is one point, learned against guideline. */
function PairedScatter({ pairs, unit }: { pairs: TrialResult['primaryPairs']; unit: string }) {
  const W = 460;
  const H = 460;
  const pad = 46;
  if (pairs.length === 0) return null;
  const all = pairs.flatMap((p) => [p.policy, p.guideline]);
  const lo = Math.max(0, Math.min(...all) - 4);
  const hi = Math.min(100, Math.max(...all) + 4);
  const x = (v: number): number => pad + ((v - lo) / (hi - lo)) * (W - pad - 12);
  const y = (v: number): number => H - pad - ((v - lo) / (hi - lo)) * (H - pad - 12);
  const better = pairs.filter((p) => p.policy > p.guideline).length;

  const ticks: number[] = [];
  for (let v = Math.ceil(lo / 20) * 20; v <= hi; v += 20) ticks.push(v);

  return (
    <figure className="tr-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-svg" role="img"
        aria-label="Paired scatter of the primary endpoint, learned controller against guideline algorithm">
        <rect x={pad} y={12} width={W - pad - 12} height={H - pad - 12} fill="#fff" />
        {/* Region above the diagonal favours the learned controller. */}
        <polygon
          points={`${pad},${y(lo)} ${x(hi)},${y(hi)} ${pad},${12}`}
          fill="rgba(122,24,24,0.05)"
        />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={12} x2={x(t)} y2={H - pad} stroke="rgba(10,10,18,0.08)" />
            <line x1={pad} y1={y(t)} x2={W - 12} y2={y(t)} stroke="rgba(10,10,18,0.08)" />
            <text x={x(t)} y={H - pad + 16} textAnchor="middle" className="tr-axis">{t}</text>
            <text x={pad - 8} y={y(t) + 4} textAnchor="end" className="tr-axis">{t}</text>
          </g>
        ))}
        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="rgba(10,10,18,0.4)" strokeDasharray="4 3" />
        {pairs.map((p, i) => (
          <circle
            key={i}
            cx={x(p.guideline)}
            cy={y(p.policy)}
            r={3.4}
            fill={p.policy >= p.guideline ? 'rgba(122,24,24,0.55)' : 'rgba(74,85,104,0.5)'}
          >
            <title>{`${p.phenotype}: learned ${fmt(p.policy, 1)}, guideline ${fmt(p.guideline, 1)}`}</title>
          </circle>
        ))}
        <text x={(W + pad) / 2} y={H - 8} textAnchor="middle" className="tr-axislabel">
          Guideline algorithm ({unit})
        </text>
        <text x={14} y={(H - pad) / 2} textAnchor="middle" className="tr-axislabel"
          transform={`rotate(-90 14 ${(H - pad) / 2})`}>
          Learned controller ({unit})
        </text>
      </svg>
      <figcaption className="rl-caption">
        Each point is one virtual subject, run under both controllers from an identical initial
        state. Points above the dashed line favour the learned controller:{' '}
        <strong>{better} of {pairs.length}</strong> ({((better / pairs.length) * 100).toFixed(0)}%).
      </figcaption>
    </figure>
  );
}

/** Forest plot of subgroup differences on the primary endpoint. */
function Forest({ subgroups }: { subgroups: SubgroupResult[] }) {
  if (subgroups.length === 0) return null;
  const rowH = 26;
  const W = 640;
  const labelW = 260;
  const H = subgroups.length * rowH + 44;
  const lows = subgroups.map((s) => s.difference.low).filter(Number.isFinite);
  const highs = subgroups.map((s) => s.difference.high).filter(Number.isFinite);
  const lo = Math.min(-2, ...lows) - 2;
  const hi = Math.max(2, ...highs) + 2;
  const x = (v: number): number => labelW + ((v - lo) / (hi - lo)) * (W - labelW - 18);

  const ticks: number[] = [];
  const stepRaw = (hi - lo) / 5;
  const step = Math.max(5, Math.round(stepRaw / 5) * 5);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  return (
    <figure className="tr-fig tr-fig--wide">
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-svg" role="img"
        aria-label="Forest plot of subgroup differences on the primary endpoint">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={16} x2={x(t)} y2={H - 26} stroke="rgba(10,10,18,0.07)" />
            <text x={x(t)} y={H - 12} textAnchor="middle" className="tr-axis">{t}</text>
          </g>
        ))}
        <line x1={x(0)} y1={16} x2={x(0)} y2={H - 26} stroke="rgba(10,10,18,0.35)" />
        {subgroups.map((s, i) => {
          const cy = 28 + i * rowH;
          const favours = s.difference.low > 0;
          const harms = s.difference.high < 0;
          const colour = favours ? '#7a1818' : harms ? '#4a5568' : 'rgba(10,10,18,0.55)';
          return (
            <g key={s.key}>
              <text x={0} y={cy + 4} className="tr-forestlabel">{s.label}</text>
              <text x={labelW - 10} y={cy + 4} textAnchor="end" className="tr-forestn">n={s.n}</text>
              {Number.isFinite(s.difference.low) && (
                <line
                  x1={x(s.difference.low)} y1={cy} x2={x(s.difference.high)} y2={cy}
                  stroke={colour} strokeWidth={1.5}
                />
              )}
              <circle cx={x(s.difference.estimate)} cy={cy} r={4} fill={colour} />
              <title>{`${s.label}: ${fmt(s.difference.estimate, 1)} (${fmt(s.difference.low, 1)} to ${fmt(s.difference.high, 1)})`}</title>
            </g>
          );
        })}
        <text x={W / 2} y={H - 1} textAnchor="middle" className="tr-axislabel">
          Difference in time in target, percentage points (learned minus guideline)
        </text>
      </svg>
      <figcaption className="rl-caption">
        Bars are bias-corrected and accelerated bootstrap 95% intervals on the paired difference.
        Subgroups are pre-specified by conduction lesion and by demographic split; they are
        exploratory, and the intervals are not adjusted for the number of subgroups examined.
      </figcaption>
    </figure>
  );
}

function LearningCurve() {
  const data = curveRaw as { baseline?: { guidelineReturn: number }; curve: { episode: number; validReturn: number; validTimeInTarget: number }[] };
  const curve = data.curve ?? [];
  if (curve.length < 2) return null;
  const W = 640;
  const H = 250;
  const pad = 46;
  const base = data.baseline?.guidelineReturn;
  const values = curve.map((c) => c.validReturn).concat(base !== undefined ? [base] : []);
  const lo = Math.min(...values) - 4;
  const hi = Math.max(...values) + 4;
  const maxEp = curve[curve.length - 1].episode;
  const x = (e: number): number => pad + (e / maxEp) * (W - pad - 14);
  const y = (v: number): number => H - 32 - ((v - lo) / (hi - lo)) * (H - 46);
  const path = curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.episode)},${y(c.validReturn)}`).join(' ');

  return (
    <figure className="tr-fig tr-fig--wide">
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-svg" role="img" aria-label="Validation return during training">
        {base !== undefined && (
          <>
            <line x1={pad} y1={y(base)} x2={W - 14} y2={y(base)} stroke="#4a5568" strokeDasharray="5 4" />
            <text x={W - 16} y={y(base) - 6} textAnchor="end" className="tr-axis">guideline algorithm</text>
          </>
        )}
        <path d={path} fill="none" stroke="#7a1818" strokeWidth={1.8} />
        {curve.map((c) => (
          <circle key={c.episode} cx={x(c.episode)} cy={y(c.validReturn)} r={2.4} fill="#7a1818">
            <title>{`episode ${c.episode}: return ${fmt(c.validReturn, 1)}, in target ${(c.validTimeInTarget * 100).toFixed(1)}%`}</title>
          </circle>
        ))}
        <text x={(W + pad) / 2} y={H - 4} textAnchor="middle" className="tr-axislabel">
          Training episodes
        </text>
        <text x={12} y={H / 2} textAnchor="middle" className="tr-axislabel" transform={`rotate(-90 12 ${H / 2})`}>
          Return on validation cohort
        </text>
      </svg>
      <figcaption className="rl-caption">
        Model selection used the validation cohort only. The policy shipped is the checkpoint with
        the highest validation return, and the trial cohort below was not involved in that choice.
      </figcaption>
    </figure>
  );
}

const FAMILY_TITLES: Record<string, string> = {
  secondary: 'Secondary endpoints',
  safety: 'Safety endpoints',
  control: 'Closed-loop control performance',
};

function EndpointRows({ rows, family }: { rows: EndpointResult[]; family: string }) {
  const sel = rows.filter((r) => r.family === family);
  if (sel.length === 0) return null;
  return (
    <>
      <tr className="rl-row--head">
        <td colSpan={7}>{FAMILY_TITLES[family] ?? family}</td>
      </tr>
      {sel.map((e) => (
        <tr key={e.key}>
          <td>
            {e.label}
            <span className="tr-unit"> ({e.unit})</span>
          </td>
          <td className="rl-num">{fmt(e.policyMean)}</td>
          <td className="rl-num">{fmt(e.guidelineMean)}</td>
          <td className="rl-num">
            {fmt(e.difference.estimate)}
          </td>
          <td className="rl-num">
            {fmt(e.difference.low)} to {fmt(e.difference.high)}
          </td>
          <td className="rl-num">{fmtP(e.adjustedP)}</td>
          <td>
            {e.margin === undefined ? (
              <span className="rl-muted">—</span>
            ) : e.superior ? (
              <span className="rl-pass">superior</span>
            ) : e.nonInferior ? (
              <span className="rl-pass">non-inferior</span>
            ) : (
              <span className="rl-fail">not met</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

export function Trial() {
  const primary = result.endpoints[0];
  const hasData = result.enrolled > 0 && !!primary;
  const phenotypeRows = useMemo(
    () => Object.entries(result.baseline.phenotypeCounts).sort((a, b) => b[1] - a[1]),
    [],
  );

  return (
    <>
      <section className="rl-hero">
        <div className="rl__inner">
          <span className="rl-hero__label">In-silico trial</span>
          <h1 className="rl-hero__title">A crossover no real trial could run</h1>
          <p className="rl-hero__lede">
            Every enrolled subject receives both treatments, from an identical initial state, with
            an identical noise realisation. The only difference between the two runs is the policy.
            A patient cannot be resuscitated twice from the same starting point, which is precisely
            why this comparison has to be simulated — and why a few hundred virtual subjects carry
            the weight that thousands would in a parallel-group design.
          </p>
        </div>
      </section>

      {!hasData && (
        <section className="rl-section">
          <div className="rl__inner">
            <div className="rl-disclaimer">
              <strong>Trial not yet executed.</strong> This page renders the output of{' '}
              <code>tools/trial.ts</code>. Run it to populate the results.
            </div>
          </div>
        </section>
      )}

      {hasData && (
        <>
          <section className="rl-section">
            <div className="rl__inner">
              <span className="rl-section__label">Design</span>
              <h2 className="rl-section__title">Prospectively specified, paired, and independent of training</h2>
              <div className="tr-design">
                <dl>
                  <dt>Design</dt>
                  <dd>Paired within-subject crossover; both arms per subject</dd>
                  <dt>Comparator</dt>
                  <dd>Deterministic implementation of the 2020 adult bradycardia algorithm</dd>
                  <dt>Population</dt>
                  <dd>
                    Symptomatic bradycardia with haemodynamic compromise: rate under 55 with either
                    mean pressure under 65 or rate under 42, assessed untreated
                  </dd>
                  <dt>Primary endpoint</dt>
                  <dd>Proportion of the episode with mean arterial pressure between 65 and 110 mmHg</dd>
                  <dt>Analysis</dt>
                  <dd>
                    Paired differences with bias-corrected and accelerated bootstrap intervals;
                    Wilcoxon signed-rank tests; the secondary and safety family controlled at a 5%
                    false discovery rate
                  </dd>
                  <dt>Cohort seed</dt>
                  <dd>
                    <code>{result.cohortSeed}</code> — never used in training or model selection
                  </dd>
                  <dt>Policy under test</dt>
                  <dd><code>{result.policyVersion}</code></dd>
                  <dt>Execution</dt>
                  <dd>
                    {result.enrolled} subjects, both arms, in {fmt(result.runtimeSeconds, 0)} s
                  </dd>
                </dl>
              </div>

              <h3 className="tr-h3">Baseline characteristics</h3>
              <div className="rl-tablewrap">
                <table className="rl-table">
                  <thead>
                    <tr>
                      <th>Characteristic</th>
                      <th className="rl-num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Enrolled</td><td className="rl-num">{result.enrolled}</td></tr>
                    <tr>
                      <td>Screened</td>
                      <td className="rl-num">
                        {result.screened} ({((1 - result.screenFailureRate) * 100).toFixed(0)}% eligible)
                      </td>
                    </tr>
                    <tr>
                      <td>Mean arterial pressure at presentation, mmHg</td>
                      <td className="rl-num">{fmt(result.baseline.mapMean, 1)} ± {fmt(result.baseline.mapSd, 1)}</td>
                    </tr>
                    <tr>
                      <td>Heart rate at presentation, bpm</td>
                      <td className="rl-num">{fmt(result.baseline.hrMean, 1)} ± {fmt(result.baseline.hrSd, 1)}</td>
                    </tr>
                    <tr><td>Age, years</td><td className="rl-num">{fmt(result.baseline.ageMean, 0)}</td></tr>
                    <tr><td>Female</td><td className="rl-num">{(result.baseline.femaleFraction * 100).toFixed(0)}%</td></tr>
                    <tr>
                      <td>Documented ischaemia</td>
                      <td className="rl-num">{(result.baseline.ischaemicFraction * 100).toFixed(0)}%</td>
                    </tr>
                    <tr className="rl-row--head"><td colSpan={2}>Conduction lesion</td></tr>
                    {phenotypeRows.map(([label, count]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td className="rl-num">
                          {count} ({((count / result.enrolled) * 100).toFixed(0)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rl-section">
            <div className="rl__inner">
              <span className="rl-section__label">Primary endpoint</span>
              <h2 className="rl-section__title">{primary.label}</h2>
              <div className="tr-primary">
                <div className="tr-primary__cell">
                  <span className="tr-primary__label">Learned controller</span>
                  <span className="tr-primary__value">{fmt(primary.policyMean, 1)}<em>%</em></span>
                </div>
                <div className="tr-primary__cell">
                  <span className="tr-primary__label">Guideline algorithm</span>
                  <span className="tr-primary__value tr-primary__value--muted">
                    {fmt(primary.guidelineMean, 1)}<em>%</em>
                  </span>
                </div>
                <div className="tr-primary__cell tr-primary__cell--wide">
                  <span className="tr-primary__label">Paired difference (95% CI)</span>
                  <span className="tr-primary__value">
                    {primary.difference.estimate >= 0 ? '+' : ''}
                    {fmt(primary.difference.estimate, 1)}
                    <em>
                      {fmt(primary.difference.low, 1)} to {fmt(primary.difference.high, 1)} pp,
                      p = {fmtP(primary.wilcoxonP)}
                    </em>
                  </span>
                </div>
              </div>
              <p className="rl-section__body">{interpretPrimary(primary)}</p>
              <PairedScatter pairs={result.primaryPairs} unit={primary.unit} />
            </div>
          </section>

          <section className="rl-section">
            <div className="rl__inner">
              <span className="rl-section__label">All endpoints</span>
              <h2 className="rl-section__title">Secondary, safety and control performance</h2>
              <p className="rl-caption">
                Differences are learned minus guideline. Non-inferiority margins were fixed before
                the trial ran and are stated in the endpoint&rsquo;s own units; a margin is
                declared met only when the entire confidence interval lies on the acceptable side
                of it. Adjusted p-values control the false discovery rate across the secondary,
                safety and control family; the primary endpoint stands alone.
              </p>
              <div className="rl-tablewrap">
                <table className="rl-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th className="rl-num">Learned</th>
                      <th className="rl-num">Guideline</th>
                      <th className="rl-num">Difference</th>
                      <th className="rl-num">95% CI</th>
                      <th className="rl-num">p (adj.)</th>
                      <th>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <EndpointRows rows={result.endpoints} family="secondary" />
                    <EndpointRows rows={result.endpoints} family="safety" />
                    <EndpointRows rows={result.endpoints} family="control" />
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rl-section">
            <div className="rl__inner">
              <span className="rl-section__label">Subgroups</span>
              <h2 className="rl-section__title">Where the difference comes from</h2>
              <Forest subgroups={result.subgroups} />
            </div>
          </section>

          <section className="rl-section">
            <div className="rl__inner">
              <span className="rl-section__label">Safety</span>
              <h2 className="rl-section__title">Events and constraint activity</h2>
              <div className="rl-tablewrap">
                <table className="rl-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th className="rl-num">Learned</th>
                      <th className="rl-num">Guideline</th>
                      <th className="rl-num">Test</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Cardiac arrest</td>
                      <td className="rl-num">{result.safety.arrestPolicy}</td>
                      <td className="rl-num">{result.safety.arrestGuideline}</td>
                      <td className="rl-num">McNemar p = {fmtP(result.safety.arrestMcNemarP)}</td>
                    </tr>
                    <tr>
                      <td>Atropine-induced conduction collapse</td>
                      <td className="rl-num">{result.safety.collapsePolicy}</td>
                      <td className="rl-num">{result.safety.collapseGuideline}</td>
                      <td className="rl-num rl-muted">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="tr-h3">Safety shield activity</h3>
              <p className="rl-caption">
                How often the deterministic filter had to correct the learned policy, by rule. A
                policy that is frequently overridden has not learned its constraints, and that is
                something a reviewer should be told rather than left to discover. Overall
                intervention rate: <strong>{(result.safety.shieldInterventionRate * 100).toFixed(2)}%</strong>{' '}
                of proposed actions.
              </p>
              <div className="rl-tablewrap">
                <table className="rl-table">
                  <thead>
                    <tr><th>Constraint</th><th className="rl-num">Activations</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.safety.shieldRuleCounts).length === 0 && (
                      <tr><td className="rl-muted">No constraint was activated during the trial</td><td className="rl-num">0</td></tr>
                    )}
                    {Object.entries(result.safety.shieldRuleCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([rule, count]) => (
                        <tr key={rule}>
                          <td><code>{rule}</code></td>
                          <td className="rl-num">{count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rl-section">
            <div className="rl__inner">
              <span className="rl-section__label">Training</span>
              <h2 className="rl-section__title">Model selection</h2>
              <LearningCurve />
            </div>
          </section>
        </>
      )}

      <section className="rl-section">
        <div className="rl__inner rl__inner--narrow">
          <span className="rl-section__label">Limitations</span>
          <h2 className="rl-section__title">What this result does and does not support</h2>
          <p className="rl-section__body">
            This estimates the effect of the controller <strong>within this model</strong>. It is
            evidence about real patients only to the degree the credibility assessment supports,
            and that assessment states its own limits: the baroreflex acts on filtered mean
            pressure rather than pulse-synchronous afferent traffic, the interventricular septum is
            not represented, the atropine pharmacodynamic model rests on a three-subject kinetic
            study because no population model exists, and the response of atropine stratified by
            block level is constructed from mechanism because no study reports it.
          </p>
          <p className="rl-section__body">
            The paired design that gives this comparison its power also makes it structurally
            unlike a parallel-group clinical trial. Nothing here substitutes for one. What it can
            do is the thing computational evidence has actually been accepted for: bound the design
            space, retire scenarios that cannot be tested in people, and support an investigational
            application — which is what the diabetes precedent did, for one meal.
          </p>
        </div>
      </section>
    </>
  );
}
