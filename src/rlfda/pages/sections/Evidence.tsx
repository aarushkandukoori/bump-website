import validation from '../../data/validation.json';
import solution from '../../data/solution-verification.json';
import physiology from '../../data/physiology-validation.json';
import policyBundle from '../../data/policy-chronotropic.json';
import { SHIELD_RULES } from '../../envs/shield.ts';

interface AtropineRow {
  label: string;
  expectation: string;
  baselineHr: number;
  afterHr: number;
  deltaHr: number;
  responderRate: number;
  worsenedRate: number;
  n: number;
}

const GMLP = [
  ['Multi-disciplinary expertise across the total product life cycle',
    'The environment, the reward and the constraint set are specified in clinical terms — lesion site, guideline thresholds, labelled dose limits — rather than in terms convenient to the optimiser.'],
  ['Good software engineering and security practices',
    'One engine, no numerical dependencies, deterministic seeded generation throughout, and a verification suite that runs on every change.'],
  ['Clinical study participants and data sets representative of the intended population',
    'The virtual population is specified with explicit prevalence weights over conduction lesions and demographic distributions, and the enrolment criterion is stated and its screen failure rate reported.'],
  ['Training data sets independent of test sets',
    'Training, validation and evaluation cohorts are generated from three disjoint master seeds. The trial cohort took no part in model selection.'],
  ['Reference datasets based on best available methods',
    'Calibration and validation targets are published reference haemodynamics, fixed in advance, with a third of them withheld from the fit.'],
  ['Model design tailored to the available data and the intended use',
    'A small dueling network with a conservative penalty and an anchor to the guideline comparator, chosen for auditability over capacity.'],
  ['Focus on the performance of the human-AI team',
    'Not yet addressed. The controller is evaluated in isolation; a use-related risk analysis and a human-factors evaluation would be required before any clinical claim.'],
  ['Testing demonstrates performance during clinically relevant conditions',
    'The evaluation model degrades sensing, uses intermittent non-invasive pressure, and enables the catastrophic hazards withheld from training.'],
  ['Users provided clear, essential information',
    'Every constraint activation and every therapy change is logged with its rule and rationale; the trial reports the intervention rate by rule.'],
  ['Deployed models monitored for performance and re-training risks managed',
    'Addressed by the change control plan below. The shipped policy is locked; nothing adapts in the field.'],
] as const;

const PCCP_MODIFICATIONS = [
  ['Re-training on an expanded virtual population',
    'Re-fit the policy after adding conduction phenotypes or widening the parameter distributions, with the architecture, feature set and action space unchanged.'],
  ['Re-training on updated calibration targets',
    'Re-fit after the underlying model is recalibrated to revised reference haemodynamics, again with architecture and interfaces fixed.'],
  ['Re-weighting the reward within its stated terms',
    'Adjust the relative weight of existing reward terms. New terms, and any change to the action space or the constraint set, fall outside the plan.'],
];

export function Evidence() {
  const rows = validation.rows;
  const passed = rows.filter((r) => r.pass).length;
  const heldOut = rows.filter((r) => !r.calibrated);
  const heldOutPassed = heldOut.filter((r) => r.pass).length;
  const atropine = physiology.atropineByPhenotype as unknown as AtropineRow[];
  const grid = solution.rows;
  const worst = solution.worstGciPercent;
  const drift = solution.conservation;
  const provenance = (policyBundle as { provenance: Record<string, string | number> }).provenance;

  return (
    <>
      <section className="rl-hero">
        <div className="rl__inner">
          <span className="rl-hero__label">Credibility and evidence</span>
          <h1 className="rl-hero__title">The record a reviewer would actually ask for</h1>
          <p className="rl-hero__lede">
            A simulation result is worth exactly what its credibility argument is worth. This is
            that argument, assembled the way the computational modelling guidance asks: a stated
            question, a bounded context of use, an explicit model-risk assessment, and verification
            and validation proportionate to that risk. Every number below is written by the code
            that produced it, so the page cannot drift from the run.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Step 1 and 2</span>
          <h2 className="rl-section__title">Question of interest and context of use</h2>
          <div className="tr-design">
            <dl>
              <dt>Question of interest</dt>
              <dd>
                Does a learned chronotropic controller, operating under a fixed constraint set,
                hold mean arterial pressure in target better than the guideline algorithm in adults
                with symptomatic bradycardia and haemodynamic compromise, without increasing drug
                or pacing exposure?
              </dd>
              <dt>Context of use</dt>
              <dd>
                A closed-loop lumped-parameter cardiovascular model with an event-driven conduction
                system, arterial baroreflex and compartmental pharmacology, used to generate a
                virtual cohort and to execute a paired comparison of two control policies over a
                forty-five-minute episode. <strong>The model is used for controller design and
                comparative evaluation only.</strong> It is not used to predict outcome for any
                individual, to support a labelling claim, or in place of a clinical investigation.
              </dd>
              <dt>Model influence</dt>
              <dd>
                <strong>High.</strong> No bench or animal evidence contributes to the comparison;
                the simulation is the entire basis for it.
              </dd>
              <dt>Decision consequence</dt>
              <dd>
                <strong>Medium at present, high if extended.</strong> As used here — to select
                between candidate controllers and to bound a design space before any clinical work
                — an incorrect conclusion wastes development effort. Were the same model used to
                support an investigational application, the consequence would rise to high and the
                credibility goals below would have to rise with it.
              </dd>
              <dt>Model risk</dt>
              <dd>
                Influence multiplied by consequence: <strong>medium-high</strong>. This drives the
                verification and validation levels sought below.
              </dd>
            </dl>
          </div>
          <div className="rl-note">
            <strong>A scope boundary worth stating plainly.</strong> The computational modelling
            credibility framework applies to first-principles models and excludes standalone
            machine-learning models; for those it directs sponsors to seek feedback on their
            specific device. So this record covers the <em>plant</em> — the physiology — under that
            framework, and covers the <em>policy</em> under good machine-learning practice and a
            change control plan. The two halves are held together by the constraint set, which is
            deterministic and can be verified on its own.
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Verification</span>
          <h2 className="rl-section__title">Is the mathematics being solved correctly?</h2>
          <p className="rl-section__body">
            Two questions, kept apart. <strong>Code verification</strong> asks whether the
            implementation solves the equations it claims to; it is addressed by conservation
            checks and by exact-solution tests on the components that have them.{' '}
            <strong>Calculation verification</strong> asks whether the discretisation is fine
            enough that numerical error is negligible against the quantities reported.
          </p>
          <p className="rl-section__body">
            The grid study below refines the integration step by successive halving while holding
            every event time fixed, so that the only difference between runs is truncation error.
            The grid convergence index is the Richardson error band: a value of 0.05% means the
            reported number is within about a twentieth of a per cent of the exact solution of the
            underlying equations.
          </p>

          <div className="rl-stats">
            <div className="rl-stat">
              <span className="rl-stat__value">{worst.toFixed(3)}%</span>
              <span className="rl-stat__label">
                Largest grid convergence index across all reported quantities, at the 1 ms
                production step
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat__value">
                {Math.abs(drift.driftMl / drift.initialMl).toExponential(0).replace('e-', '×10⁻')}
              </span>
              <span className="rl-stat__label">
                Relative drift in total circulating volume over 900 s — machine precision, not
                tolerance
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat__value">4</span>
              <span className="rl-stat__label">
                Formal order of the integrator; the linear pharmacokinetic and reflex states are
                advanced by their exact exponential solution instead
              </span>
            </div>
          </div>

          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Quantity</th>
                  <th className="rl-num">2 ms</th>
                  <th className="rl-num">1 ms</th>
                  <th className="rl-num">0.5 ms</th>
                  <th className="rl-num">Grid convergence index</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((r) => (
                  <tr key={r.quantity}>
                    <td>{r.quantity}</td>
                    <td className="rl-num">{r.coarse.toFixed(3)}</td>
                    <td className="rl-num">{r.medium.toFixed(3)}</td>
                    <td className="rl-num">{r.fine.toFixed(3)}</td>
                    <td className="rl-num">{r.gciPercent.toFixed(4)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rl-caption">
            Successive grids differ by less than a fiftieth of a per cent on most quantities, which
            is below the resolution at which an observed order of convergence can be estimated at
            all. That is a stronger statement about convergence than an order estimate would be,
            not a weaker one.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Validation</span>
          <h2 className="rl-section__title">Does the model reproduce the real thing?</h2>
          <p className="rl-section__body">
            Calibration and validation are deliberately not the same set. Fifteen structural
            parameters were fitted to reference adult haemodynamics by simplex search; the
            quantities marked below as validation-only were never seen by the optimiser, so
            agreement on them is evidence rather than arithmetic.{' '}
            <strong>{heldOutPassed} of {heldOut.length}</strong> held-out quantities fall inside
            their accepted range, and <strong>{passed} of {rows.length}</strong> overall.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Quantity</th>
                  <th className="rl-num">Model</th>
                  <th className="rl-num">Accepted range</th>
                  <th>Role</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label} <span className="tr-unit">({r.unit})</span></td>
                    <td className="rl-num">{r.measured.toFixed(2)}</td>
                    <td className="rl-num">{r.low} – {r.high}</td>
                    <td className={r.calibrated ? 'rl-muted' : ''}>
                      {r.calibrated ? 'calibration target' : 'held out'}
                    </td>
                    <td>{r.pass ? <span className="rl-pass">within</span> : <span className="rl-fail">outside</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="tr-h3">Emergent behaviour: response to atropine by lesion site</h3>
          <p className="rl-caption">
            The strongest validation evidence in this record, and the one the whole platform rests
            on. Nothing in the engine contains a rule saying atropine fails in infranodal block.
            What it contains is a vagally innervated sinus and atrioventricular node, an
            un-innervated conduction system below them, and infranodal conduction that fails more
            often at higher input rates. The clinical pattern below — brisk response where the
            lesion is vagal or nodal, none where it is not, and a fall in rate in a third of
            infranodal subjects — is a consequence of those mechanisms, not an input to them.
            Each row is {atropine[0]?.n ?? 40} subjects given 1 mg intravenously.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Conduction lesion</th>
                  <th className="rl-num">Rate before</th>
                  <th className="rl-num">Rate after</th>
                  <th className="rl-num">Change</th>
                  <th className="rl-num">Responders</th>
                  <th className="rl-num">Rate fell</th>
                  <th>Clinical expectation</th>
                </tr>
              </thead>
              <tbody>
                {atropine.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="rl-num">{r.baselineHr.toFixed(1)}</td>
                    <td className="rl-num">{r.afterHr.toFixed(1)}</td>
                    <td className="rl-num">
                      {r.deltaHr >= 0 ? '+' : ''}{r.deltaHr.toFixed(1)}
                    </td>
                    <td className="rl-num">{(r.responderRate * 100).toFixed(0)}%</td>
                    <td className="rl-num">{(r.worsenedRate * 100).toFixed(0)}%</td>
                    <td>{r.expectation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Constraint set</span>
          <h2 className="rl-section__title">Where the safety argument actually lives</h2>
          <p className="rl-section__body">
            Ten deterministic predicates over observable quantities. The policy proposes; these
            dispose. Each traces to a specific published limit, each is verifiable without
            reference to the network, and because they are verified separately, retraining the
            policy does not invalidate them — which is what makes a change control plan for the
            policy tractable at all.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Constraint</th>
                  <th>Basis</th>
                  <th>Hazard controlled</th>
                </tr>
              </thead>
              <tbody>
                {SHIELD_RULES.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.id}</code></td>
                    <td>{r.statement}</td>
                    <td className="rl-muted">{r.provenance}</td>
                    <td className="rl-muted">{r.hazard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">The learned component</span>
          <h2 className="rl-section__title">Good machine-learning practice, honestly scored</h2>
          <p className="rl-section__body">
            The ten joint guiding principles, with what this platform does about each. One is not
            addressed at all, and saying so is more useful than claiming otherwise.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr><th>Principle</th><th>Status here</th></tr>
              </thead>
              <tbody>
                {GMLP.map(([p, status], i) => (
                  <tr key={p}>
                    <td>{i + 1}. {p}</td>
                    <td className={status.startsWith('Not yet') ? 'rl-fail' : ''}>{status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="tr-h3">Training provenance</h3>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead>
                <tr><th>Item</th><th className="rl-num">Value</th></tr>
              </thead>
              <tbody>
                {Object.entries(provenance).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</td>
                    <td className="rl-num">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner">
          <span className="rl-section__label">Change control</span>
          <h2 className="rl-section__title">Predetermined change control plan</h2>
          <p className="rl-section__body">
            The shipped policy is locked. It does not learn in the field, and nothing about a
            deployed controller changes between releases. What a change control plan buys is the
            ability to retrain and redeploy without a new marketing submission each time — and it
            buys that only for modifications specified in advance, assessed by a protocol agreed in
            advance, whose combined impact has been analysed in advance. The three sections below
            are the three the framework requires.
          </p>

          <h3 className="tr-h3">1. Description of modifications</h3>
          <p className="rl-caption">
            Deliberately few and deliberately narrow. Modifications are implemented{' '}
            <strong>manually</strong> and <strong>globally</strong>: a release is built, validated
            and deployed to every device identically. Nothing is implemented automatically, and no
            device adapts to its own site or patient.
          </p>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead><tr><th>Modification</th><th>Scope</th></tr></thead>
              <tbody>
                {PCCP_MODIFICATIONS.map(([m, d]) => (
                  <tr key={m}><td>{m}</td><td>{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="tr-h3">2. Modification protocol</h3>
          <div className="rl-tablewrap">
            <table className="rl-table">
              <thead><tr><th>Component</th><th>Commitment</th></tr></thead>
              <tbody>
                <tr>
                  <td>Data management</td>
                  <td>
                    Cohorts are generated from recorded master seeds and are reproducible exactly.
                    Training, validation and evaluation seeds remain disjoint. Population
                    composition is reported with prevalence weights and the enrolment screen
                    failure rate, and any change to that composition is itself a modification.
                  </td>
                </tr>
                <tr>
                  <td>Re-training</td>
                  <td>
                    Architecture, feature set, action space and constraint set are fixed. Only
                    network parameters change. Re-training is triggered by a change to the virtual
                    population or to the calibration targets, never by field data.
                  </td>
                </tr>
                <tr>
                  <td>Performance evaluation</td>
                  <td>
                    Each candidate is compared on a fresh evaluation cohort against both the
                    guideline comparator <em>and</em> the previously released version, on the
                    primary endpoint and the full safety family, with the non-inferiority margins
                    already fixed. Model calibration and solution verification are re-run in full.
                  </td>
                </tr>
                <tr>
                  <td>Acceptance and failure</td>
                  <td>
                    A candidate is released only if it is non-inferior to the released version on
                    every safety endpoint and no worse on the primary. If a failure is not
                    resolvable by root-cause analysis, it is recorded and{' '}
                    <strong>the modification is not implemented</strong>.
                  </td>
                </tr>
                <tr>
                  <td>Update procedure</td>
                  <td>
                    Manual, global, versioned. The version identifier is recorded with every result
                    the policy produces, including on this site.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="tr-h3">3. Impact assessment</h3>
          <p className="rl-caption">
            Each modification changes network parameters only, so the constraint set, the actuator
            limits and the failure behaviour are unchanged by construction — the shield&rsquo;s
            verification is not re-opened. The residual risk is a policy that performs worse
            without violating any constraint, which the acceptance criteria above are designed to
            catch. The modifications interact only through the training distribution, and their
            cumulative effect is bounded by the requirement that every release be compared against
            both the original and the immediately preceding version rather than only against the
            comparator.
          </p>
        </div>
      </section>

      <section className="rl-section">
        <div className="rl__inner rl__inner--narrow">
          <span className="rl-section__label">Limitations</span>
          <h2 className="rl-section__title">Recorded assumptions and what they cost</h2>
          <p className="rl-section__body">
            <strong>The baroreflex acts on filtered mean pressure.</strong> Real baroreceptors fire
            in bursts synchronised to the pulse. Driving the afferent sigmoid with the raw
            pulsatile waveform swings it outside its linear range on every beat and leaves mean
            firing almost blind to mean pressure, which would defeat the reflex&rsquo;s purpose in
            a model about pressure regulation. Filtering first preserves the static gain, the set
            point and the dynamics, and costs the ability to reproduce pulse-pressure-dependent
            baroreceptor effects.
          </p>
          <p className="rl-section__body">
            <strong>The interventricular septum is omitted.</strong> Direct ventricular interaction
            is a second-order influence on the mean-pressure question, and the pericardial
            constraint that remains captures the dominant part of the coupling. It would matter for
            a question about right-ventricular failure, which is not the question here.
          </p>
          <p className="rl-section__body">
            <strong>The atropine pharmacodynamic model is thinly supported.</strong> No population
            pharmacokinetic-pharmacodynamic model for atropine&rsquo;s chronotropic effect exists.
            The disposition follows the only published integrated kinetic-dynamic study, which had
            three subjects; the effect-site constant is set to the labelled seven-to-eight-minute
            time to peak; and the low-dose paradoxical response is a phenomenological term fitted
            to the documented dose threshold, gated on intact innervation because the decisive
            experiment showed a decentralised sinus node has no bradycardic phase at all.
          </p>
          <p className="rl-section__body">
            <strong>Response rates by block level are constructed from mechanism.</strong> No
            published study stratifies atropine response by sinus bradycardia against Mobitz I
            against Mobitz II against complete block with narrow or wide escape. The model produces
            such a stratification from the underlying anatomy, and the aggregate response rate it
            yields is consistent with unselected prehospital series — but the stratification itself
            is a prediction of the model, not a validation of it.
          </p>
          <p className="rl-section__body">
            <strong>Human factors are not addressed.</strong> The controller is evaluated in
            isolation. Nothing here speaks to how a clinician would supervise it, when they would
            override it, or how the constraint activations would be presented. That work is a
            precondition of any clinical claim and has not been done.
          </p>
        </div>
      </section>
    </>
  );
}
