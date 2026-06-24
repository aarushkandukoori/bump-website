import { motion } from 'framer-motion';
import { BumpDevice } from './BumpDevice';
import './Hero.css';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero__bg">
        <div className="hero__gradient" />
        <div className="hero__fibers" />
      </div>

      <div className="hero__inner">
        <motion.div
          className="hero__content"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="hero__headline">
            Emergency cardiac response, worn on the body.
          </h1>
          <p className="hero__sub">
            A wearable, closed-loop safeguard for people at risk of crashing
            bradycardia — continuous monitoring and autonomous response when
            seconds matter.
          </p>
        </motion.div>

        <div className="hero__visual">
          <BumpDevice variant="hero" className="bump-device-wrap--hero" />
        </div>
      </div>
    </section>
  );
}
