import { Link } from 'react-router-dom';
import validation from '../../data/validation.json';
import solution from '../../data/solution-verification.json';
import physiology from '../../data/physiology-validation.json';

const PROGRAMS = [
  {
    index: 'A',
    title: 'Closed-loop chronotropic rescue',
    status: 'live' as const,
    desc:
      'A controller that manages symptomatic bradycardia: a muscarinic antagonist, three adrenergic infusions and a transcutaneous pacemaker, titrated to restore perfusion. The problem is genuinely hard because the fact that decides everything — where in the conduction system the lesion sits — is not directly observable, and because the drug takes seven to eight minutes to act while the guideline permits re-dosing every three.',
    meta: [
      ['Question of interest', 'Does the controller hold mean arterial pressure in target better than the guideline algorithm, without increasing drug or pacing exposure?'],
      ['Device framing', 'Physiologic closed-loop controller; detection-and-alarm functions sit under 21 CFR 870.1025, Class II'],
      ['State', 'Model calibrated and validated, policy trained, trial executed'],
    ],
  },
  {
    index: 'B',
    title: 'Rate-adaptive pacing and atrioventricular delay',
    status: 'spec' as const,
    desc:
      'The same circulation model, a different actuator. A pacing controller sets lower rate limit and programmed atrioventricular delay to maximise cardiac output while minimising ventricular pacing burden. The atrial contribution to ventricular filling is represented explicitly in the model, so delay optimisation acts through the correct physical mechanism rather than through a fitted response surface.',
    meta: [
      ['Question of interest', 'Does adaptive delay and rate selection improve cardiac output against a fixed programmed device?'],
      ['Device framing', 'Pacing algorithm change; premarket approval supplement territory'],
      ['State', 'Environment specified against the shared model; controller not yet trained'],
    ],
  },
  {
    index: 'C',
    title: 'Post-cardiac-surgery vasoactive weaning',
    status: 'spec' as const,
    desc:
      'Titration and withdrawal of vasoactive support after cardiac surgery, where the failure mode is not getting the pressure up but coming off support without losing it. Notably, no published work exists on reinforcement learning for vasopressor weaning at all; the literature addresses initiation only.',
    meta: [
      ['Question of interest', 'Can support be withdrawn faster without increasing hypotension exposure?'],
      ['Device framing', 'Software as a medical device; clinical decision support'],
      ['State', 'Environment specified against the shared model; controller not yet trained'],
    ],
  },
];

/** Small line chart used for the shared-model figures. */
function MiniChart({
  points, xLabel, yLabel, caption, markPeak = false,
}: {
  points: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  caption: string;
  markPeak?: boolean;
}) {
  const W = 330;
  const H = 210;
  const padL = 44;
  const padB = 34;
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xLo = Math.min(...xs);
  const xHi = Math.max(...xs);
  const yLo = Math.min(...ys) * 0.96;
  const yHi = Math.max(...ys) * 1.04;
  const X = (v: number): number => padL + ((v - xLo) / (xHi - xLo)) * (W - padL - 10);
  const Y = (v: number): number => H - padB - ((v - yLo) / (yHi - yLo)) * (H - padB - 12);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x)},${Y(p.y)}`).join(' ');
  const peak = points.reduce((a, b) => (b.y > a.y ? b : a));
  const yTicks = [yLo, (yLo + yHi) / 2, yHi];

  return (
    <figure className="ov-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-svg" role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={Y(t)} x2={W - 10} y2={Y(t)} stroke="rgba(10,10,18,0.08)" />
            <text x={padL - 7} y={Y(t) + 3.5} textAnchor="end" className="tr-axis">{t.toFixed(1)}</text>
          </g>
        ))}
        {[xLo, (xLo + xHi) / 2, xHi].map((t, i) => (
          <text key={i} x={X(t)} y={H - padB + 15} textAnchor="middle" className="tr-axis">
            {Math.round(t)}
          </text>
        ))}
        <path d={path} fill="none" stroke="#7a1818" strokeWidth={1.9} />
        {points.map((p, i) => (
          <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={2.2} fill="#7a1818" />
        ))}
        {markPeak && (
          <>
            <line x1={X(peak.x)} y1={Y(peak.y) - 8} x2={X(peak.x)} y2={H - padB}
              stroke="rgba(122,24,24,0.45)" strokeDasharray="3 3" />
            <text x={X(peak.x)} y={Y(peak.y) - 12} textAnchor="middle" className="tr-axis">
              {Math.round(peak.x)} ms
            </text>
          </>
        )}
        <text x={(W + padL) / 2} y={H - 4} textAnchor="middle" className="tr-axislabel">{xLabel}</text>
        <text x={11} y={(H - padB) / 2} textAnchor="middle" className="tr-axislabel"
          transform={`rotate(-90 11 ${(H - padB) / 2})`}>{yLabel}</text>
      </svg>
      <figcaption className="rl-caption">{caption}</figcaption>
    </figure>
  );
}

export function Overview() {
  const passed = validation.rows.filter((r) => r.pass).length;
  const total = validation.rows.length;
  const heldOut = validation.rows.filter((r) => !r.calibrated).length;
  const worstGci = solution.worstGciPercent;

  return (
    <>
      <section className="rl-hero">
        <div className="rl__inner">
          <span className="rl-hero__label">Regulatory Simulation</span>
          <h1 className="rl-hero__title">
            Learned controllers are easy to build and almost impossible to file
          </h1>
          <p className="rl-hero__lede">
            A closed-loop cardiac controller is a weekend of work. The evidence that would let
            anyone ship it is years of it. That asymmetry, not the algorithm, is what keeps
            reinforcement learning out of cardiac devices — and as of today not one of the
            1,524 artificial-intelligence-enabled devices the agency has authorised is publicly
            documented to use it.
          </p>
          <p className="rl-hero__lede">
            BUMP builds the missing half. A validated cardiovascular simulator, a controller
            trained inside it under a deterministic safety filter, and the credibility record,
            trial and change-control plan that make the result something a reviewer can act on.
            Below is the whole thing, executed end to end on the problem we know best.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">The gap</span>
          <h2 className="rl-section__title">The physics has a framework. The policy does not.</h2>
          <p className="rl-section__body">
            The agency&rsquo;s guidance on computational modelling credibility gives a complete,
            risk-informed process for establishing that a simulation can be trusted for a stated
            purpose — nine steps, eight categories of evidence, a model-risk assessment built from
            how much the model influences the decision and how bad it would be to get that decision
            wrong. It is a good framework. It also says, in its own scope section, that it applies
            to first-principles models and <strong>not</strong> to standalone machine-learning
            models, and that sponsors with those should come and ask.
          </p>
          <p className="rl-section__body">
            So a closed-loop product with a learned controller splits in two. The patient model
            falls squarely inside a finished framework. The policy falls outside it, into a
            regime governed by good machine-learning practice and change-control planning that was
            written with locked diagnostic algorithms in mind. Nothing joins them.
          </p>
          <p className="rl-section__body">
            The architectural answer is to stop asking the learned component to carry the safety
            argument. The policy proposes; a deterministic, enumerable filter disposes. Every
            constraint that filter enforces traces to a specific guideline recommendation, drug
            label limit or device specification, and can be verified independently of the network.
            The composite system&rsquo;s worst case is then bounded by the filter rather than by
            the policy — which converts an unbounded-risk argument into a bounded one, and is the
            difference between a submission a reviewer can assess and one they cannot.
          </p>

          <div className="rl-stats">
            <div className="rl-stat">
              <span className="rl-stat__value">{passed}/{total}</span>
              <span className="rl-stat__label">
                Reference haemodynamic quantities inside their accepted range, {heldOut} of them
                held out of the fit entirely
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat__value">{worstGci.toFixed(3)}%</span>
              <span className="rl-stat__label">
                Worst-case grid convergence index across every reported quantity
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat__value">10</span>
              <span className="rl-stat__label">
                Safety constraints, each traced to a published limit and verified separately from
                the policy
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat__value">0</span>
              <span className="rl-stat__label">
                Authorised devices publicly documented to use reinforcement learning, of 1,524
                artificial-intelligence-enabled devices
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Precedent</span>
          <h2 className="rl-section__title">This has been done once, for a different organ</h2>
          <p className="rl-section__body">
            In January 2008 a type 1 diabetes simulator was accepted as a substitute for animal
            trials in the preclinical testing of closed-loop control algorithms, and a device
            master file was deposited. Three months later an investigational device exemption was
            granted for a closed-loop trial on the strength of in-silico testing alone. Animal
            experiments for the purpose of designing insulin algorithms have essentially not been
            run since.
          </p>
          <p className="rl-section__body">
            The detail usually left out of that story is the one that matters most: the simulator
            was accepted for a <strong>single-meal scenario only</strong>. It was not a general
            licence for virtual patients. It was a narrow, explicitly bounded context of use, which
            is exactly what the modern credibility machinery was later built to formalise. Any
            claim made from a simulator has to be bounded the same way, and on these pages it is.
          </p>
          <p className="rl-section__body">
            The closed-loop control guidance goes further and says outright that evaluating such a
            device in every clinically relevant scenario using animal or clinical studies may not
            be feasible, and that a computational model of the patient response can provide an
            alternative to or supplement for those studies. It also observes that the model used
            to <em>design</em> a controller will generally differ from the one used to{' '}
            <em>evaluate</em> it, and asks that each be assessed for predictive capability in its
            own right. That shapes this platform: the controller is trained against a coarser model
            with clean sensors and the rare catastrophic hazards withheld, and evaluated against a
            finer one with degraded sensing and every hazard enabled.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Programmes</span>
          <h2 className="rl-section__title">One model, three actuators</h2>
          <p className="rl-section__body">
            The platform is a single validated closed-loop cardiovascular model with a conduction
            system, a baroreflex and compartmental pharmacology. Each programme is a different
            actuator and objective attached to that same model, which means the credibility
            evidence generated for one transfers to the others rather than being rebuilt.
          </p>

          <div className="rl-programs">
            {PROGRAMS.map((p) => (
              <article className="rl-program" key={p.index}>
                <div className="rl-program__index">PROGRAMME {p.index}</div>
                <div>
                  <h3 className="rl-program__title">{p.title}</h3>
                  <p className="rl-program__desc">{p.desc}</p>
                  <span
                    className={`rl-program__status rl-program__status--${p.status}`}
                  >
                    {p.status === 'live' ? 'Executed end to end' : 'Specified'}
                  </span>
                </div>
                <dl className="rl-program__meta">
                  {p.meta.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Who this is for</span>
          <h2 className="rl-section__title">Device makers who have the controller and not the file</h2>
          <p className="rl-section__body">
            The durable asset is the plant model, not the policy. A cardiovascular model that has
            been calibrated, verified, validated against held-out references and documented against
            the credibility framework is expensive to build once and nearly free to reuse: a
            pacing programme, a vasoactive programme and a drug-delivery programme are three
            actuators and three objectives attached to the same physics, and they inherit the same
            credibility evidence rather than rebuilding it.
          </p>
          <p className="rl-section__body">
            What a device maker gets is three things. A <strong>plant model</strong> for their
            device&rsquo;s physiology, with the credibility record that says what it may and may
            not be used to conclude. A <strong>controller</strong> trained inside it under a
            constraint set traced to their own labelling, the relevant guideline and their device
            limits, so that the safety argument rests on something enumerable. And the{' '}
            <strong>evidence</strong>: an in-silico trial against the standard of care with
            pre-specified endpoints and margins, a change control plan for the learned component,
            and the verification artefacts underneath both.
          </p>
          <p className="rl-section__body">
            What it does <strong>not</strong> do is replace a clinical investigation. What it can
            do is the thing computational evidence has actually been accepted for: bound the design
            space before anyone is enrolled, retire scenarios that cannot ethically be tested in
            people, and give a pre-submission something concrete to react to. On the diabetes
            precedent that was enough to displace animal work entirely and to carry an
            investigational application on its own. It was never enough to skip the trial.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Shared model, evidenced</span>
          <h2 className="rl-section__title">Programme B&rsquo;s objective is already computable</h2>
          <p className="rl-section__body">
            The two curves below are outputs of the same validated model, not of a separate one
            built for the purpose. On the left, cardiac output against paced rate in a healthy
            heart: output falls steeply below sixty because preload compensation is exhausted and
            the force-frequency relation is working against you. On the right, stroke volume
            against programmed atrioventricular delay at a fixed sixty per minute — a genuine
            optimum, produced by the timing of the atrial contribution to ventricular filling
            rather than by a fitted curve. That optimum is what a pacing controller would search
            for, and the fact that it already falls out of the shared model is the reason a second
            programme does not need a second simulator.
          </p>
          <div className="ov-figs">
            <MiniChart
              points={physiology.rateResponse.map((r) => ({ x: r.rate, y: r.co }))}
              xLabel="Paced rate (bpm)"
              yLabel="Cardiac output (L/min)"
              caption="Atrioventricular sequential pacing, healthy subject."
            />
            <MiniChart
              points={physiology.avSynchrony.map((r) => ({ x: r.avDelayMs, y: r.sv }))}
              xLabel="Programmed AV delay (ms)"
              yLabel="Stroke volume (mL)"
              caption="Paced at 60 per minute; the peak is the atrial kick landing correctly."
              markPeak
            />
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Where to look</span>
          <h2 className="rl-section__title">Everything here is executable</h2>
          <p className="rl-section__body">
            The <Link to="/RL-FDA-Approval/simulator">simulator</Link> runs the real engine in your
            browser — the same code that trained the controller and produced the trial, not a
            recording. The <Link to="/RL-FDA-Approval/trial">trial</Link> reports a paired
            within-subject comparison against the guideline algorithm on a cohort that was never
            seen during training. The <Link to="/RL-FDA-Approval/evidence">evidence</Link> section
            is the credibility record: verification, validation, the safety constraints, and the
            change-control plan. The <Link to="/RL-FDA-Approval/methods">methods</Link> section is
            the model itself, equation by equation.
          </p>
          <div className="rl-disclaimer">
            <strong>What this is not.</strong> This is engineering research, not a regulatory
            submission and not clinical evidence. No part of it has been reviewed by any regulatory
            authority. The controller has never touched a patient and is not intended to. The
            results below are statements about a computational model, and they are evidence about
            real physiology only to the degree that the credibility assessment supports — which is
            itself stated, with its limitations, rather than assumed.
          </div>
        </div>
      </section>
    </>
  );
}
