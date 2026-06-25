import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { RESEARCH_POSTER } from '../lib/assets';
import './Research.css';

export function Research() {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    if (!lightboxOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lightboxOpen, closeLightbox]);

  return (
    <>
      <section className="research" id="research">
        <div className="research__inner">
          <motion.div
            className="research__header"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
          >
            <span className="section__label">Research</span>
            <h2 className="research__headline">
              Prototype validation and dosing accuracy
            </h2>
            <p className="research__lede">
              Early bench testing of BUMP&apos;s closed-loop sensing and atropine
              delivery reached 92.77% dosing accuracy across controlled trials.
            </p>
          </motion.div>

          <motion.div
            className="research__poster-wrap"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <button
              type="button"
              className="research__poster-button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Expand research poster"
            >
              <img
                src={RESEARCH_POSTER.src}
                alt={RESEARCH_POSTER.alt}
                className="research__poster"
                loading="lazy"
              />
              <span className="research__poster-hint">Click to enlarge</span>
            </button>

            <div className="research__meta">
              <p className="research__poster-title">{RESEARCH_POSTER.title}</p>
              <a
                href={RESEARCH_POSTER.peerefUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="research__peeref-link"
              >
                View on Peeref
                <ExternalLinkIcon />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {lightboxOpen && (
        <div
          className="research-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Research poster"
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="research-lightbox__close"
            onClick={closeLightbox}
            aria-label="Close poster"
          >
            &times;
          </button>
          <img
            src={RESEARCH_POSTER.src}
            alt={RESEARCH_POSTER.alt}
            className="research-lightbox__image"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
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
