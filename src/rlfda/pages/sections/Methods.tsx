import { BASELINE_CIRCULATION } from '../../engine/circulation.ts';
import { CALIBRATED } from '../../engine/calibrated.ts';
import { DRUGS, type DrugId } from '../../engine/pharmacology.ts';
import { PHENOTYPES } from '../../engine/patient.ts';
import { FEATURE_NAMES } from '../../envs/common.ts';
import { ACTIONS } from '../../envs/chronotropic.ts';

/** Schematic of the eight-compartment closed loop. */
function CircuitDiagram() {
  const box = (x: number, y: number, w: number, h: number, label: string, sub: string, fill: string) => (
    <g key={label}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} stroke="rgba(10,10,18,0.25)" />
      <text x={x + w / 2} y={y + 19} textAnchor="middle" className="me-boxlabel">{label}</text>
      <text x={x + w / 2} y={y + 33} textAnchor="middle" className="me-boxsub">{sub}</text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, label: string, dashed = false) => (
    <g key={`${x1}-${y1}-${label}`}>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="rgba(122,24,24,0.7)" strokeWidth={1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        markerEnd="url(#me-arrow)"
      />
      <text
        x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}
        textAnchor="middle" className="me-edge"
      >
        {label}
      </text>
    </g>
  );
  const heart = 'rgba(122,24,24,0.09)';
  const vessel = 'rgba(10,10,18,0.04)';
  return (
    <figure className="tr-fig tr-fig--wide">
      <svg viewBox="0 0 720 300" className="tr-svg" role="img"
        aria-label="Schematic of the eight-compartment closed-loop circulation">
        <defs>
          <marker id="me-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(122,24,24,0.7)" />
          </marker>
        </defs>
        {/* Left heart and systemic circuit, top row. */}
        {box(20, 30, 84, 44, 'LA', 'left atrium', heart)}
        {box(148, 30, 84, 44, 'LV', 'left ventricle', heart)}
        {box(276, 30, 100, 44, 'Aorta', 'systemic arteries', vessel)}
        {box(420, 30, 110, 44, 'Vena cava', 'systemic veins', vessel)}
        {box(574, 30, 84, 44, 'RA', 'right atrium', heart)}
        {arrow(104, 52, 146, 52, 'mitral')}
        {arrow(232, 52, 274, 52, 'aortic')}
        {arrow(376, 52, 418, 52, 'R sys')}
        {arrow(530, 52, 572, 52, 'R vc')}
        {/* Right heart and pulmonary circuit, bottom row, flowing back. */}
        {box(574, 200, 84, 44, 'RV', 'right ventricle', heart)}
        {box(420, 200, 110, 44, 'PA', 'pulmonary arteries', vessel)}
        {box(276, 200, 100, 44, 'PV', 'pulmonary veins', vessel)}
        {arrow(616, 76, 616, 198, 'tricuspid')}
        {arrow(572, 222, 532, 222, 'pulmonic')}
        {arrow(418, 222, 378, 222, 'R pul')}
        {arrow(274, 222, 64, 222, 'R pu')}
        {arrow(62, 220, 62, 78, '')}
        {/* Modulation. */}
        <rect x={148} y={196} width={100} height={52} rx={4} fill="none" stroke="rgba(10,10,18,0.2)" strokeDasharray="4 3" />
        <text x={198} y={216} textAnchor="middle" className="me-boxlabel">Baroreflex</text>
        <text x={198} y={230} textAnchor="middle" className="me-boxsub">rate, inotropy,</text>
        <text x={198} y={242} textAnchor="middle" className="me-boxsub">resistance, venous tone</text>
        {arrow(326, 76, 240, 194, '', true)}
      </svg>
      <figcaption className="rl-caption">
        Eight elastic compartments in a closed loop. The four cardiac chambers use a time-varying
        elastance law blending an active end-systolic line with a passive exponential filling
        curve; the four vascular compartments are linear elastances. Valves are smoothed diodes.
        Total cardiac volume generates a pericardial pressure added to every intracardiac chamber.
        The baroreflex senses arterial pressure and acts on heart period, contractility, systemic
        resistance and unstressed venous volume, each through its own delay and lag.
      </figcaption>
    </figure>
  );
}

const CHAMBERS = [
  ['Left ventricle', 'lv'],
  ['Right ventricle', 'rv'],
  ['Left atrium', 'la'],
  ['Right atrium', 'ra'],
] as const;

const VESSELS = [
  ['Aorta and systemic arteries', 'ao'],
  ['Systemic veins', 'vc'],
  ['Pulmonary arteries', 'pa'],
  ['Pulmonary veins', 'pu'],
] as const;

export function Methods() {
  const c = BASELINE_CIRCULATION;
  return (
    <>
      <section className="rl-hero">
        <div className="rl__inner">
          <span className="rl-hero__label">Model and methods</span>
          <h1 className="rl-hero__title">Everything the results depend on</h1>
          <p className="rl-hero__lede">
            The engine is a single implementation in one language. The same code calibrates the
            model, runs the verification suite, trains the controller, executes the trial and draws
            the live simulator in your browser. There is no second implementation to drift from,
            and no numerical dependency to pin.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Circulation</span>
          <h2 className="rl-section__title">Eight compartments, closed loop</h2>
          <CircuitDiagram />
          <p className="rl-section__body">
            Cardiac chambers follow the time-varying elastance formalism, blending an active
            end-systolic pressure-volume line with a passive exponential end-diastolic relationship
            under an activation waveform <code>e(t)</code>:
          </p>
          <pre className="me-eq">{`P_chamber = e(t) · E_es · (V − V_d)
          + (1 − e(t)) · P_0 · (exp(λ (V − V_0)) − 1)
          + P_pericardium + P_thoracic`}</pre>
          <p className="rl-section__body">
            Vascular compartments are linear about an unstressed volume,{' '}
            <code>P = E (V − V_u)</code>. Valves are logistic-gated diodes,{' '}
            <code>Q = (ΔP / R) · σ(ΔP / ε)</code> with ε = 0.05 mmHg, which is smooth enough for a
            fixed-step integrator without measurably departing from an ideal diode. Volume
            conservation across the eight compartments is exact to machine precision.
          </p>
          <p className="rl-section__body">
            Activation is <strong>event driven</strong>: a chamber begins contracting when the
            conduction model depolarises it. That is what allows atrioventricular dissociation,
            programmed delay and pacing to change stroke volume through the correct physical
            mechanism — the timing of the atrial contribution to ventricular filling — rather than
            through a fitted response surface. Systole shortens with rate as the square root of the
            cycle length, and contractility is scaled by a force-frequency relation, without which
            the model lets Frank-Starling compensate without limit and over-predicts stroke volume
            at exactly the slow rates this platform is about.
          </p>

          <h3 className="tr-h3">Calibrated parameters</h3>
          <p className="rl-caption">
            Chamber and vascular values follow a published minimal haemodynamic model, extended
            here with explicit atria and venous-return resistances, then calibrated by simplex
            search against reference adult haemodynamics. Pressures in mmHg, volumes in mL, time in
            seconds.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Cardiac chamber</th>
                  <th className="rl-num">E_es (mmHg/mL)</th>
                  <th className="rl-num">P_0 (mmHg)</th>
                  <th className="rl-num">λ (1/mL)</th>
                </tr>
              </thead>
              <tbody>
                {CHAMBERS.map(([label, key]) => {
                  const ch = c[key];
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="rl-num">{ch.eEs.toFixed(4)}</td>
                      <td className="rl-num">{ch.p0.toFixed(4)}</td>
                      <td className="rl-num">{ch.lambda.toFixed(4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Vascular compartment</th>
                  <th className="rl-num">Elastance (mmHg/mL)</th>
                </tr>
              </thead>
              <tbody>
                {VESSELS.map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="rl-num">{c[key].e.toFixed(5)}</td>
                  </tr>
                ))}
                <tr><td>Systemic resistance</td><td className="rl-num">{c.rSys.toFixed(4)} mmHg·s/mL</td></tr>
                <tr><td>Pulmonary resistance</td><td className="rl-num">{c.rPul.toFixed(4)} mmHg·s/mL</td></tr>
                <tr><td>Stressed blood volume</td><td className="rl-num">{CALIBRATED.stressedVolume.toFixed(0)} mL</td></tr>
                <tr><td>Intrathoracic pressure, end-expiratory</td><td className="rl-num">{c.pThoracic.toFixed(1)} mmHg</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Conduction</span>
          <h2 className="rl-section__title">Where the clinical fidelity lives</h2>
          <p className="rl-section__body">
            The therapeutic question — when a muscarinic antagonist helps, when it is useless, and
            when it makes things worse — is decided entirely by where the lesion sits. That is not
            scripted. It emerges from three mechanisms.
          </p>
          <p className="rl-section__body">
            <strong>First</strong>, the sinus and atrioventricular nodes are vagally innervated and
            the His-Purkinje system is not, so muscarinic blockade accelerates the node and
            facilitates nodal conduction, and does nothing below it.{' '}
            <strong>Second</strong>, nodal conduction follows a recovery curve,{' '}
            <code>PR = A + B·exp(−(H − ERP)/τ)</code>, so as the atrial rate rises the interval
            lengthens until a beat lands in the refractory period and is dropped — Wenckebach
            periodicity is emergent, not a special case. <strong>Third</strong>, diseased
            infranodal tissue conducts <em>worse</em> at higher input rates, so accelerating the
            atria increases the block ratio and the ventricular rate can fall. The benefit and the
            harm come out of the same equations.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Conduction lesion</th>
                  <th>Site</th>
                  <th className="rl-num">Prevalence</th>
                  <th>Expected atropine response</th>
                </tr>
              </thead>
              <tbody>
                {PHENOTYPES.map((p) => (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    <td className="rl-muted">{p.lesion.replace('_', ' ')}</td>
                    <td className="rl-num">{(p.prevalence * 100).toFixed(0)}%</td>
                    <td>{p.atropineExpectation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rl-caption">
            Prevalence weights describe a symptomatic-bradycardia population presenting to acute
            care, weighted towards post-procedural conduction disease. They are an explicit
            modelling assumption, stated here so that the trial&rsquo;s subgroup structure is
            auditable.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Pharmacology</span>
          <h2 className="rl-section__title">Compartmental kinetics with an effect site</h2>
          <p className="rl-section__body">
            Every drug drives a separate effect compartment, which is what makes the simulation
            clinically honest: the haemodynamic response lags the plasma concentration, so a
            controller that re-doses on an unchanged heart rate thirty seconds after a bolus will
            stack doses. For atropine that lag is the defining feature of the problem. The labelled
            time to peak chronotropic effect is seven to eight minutes; the guideline permits
            repeating every three. The first dose has not peaked when the second is due, and will
            not have peaked when the third is due either.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="rl-num">V₁ (L)</th>
                  <th className="rl-num">k₁₀ (1/s)</th>
                  <th className="rl-num">k_e0 (1/s)</th>
                  <th className="rl-num">EC₅₀</th>
                  <th>Receptor profile</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(DRUGS) as DrugId[]).map((id) => {
                  const d = DRUGS[id];
                  const r = d.receptors;
                  const profile = id === 'atropine'
                    ? 'muscarinic antagonist'
                    : [
                        r.beta1Chrono > 0 ? `β1 chrono ${r.beta1Chrono}` : '',
                        r.beta1Ino > 0 ? `β1 ino ${r.beta1Ino}` : '',
                        r.alpha1 > 0 ? `α1 ${r.alpha1}` : '',
                        r.beta2 > 0 ? `β2 ${r.beta2}` : '',
                      ].filter(Boolean).join(', ');
                  return (
                    <tr key={id}>
                      <td>{d.label} <span className="tr-unit">({d.doseUnit})</span></td>
                      <td className="rl-num">{d.v1}</td>
                      <td className="rl-num">{d.k10.toExponential(2)}</td>
                      <td className="rl-num">{d.ke0.toExponential(2)}</td>
                      <td className="rl-num">{d.ec50}</td>
                      <td className="rl-muted">{profile}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="rl-caption">
            Concentration-effect relationships are sigmoidal on effect-site concentration.
            Catecholamine receptor occupancies add and then saturate, so two beta agonists at
            half-maximal effect do not produce twice the maximal response. Every constant carries
            its provenance in the source.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Sensing and control</span>
          <h2 className="rl-section__title">What the controller sees and what it can do</h2>
          <p className="rl-section__body">
            The engine computes ground truth; the controller never sees it. Three degradations in
            the sensing layer change what the optimal policy is. Non-invasive pressure is
            intermittent, so the controller acts on a reading that is on average thirty seconds
            old. Electrical capture is not mechanical capture — a transcutaneous stimulus produces
            a wide complex on the monitor whether or not the ventricle ejected, and in prehospital
            series the large majority of apparent capture was false in patients who had a palpable
            pulse at the time. And beat-to-beat variability carries the information the controller
            most needs, because vagally mediated bradycardia has high variability and an escape
            rhythm has almost none.
          </p>
          <div className="me-cols">
            <div>
              <h3 className="tr-h3">Observation, {FEATURE_NAMES.length} features</h3>
              <ol className="me-list">
                {FEATURE_NAMES.map((f) => <li key={f}>{f}</li>)}
              </ol>
            </div>
            <div>
              <h3 className="tr-h3">Action space, {ACTIONS.length} discrete actions</h3>
              <ol className="me-list">
                {ACTIONS.map((a) => <li key={a}>{a}</li>)}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Learning</span>
          <h2 className="rl-section__title">Conservative Q-learning, anchored to the guideline</h2>
          <p className="rl-section__body">
            A dueling action-value network trained with double Q-learning and a Huber
            temporal-difference loss. Three choices are made for reviewability rather than for
            return, and each costs a little performance.
          </p>
          <p className="rl-section__body">
            <strong>A conservative penalty</strong> pushes down the value of actions the training
            distribution does not support, so the learned value function lower-bounds the true
            value rather than over-estimating it. Optimistic extrapolation onto unsupported actions
            is the characteristic failure of value-based methods in medicine.
          </p>
          <p className="rl-section__body">
            <strong>An anchor to the comparator.</strong> The same functional form, evaluated at the
            action the guideline algorithm would have taken, raises the value of the
            standard-of-care action relative to alternatives. It is annealed, so the policy begins
            by imitating and is progressively released to improve. It is applied only at states
            where the guideline intervenes: the comparator waits at four decisions in five, and an
            unweighted anchor becomes a classification problem with an overwhelming majority class
            that the network solves by never acting.
          </p>
          <p className="rl-section__body">
            <strong>Multi-step returns.</strong> Atropine&rsquo;s effect peaks fifteen decision
            intervals after it is given. With single-step bootstrapping the consequence has to
            propagate back across fifteen updates before the network can associate the dose with
            the response. In a domain defined by actuator dead time, multi-step returns are
            structural rather than a tuning detail.
          </p>
          <p className="rl-section__body">
            Exploration mixes guideline actions, uniform actions and the greedy policy on an
            annealed schedule, so the training distribution stays centred on standard of care. The
            transition stored is always the action <em>executed</em> after the constraint filter,
            never the action proposed — storing the proposal would teach the value function the
            consequences of something that never happened.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner rl__inner--narrow">
          <span className="rl-section__label">Reproducing this</span>
          <h2 className="rl-section__title">Commands</h2>
          <pre className="me-eq">{`npm run calibrate    # simplex fit of the structural parameters
npm run verify       # steady-state validation report
npm run verify:grid  # grid refinement and conservation study
npm run verify:phys  # physiological response validation
npm run verify:stats # trial statistics against known cases
npm run train        # train the chronotropic policy
npm run trial        # execute the in-silico trial`}</pre>
          <p className="rl-section__body">
            Every artefact the site renders is written by one of these commands. Cohorts are
            generated from recorded master seeds through a counter-based generator, so subject{' '}
            <em>n</em> is reproducible in isolation and independent of how many subjects were drawn
            before it — which means a reviewer can regenerate any single subject, or the whole
            trial, and get the same numbers.
          </p>
        </div>
      </section>
    </>
  );
}
