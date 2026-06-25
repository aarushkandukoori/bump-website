import { motion } from 'framer-motion';
import { PROVISIONAL_PATENT } from '../lib/assets';
import './PatentNotice.css';

interface PatentNoticeProps {
  variant?: 'card' | 'badge';
}

export function PatentNotice({ variant = 'card' }: PatentNoticeProps) {
  if (variant === 'badge') {
    return (
      <a
        href={PROVISIONAL_PATENT.href}
        target="_blank"
        rel="noopener noreferrer"
        className="patent-badge"
      >
        <span className="patent-badge__dot" aria-hidden="true" />
        Patent pending · U.S. Application No. {PROVISIONAL_PATENT.applicationNumber}
      </a>
    );
  }

  return (
    <motion.aside
      className="patent-card"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: 0.2 }}
      aria-label="Intellectual property"
    >
      <div className="patent-card__icon" aria-hidden="true">
        <DocumentIcon />
      </div>
      <div className="patent-card__content">
        <span className="patent-card__label">Intellectual Property</span>
        <p className="patent-card__text">
          BUMP&apos;s closed-loop cardiac response system is covered by a filed{' '}
          {PROVISIONAL_PATENT.title.toLowerCase()} (No.{' '}
          {PROVISIONAL_PATENT.applicationNumber}).
        </p>
        <a
          href={PROVISIONAL_PATENT.href}
          target="_blank"
          rel="noopener noreferrer"
          className="patent-card__link"
        >
          View provisional application
          <ExternalLinkIcon />
        </a>
      </div>
    </motion.aside>
  );
}

function DocumentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M8 3h7l5 5v13a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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
