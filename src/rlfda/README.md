# Regulatory simulation programme

A cardiovascular simulator, a reinforcement-learning controller trained inside it, and the
verification, validation and trial machinery that make the result assessable.

Everything is one TypeScript implementation. The same code calibrates the model, runs the
verification suite, trains the policy, executes the in-silico trial, and draws the live simulator
in the browser. There is no second implementation to drift from and no numerical dependency.

## Layout

    engine/      the physiology
      circulation.ts   eight-compartment closed loop, time-varying elastance chambers
      activation.ts    double-Hill activation, rate-dependent systole duration
      conduction.ts    sinus node, AV nodal recovery curve, His-Purkinje, escape foci, pacing
      autonomic.ts     Ursino-form arterial baroreflex with delayed, lagged effectors
      pharmacology.ts  compartmental PK with effect sites for atropine and four catecholamines
      model.ts         the integrated hybrid system and its RK4 driver
      patient.ts       conduction phenotypes, inter-subject variability, enrolment
      sensors.ts       the observation model: noise, latency, false pacing capture
      ecg.ts           surface electrocardiogram synthesis (display only)
      rng.ts           counter-based seeded generation; Math.random is never used

    envs/        the control problem
      chronotropic.ts  Programme A: action space, reward, episode, control metrics
      shield.ts        the ten deterministic safety constraints
      guideline.ts     the 2020 bradycardia algorithm as a comparator and anchor
      common.ts        feature encoding shared by every consumer

    rl/          the learned component
      mlp.ts           dueling network, explicit forward and backward passes
      dqn.ts           conservative double Q-learning, guideline anchor, n-step returns
      replay.ts        flat typed-array replay
      policy.ts        inference only; the artefact that ships

    trial/       the evidence
      trial.ts         paired within-subject in-silico trial
      stats.ts         BCa bootstrap, Wilcoxon signed-rank, McNemar, Benjamini-Hochberg

    ../../verification/   calibration, verification and validation scripts
    ../../tools/          training and trial entry points

## Reproducing

    npm run calibrate     # simplex fit, rate refinement, bake constants into the engine
    npm run verify        # steady-state validation against reference haemodynamics
    npm run verify:grid   # grid refinement and volume conservation
    npm run verify:phys   # physiological response validation
    npm run verify:stats  # trial statistics against known cases
    npm run verify:all    # everything that gates a release
    npm run train         # train the chronotropic policy
    npm run trial         # execute the in-silico trial

Each writes a JSON artefact into `data/`, which the site renders directly. The published pages
therefore cannot disagree with the runs that produced them.

## Data separation

Three disjoint master seeds generate the cohorts: 1001 for training, 2002 for validation and
model selection, 3003 for the trial. Subject seeds are derived rather than sequential, so subject
*n* is reproducible in isolation and independent of how many were drawn before it.

Training runs against a *design* model — 2 ms step, clean sensing, catastrophic hazards withheld.
The trial runs against an *evaluation* model — 1 ms step, degraded sensing, every hazard enabled.

## Status

Engineering research. Not a medical device, not reviewed by any regulator, not clinical evidence.
