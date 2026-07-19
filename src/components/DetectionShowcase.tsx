import { motion } from 'framer-motion';
import './DetectionShowcase.css';

const HIGHLIGHTS = [
  {
    value: '<250 ms',
    label: 'Sensor-to-alert latency budget',
  },
  {
    value: 'MIT-BIH',
    label: 'Real ECG replay at 360 Hz',
  },
  {
    value: 'Rate rule',
    label: 'Authoritative bradycardia gate',
  },
  {
    value: 'ONNX',
    label: 'Edge-style beat classification',
  },
] as const;

const GITHUB_URL = 'https://github.com/aarushkandukoori/bump-detection';
const DEMO_URL = 'https://demo.bump-labs.com';

export function DetectionShowcase() {
  return (
    <section className="detection-showcase" id="detection">
      <div className="detection-showcase__inner">
        <motion.div
          className="detection-showcase__header"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
        >
          <span className="section__label">Detection Layer</span>
          <h2 className="detection-showcase__headline">
            The software that decides when BUMP should act
          </h2>
          <p className="detection-showcase__lede">
            Between continuous monitoring and an atropine dose sits a real-time
            detection pipeline: stream ECG, find R-peaks, compute heart rate,
            and fire an alert only when bradycardia is sustained — the same
            decision logic a closed-loop wearable needs when seconds matter.
          </p>
        </motion.div>

        <motion.div
          className="detection-showcase__highlights"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, delay: 0.08 }}
        >
          {HIGHLIGHTS.map((item) => (
            <div key={item.value} className="detection-showcase__stat">
              <span className="detection-showcase__stat-value">{item.value}</span>
              <span className="detection-showcase__stat-label">{item.label}</span>
            </div>
          ))}
        </motion.div>

        <motion.div
          className="detection-showcase__footer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, delay: 0.12 }}
        >
          <p className="detection-showcase__note">
            Open engineering prototype — not a clinical product. Live dashboard,
            Redis Streams, TimescaleDB, and CI included.
          </p>
          <div className="detection-showcase__actions">
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="detection-showcase__link detection-showcase__link--primary"
            >
              Try the live demo
              <ExternalLinkIcon />
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="detection-showcase__link"
            >
              View pipeline on GitHub
              <ExternalLinkIcon />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 5h5v5M10 14L19 5M19 10v8a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
