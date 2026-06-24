import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from 'framer-motion';
import { useId, useRef, useState } from 'react';
import { BumpDevice } from './BumpDevice';
import { PhoneApp } from './PhoneApp';
import './HowItWorks.css';

type JourneyVisual = 'baseline' | 'drop' | 'respond' | 'transport' | 'treat';

const steps = [
  {
    number: '01',
    title: 'Stable heartbeat',
    label: 'Continuous Monitoring',
    description: 'BUMP monitors heart rate continuously and keeps a safe baseline in view.',
    visual: 'baseline' as JourneyVisual,
  },
  {
    number: '02',
    title: 'Heartbeat drops rapidly',
    label: 'Critical Event',
    description: 'A sharp fall is detected in real time before collapse can progress further.',
    visual: 'drop' as JourneyVisual,
  },
  {
    number: '03',
    title: 'Device acts immediately',
    label: 'Autonomous Response',
    description: 'The device delivers medication and pushes urgent alerts to bystanders and contacts.',
    visual: 'respond' as JourneyVisual,
  },
  {
    number: '04',
    title: 'Patient is taken to hospital',
    label: 'Emergency Transfer',
    description: 'EMS transports the patient while responders already have event timing and status.',
    visual: 'transport' as JourneyVisual,
  },
  {
    number: '05',
    title: 'Hospital team treats and stabilizes',
    label: 'Definitive Care',
    description: 'Clinical care takes over with full context from BUMP logs and app timeline.',
    visual: 'treat' as JourneyVisual,
  },
];

export function HowItWorks() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const { scrollYProgress } = useScroll({
    target: scrollerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const index = Math.min(steps.length - 1, Math.max(0, Math.floor(value * steps.length)));
    setActiveStep(index);
  });

  return (
    <section className="how-it-works" id="how-it-works">
      <div className="section__inner section__inner--center">
        <motion.span
          className="section__label"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          Emergency Journey
        </motion.span>
        <motion.h2
          className="section__headline section__headline--large"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          From heartbeat drop to hospital treatment
        </motion.h2>
      </div>

      <div
        ref={scrollerRef}
        className="journey-scroller"
        style={{ height: `${steps.length * 85}vh` }}
      >
        <div className="journey-scroller__sticky">
          <div className="journey-scroller__sidebar">
            {steps.map((step, i) => {
              const isActive = i === activeStep;
              const isLit = i <= activeStep;

              return (
                <motion.div
                  key={step.number}
                  className={`journey-step ${isActive ? 'journey-step--active' : ''} ${isLit ? 'journey-step--lit' : ''}`}
                  animate={{
                    opacity: isLit ? 1 : 0.34,
                  }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="journey-step__meta">
                    <motion.span
                      className="journey-step__number"
                      animate={{
                        color: isActive
                          ? 'var(--accent)'
                          : isLit
                            ? 'var(--text-secondary)'
                            : 'var(--text-muted)',
                      }}
                      transition={{ duration: 0.35 }}
                    >
                      {step.number}
                    </motion.span>
                    <motion.span
                      className="journey-step__label"
                      animate={{
                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                        opacity: isLit ? 1 : 0.7,
                      }}
                      transition={{ duration: 0.35 }}
                    >
                      {step.label}
                    </motion.span>
                  </div>
                  <motion.h3
                    className="journey-step__title"
                    animate={{
                      color: isActive ? 'var(--text-primary)' : isLit ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                    transition={{ duration: 0.35 }}
                  >
                    {step.title}
                  </motion.h3>
                  <motion.p
                    className="journey-step__desc"
                    initial={false}
                    animate={{
                      opacity: isActive ? 1 : 0,
                      maxHeight: isActive ? 120 : 0,
                      marginTop: isActive ? 8 : 0,
                    }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    {step.description}
                  </motion.p>
                </motion.div>
              );
            })}
          </div>

          <div className="journey-scroller__visual">
            <div className="journey-scroller__visual-frame">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  className="journey-scroller__visual-stage"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <JourneyScene visual={steps[activeStep].visual} play />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function JourneyScene({ visual, play = false }: { visual: JourneyVisual; play?: boolean }) {
  if (visual === 'baseline') {
    return (
      <>
        <BumpDevice variant="monitor" className="how-step__device" />
        <PhoneApp screen="status" size="sm" className="how-step__phone" />
      </>
    );
  }

  if (visual === 'drop') {
    return (
      <div className="journey-heartdrop">
        <motion.svg viewBox="0 0 420 160" className="journey-heartdrop__line" aria-hidden="true">
          <line x1="0" y1="80" x2="420" y2="80" stroke="rgba(122,24,24,0.12)" strokeWidth="2" />
          <motion.path
            d="M0 70 L70 70 L110 70 L135 46 L160 114 L185 70 L240 70 L300 76 L340 100 L420 116"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: play ? 1 : 0 }}
            transition={{ duration: 1.6, ease: 'easeInOut' }}
          />
        </motion.svg>
        <BumpDevice variant="detect" className="journey-heartdrop__device how-step__device" />
        <PhoneApp screen="dashboard" size="sm" className="how-step__phone" />
      </div>
    );
  }

  if (visual === 'respond') {
    return (
      <>
        <BumpDevice variant="respond" className="how-step__device" />
        <PhoneApp screen="alert" size="sm" className="how-step__phone" />
      </>
    );
  }

  if (visual === 'transport') {
    return <AmbulanceScene play={play} />;
  }

  return <HospitalScene play={play} />;
}

function AmbulanceScene({ play = false }: { play?: boolean }) {
  return (
    <div className="journey-transport">
      <motion.div
        className="journey-transport__ambulance"
        initial={{ x: -120, opacity: 0 }}
        animate={play ? { x: 0, opacity: 1 } : { x: -120, opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <AmbulanceIcon />
      </motion.div>
      <motion.div
        className="journey-transport__hospital"
        initial={{ opacity: 0, y: 16 }}
        animate={play ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.7, delay: play ? 0.2 : 0 }}
      >
        <HospitalIcon />
      </motion.div>
    </div>
  );
}

function AmbulanceIcon() {
  const uid = useId().replace(/:/g, '');

  return (
    <svg viewBox="0 0 320 168" className="journey-transport__svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7eaef" />
        </linearGradient>
        <linearGradient id={`${uid}-cab`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8f9fb" />
          <stop offset="100%" stopColor="#d9dde5" />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9ecff" />
          <stop offset="100%" stopColor="#8eb5d9" />
        </linearGradient>
        <linearGradient id={`${uid}-stripe`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#601212" />
          <stop offset="50%" stopColor="#7a1818" />
          <stop offset="100%" stopColor="#601212" />
        </linearGradient>
        <linearGradient id={`${uid}-tire`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f4652" />
          <stop offset="100%" stopColor="#1a1f28" />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2f4f7" />
          <stop offset="100%" stopColor="#b8bec8" />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#0a0a12" floodOpacity="0.16" />
        </filter>
      </defs>

      <ellipse cx="156" cy="150" rx="118" ry="10" fill="rgba(10, 10, 18, 0.09)" />

      <g filter={`url(#${uid}-shadow)`}>
        <rect x="108" y="52" width="154" height="72" rx="10" fill={`url(#${uid}-body)`} stroke="rgba(10,10,18,0.1)" />
        <rect x="108" y="52" width="154" height="12" rx="10" fill="#f4f5f8" />
        <path
          d="M34 68 L34 118 Q34 124 40 124 L98 124 L108 118 L108 68 Q108 58 98 58 L48 58 Q34 58 34 68 Z"
          fill={`url(#${uid}-cab)`}
          stroke="rgba(10,10,18,0.1)"
        />
        <path d="M42 66 L96 66 L104 74 L104 88 L42 88 Z" fill={`url(#${uid}-glass)`} opacity="0.9" />
        <path d="M44 90 L102 90 L102 104 L44 104 Z" fill={`url(#${uid}-glass)`} opacity="0.55" />
        <rect x="34" y="104" width="228" height="14" fill={`url(#${uid}-stripe)`} />
        <rect x="34" y="118" width="228" height="4" fill="#4a0f0f" opacity="0.35" />
        <rect x="176" y="72" width="44" height="24" rx="4" fill="#ffffff" opacity="0.95" />
        <rect x="190" y="76" width="16" height="16" rx="1.5" fill={`url(#${uid}-stripe)`} />
        <rect x="194" y="72" width="8" height="24" rx="1.5" fill={`url(#${uid}-stripe)`} />
        <rect x="186" y="80" width="24" height="8" rx="1.5" fill={`url(#${uid}-stripe)`} />
        <rect x="124" y="70" width="34" height="22" rx="4" fill={`url(#${uid}-glass)`} opacity="0.82" />
        <rect x="166" y="70" width="34" height="22" rx="4" fill={`url(#${uid}-glass)`} opacity="0.72" />
        <rect x="224" y="70" width="24" height="22" rx="4" fill={`url(#${uid}-glass)`} opacity="0.65" />
        <rect x="138" y="44" width="88" height="8" rx="4" fill="#2d3138" />
        <rect x="142" y="46" width="22" height="4" rx="2" fill="#ff5a4f" />
        <rect x="168" y="46" width="22" height="4" rx="2" fill="#ffb020" />
        <rect x="194" y="46" width="22" height="4" rx="2" fill="#ff5a4f" />
        <rect x="30" y="120" width="12" height="8" rx="2" fill="#b8bec8" />
        <rect x="254" y="120" width="12" height="8" rx="2" fill="#b8bec8" />
        <rect x="38" y="112" width="10" height="6" rx="2" fill="#fff7d6" />
        <rect x="36" y="78" width="4" height="10" rx="1" fill="#c5cad3" />
        {[
          [72, 132],
          [214, 132],
        ].map(([cx, cy], i) => (
          <g key={`wheel-${i}`}>
            <circle cx={cx} cy={cy} r="20" fill={`url(#${uid}-tire)`} />
            <circle cx={cx} cy={cy} r="12" fill={`url(#${uid}-rim)`} />
            <circle cx={cx} cy={cy} r="4" fill="#8a919c" />
            <path
              d={`M${cx - 18} ${cy - 2} Q${cx - 10} ${cy - 18} ${cx} ${cy - 14} Q${cx + 10} ${cy - 18} ${cx + 18} ${cy - 2}`}
              fill="none"
              stroke="rgba(10,10,18,0.08)"
              strokeWidth="3"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

function HospitalScene({ play = false }: { play?: boolean }) {
  return (
    <>
      <div className="journey-hospital">
        <motion.div
          className="journey-hospital__pulse"
          animate={play ? { opacity: [0.35, 0.75, 0.35] } : { opacity: 0.35 }}
          transition={{ duration: 1.4, repeat: play ? Infinity : 0 }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 320 64" preserveAspectRatio="none">
            <path
              d="M0 32 L48 32 L62 32 L74 14 L86 50 L98 32 L320 32"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </motion.div>
        <motion.div
          className="journey-hospital__building"
          initial={{ opacity: 0, y: 20 }}
          animate={play ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7 }}
        >
          <HospitalIcon />
        </motion.div>
      </div>
      <PhoneApp screen="history" size="sm" className="how-step__phone" />
    </>
  );
}

function HospitalIcon() {
  const uid = useId().replace(/:/g, '');

  return (
    <svg viewBox="0 0 280 232" className="journey-hospital__icon" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-front`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f4f5f8" />
          <stop offset="100%" stopColor="#e3e6ec" />
        </linearGradient>
        <linearGradient id={`${uid}-side`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d5d9e0" />
          <stop offset="100%" stopColor="#bcc2cc" />
        </linearGradient>
        <linearGradient id={`${uid}-roof`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8f9fb" />
          <stop offset="100%" stopColor="#cfd4dc" />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9ecff" />
          <stop offset="100%" stopColor="#a8c6e8" />
        </linearGradient>
        <linearGradient id={`${uid}-cross`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#942020" />
          <stop offset="100%" stopColor="#601212" />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#0a0a12" floodOpacity="0.14" />
        </filter>
      </defs>

      <ellipse cx="140" cy="214" rx="98" ry="11" fill="rgba(10, 10, 18, 0.08)" />

      <g filter={`url(#${uid}-shadow)`}>
        <path d="M188 72 L232 88 L232 188 L188 176 Z" fill={`url(#${uid}-side)`} />
        <path d="M188 72 L232 88 L232 96 L188 84 Z" fill="#c8ced8" />
        <rect x="68" y="48" width="120" height="140" rx="6" fill={`url(#${uid}-front)`} stroke="rgba(10,10,18,0.08)" />
        <rect x="68" y="48" width="120" height="10" rx="6" fill={`url(#${uid}-roof)`} />
        <rect x="34" y="118" width="48" height="70" rx="5" fill={`url(#${uid}-front)`} stroke="rgba(10,10,18,0.07)" />
        <path d="M34 118 L82 118 L82 126 L34 126 Z" fill={`url(#${uid}-roof)`} />
        <rect x="102" y="158" width="52" height="8" rx="2" fill="#d0d4dc" />
        <rect x="108" y="166" width="6" height="22" rx="1" fill="#b8bcc6" />
        <rect x="142" y="166" width="6" height="22" rx="1" fill="#b8bcc6" />
        <rect x="114" y="176" width="28" height="18" rx="2" fill={`url(#${uid}-glass)`} opacity="0.85" />
        {[
          [82, 72], [108, 72], [134, 72], [160, 72],
          [82, 96], [108, 96], [134, 96], [160, 96],
          [82, 120], [108, 120], [134, 120], [160, 120],
          [44, 132], [44, 152], [62, 132], [62, 152],
        ].map(([x, y], i) => (
          <rect
            key={`win-${i}`}
            x={x}
            y={y}
            width="18"
            height="14"
            rx="2"
            fill={`url(#${uid}-glass)`}
            opacity={i % 5 === 0 ? 0.55 : 0.82}
          />
        ))}
        <rect x="104" y="58" width="48" height="34" rx="5" fill={`url(#${uid}-cross)`} />
        <rect x="119" y="66" width="18" height="18" rx="2" fill="#ffffff" />
        <rect x="124" y="61" width="8" height="28" rx="1.5" fill="#ffffff" />
        <rect x="116" y="69" width="24" height="8" rx="1.5" fill="#ffffff" />
        <rect x="92" y="36" width="72" height="14" rx="7" fill={`url(#${uid}-cross)`} />
        <text x="128" y="46" textAnchor="middle" fill="#ffffff" fontSize="7.5" fontWeight="700" letterSpacing="0.08em">
          HOSPITAL
        </text>
        <rect x="198" y="156" width="28" height="32" rx="3" fill="#eceef3" stroke="rgba(10,10,18,0.08)" />
        <rect x="202" y="164" width="20" height="14" rx="2" fill={`url(#${uid}-glass)`} opacity="0.7" />
      </g>
    </svg>
  );
}
