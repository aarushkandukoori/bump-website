import { motion } from 'framer-motion';
import { BumpDevice } from './BumpDevice';
import { PhoneApp } from './PhoneApp';
import './Section.css';

const fadeUp = {
  hidden: { opacity: 0, y: 48 },
  visible: { opacity: 1, y: 0 },
};

export function WhatIsBump() {
  return (
    <section className="section section--intro" id="about">
      <div className="section__inner section__inner--center">
        <motion.span
          className="section__label"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          transition={{ duration: 0.6 }}
        >
          What BUMP Is
        </motion.span>
        <motion.h2
          className="section__headline section__headline--large"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          A closed-loop emergency device for crashing bradycardia
        </motion.h2>
      </div>

      <div className="section__inner section__split">
        <motion.div
          className="section__visual"
          initial={{ opacity: 0, x: -60 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <div className="visual-combo">
            <BumpDevice variant="palm" className="bump-device-wrap--palm" />
            <PhoneApp screen="dashboard" size="sm" className="phone-app--floating" />
          </div>
        </motion.div>

        <motion.div
          className="section__text"
          initial={{ opacity: 0, x: 60 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          <span className="section__label">Wearable Protection</span>
          <h3 className="section__headline">
            Continuous monitoring, autonomous response
          </h3>
          <p className="section__body">
            BUMP (Bradycardia Urgent Management Pump) is a wearable, closed-loop
            emergency device for people at risk of crashing bradycardia — a
            sudden, dangerous drop in heart rate that can lead to fainting or
            cardiac arrest.
          </p>
          <p className="section__body">
            The device continuously monitors heart rate and, when it detects a
            dangerous drop, delivers a measured dose of medication while
            triggering visual, audible, and tactile alerts to summon help. It
            buys the patient critical time to reach professional care.
          </p>
          <p className="section__emphasis">
            This isn't just a monitor. It's an autonomous safeguard for the
            moments when care can't wait.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
