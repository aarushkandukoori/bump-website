import { motion } from 'framer-motion';
import { BumpDevice } from './BumpDevice';
import './Section.css';

export function CompanionApp() {
  return (
    <section className="section" id="app">
      <div className="section__inner section__split">
        <motion.div
          className="section__visual"
          initial={{ opacity: 0, x: -60 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <BumpDevice variant="monitor" />
        </motion.div>

        <motion.div
          className="section__text"
          initial={{ opacity: 0, x: 60 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          <span className="section__label">Companion App</span>
          <h2 className="section__headline">
            Real-time visibility, wherever you are
          </h2>
          <p className="section__body">
            The BUMP companion app pairs seamlessly with your device, giving
            you and your care team continuous insight into heart rate trends,
            device status, and event history.
          </p>
          <p className="section__body">
            When an event occurs, the app instantly notifies emergency contacts
            with location and status — so help arrives faster, even when you're
            alone.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
