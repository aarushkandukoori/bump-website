import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';
import './BumpDevice.css';

interface BumpDeviceProps {
  variant?: 'hero' | 'monitor' | 'detect' | 'respond' | 'alert' | 'palm';
  className?: string;
}

export function BumpDevice({ variant = 'hero', className = '' }: BumpDeviceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const isHero = variant === 'hero';
  const [introDone, setIntroDone] = useState(!isHero || !!prefersReducedMotion);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const rotateY = useTransform(scrollYProgress, [0, 0.5, 1], [-12, 0, 12]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [8, 0, -8]);
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  const isAlert = variant === 'alert';
  const isRespond = variant === 'respond';
  const isDetect = variant === 'detect';
  const isMonitor = variant === 'monitor';
  const isPalm = variant === 'palm';
  const playHeroIntro = isHero && !prefersReducedMotion;

  return (
    <motion.div
      ref={ref}
      className={`bump-device-wrap ${className}`}
      style={{ rotateY, rotateX, y }}
    >
      <motion.div
        className="bump-device-scene"
        initial={playHeroIntro ? { opacity: 0, scale: 0.52, rotateY: -58, rotateX: 24, y: 140 } : false}
        animate={playHeroIntro ? { opacity: 1, scale: 1, rotateY: 0, rotateX: 0, y: 0 } : undefined}
        transition={
          playHeroIntro
            ? { duration: 1.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }
            : undefined
        }
        onAnimationComplete={() => {
          if (playHeroIntro) setIntroDone(true);
        }}
      >
        {playHeroIntro && (
          <motion.div
            className="bump-device__intro-glow"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: [0, 0.7, 0.3], scale: [0.75, 1.45, 1.15] }}
            transition={{ duration: 2, delay: 0.35, ease: 'easeOut' }}
            aria-hidden="true"
          />
        )}

        {playHeroIntro && (
          <motion.div
            className="bump-device__intro-ring"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: [0, 0.55, 0], scale: [0.85, 1.35, 1.5] }}
            transition={{ duration: 1.4, delay: 0.55, ease: 'easeOut' }}
            aria-hidden="true"
          />
        )}

        {isPalm && (
          <div className="bump-palm">
            <div className="bump-palm__hand" />
          </div>
        )}

        <motion.div
          className={`bump-device ${isAlert ? 'bump-device--alert' : ''} ${isRespond ? 'bump-device--respond' : ''} ${isDetect ? 'bump-device--detect' : ''}`}
          animate={introDone ? { y: [0, -6, 0] } : { y: 0 }}
          transition={{
            duration: 4,
            repeat: introDone ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <div className="bump-device__shell">
            <motion.div
              className="bump-device__screen"
              initial={playHeroIntro ? { opacity: 0.12, scale: 0.92 } : false}
              animate={playHeroIntro ? { opacity: 1, scale: 1 } : undefined}
              transition={{ delay: 0.85, duration: 0.65, ease: 'easeOut' }}
            >
              <div className="bump-device__display">
                {isMonitor && <HeartRateDisplay bpm={72} />}
                {isDetect && <HeartRateDisplay bpm={38} warning />}
                {isRespond && <DoseIndicator />}
                {isAlert && <AlertDisplay />}
                {(variant === 'hero' || variant === 'palm') && (
                  <IdleDisplay intro={playHeroIntro} />
                )}
              </div>
              {playHeroIntro && (
                <motion.div
                  className="bump-device__scan-line"
                  initial={{ top: '0%', opacity: 0.8 }}
                  animate={{ top: '100%', opacity: 0 }}
                  transition={{ delay: 0.9, duration: 0.55, ease: 'easeInOut' }}
                  aria-hidden="true"
                />
              )}
            </motion.div>
          </div>

          {isAlert && (
            <>
              <motion.div
                className="bump-device__ring"
                animate={{ scale: [1, 2.2], opacity: [0.45, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="bump-device__ring"
                animate={{ scale: [1, 2.2], opacity: [0.45, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
              />
            </>
          )}
        </motion.div>

        <motion.div
          className="bump-device__shadow"
          initial={playHeroIntro ? { opacity: 0, scaleX: 0.25 } : false}
          animate={playHeroIntro ? { opacity: 1, scaleX: 1 } : undefined}
          transition={{ delay: 0.65, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>
    </motion.div>
  );
}

function IdleDisplay({ intro = false }: { intro?: boolean }) {
  return (
    <motion.div
      className="bump-display bump-display--idle"
      initial={intro ? { opacity: 0, y: 8 } : false}
      animate={intro ? { opacity: 1, y: 0 } : undefined}
      transition={intro ? { delay: 1.05, duration: 0.55, ease: [0.22, 1, 0.36, 1] } : undefined}
    >
      <motion.div
        className="bump-display__heart"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: intro ? 1.2 : 0 }}
      >
        ♥
      </motion.div>
      <span className="bump-display__bpm">72</span>
      <span className="bump-display__label">BPM</span>
    </motion.div>
  );
}

function HeartRateDisplay({ bpm, warning = false }: { bpm: number; warning?: boolean }) {
  return (
    <div className={`bump-display ${warning ? 'bump-display--warning' : ''}`}>
      <svg className="bump-display__ecg" viewBox="0 0 120 40">
        <motion.path
          d="M0 20 L20 20 L25 20 L30 8 L35 32 L40 20 L120 20"
          fill="none"
          stroke={warning ? '#ff4444' : 'var(--accent)'}
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </svg>
      <motion.span
        className="bump-display__bpm"
        animate={warning ? { color: ['#ff4444', '#ff8888', '#ff4444'] } : {}}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        {bpm}
      </motion.span>
      <span className="bump-display__label">BPM</span>
    </div>
  );
}

function DoseIndicator() {
  return (
    <div className="bump-display bump-display--dose">
      <motion.div
        className="bump-display__dose-bar"
        initial={{ width: '0%' }}
        animate={{ width: '75%' }}
        transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }}
      />
      <span className="bump-display__label">DOSE</span>
    </div>
  );
}

function AlertDisplay() {
  return (
    <motion.div
      className="bump-display bump-display--alert"
      animate={{ opacity: [1, 0.5, 1] }}
      transition={{ duration: 0.5, repeat: Infinity }}
    >
      <span className="bump-display__alert-text">ALERT</span>
    </motion.div>
  );
}
