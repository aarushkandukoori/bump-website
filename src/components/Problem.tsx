import { motion } from 'framer-motion';
import { PhoneApp } from './PhoneApp';
import './Section.css';

export function Problem() {
  return (
    <section className="section section--alt" id="problem">
      <div className="section__inner section__split section__split--reverse">
        <motion.div
          className="section__text"
          initial={{ opacity: 0, x: -60 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <span className="section__label">The Problem</span>
          <h2 className="section__headline">
            When heart rate crashes, every second counts
          </h2>
          <p className="section__body">
            Crashing bradycardia is time-critical. Treatment normally requires
            being in a clinical setting with a professional administering
            medication. Patients in remote areas, while traveling, or alone may
            not reach care in time.
          </p>
          <p className="section__body">
            BUMP is a continuous, autonomous safeguard for that window — worn on
            the body, always watching, ready to act before it's too late.
          </p>
        </motion.div>

        <motion.div
          className="section__visual"
          initial={{ opacity: 0, x: 60 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          <PhoneApp screen="alert" size="md" />
        </motion.div>
      </div>
    </section>
  );
}
