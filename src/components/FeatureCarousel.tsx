import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BumpDevice } from './BumpDevice';
import { PhoneApp } from './PhoneApp';
import './FeatureCarousel.css';

type CardTheme = 'dark' | 'light';

interface FeatureCard {
  id: string;
  label: string;
  headline: string;
  theme: CardTheme;
  visual: 'monitor' | 'detect' | 'respond' | 'app' | 'alert';
}

const cards: FeatureCard[] = [
  {
    id: 'detect',
    label: 'Real-Time Detection',
    headline: 'Catch crises\nbefore they cascade.',
    theme: 'dark',
    visual: 'detect',
  },
  {
    id: 'respond',
    label: 'Autonomous Response',
    headline: 'Act in seconds,\nnot minutes.',
    theme: 'light',
    visual: 'respond',
  },
  {
    id: 'monitor',
    label: 'Continuous Monitoring',
    headline: 'Always on.\nAlways watching.',
    theme: 'dark',
    visual: 'monitor',
  },
  {
    id: 'app',
    label: 'Companion App',
    headline: 'Your heart,\non your phone.',
    theme: 'light',
    visual: 'app',
  },
  {
    id: 'alert',
    label: 'Multi-Channel Alerts',
    headline: 'Impossible\nto ignore.',
    theme: 'dark',
    visual: 'alert',
  },
];

export function FeatureCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanScrollLeft(scrollLeft > 8);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 8);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateScrollState();
    track.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    const onWheel = (event: WheelEvent) => {
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);

      // Vertical two-finger scroll should move the page, not the carousel.
      if (absY > absX) return;

      if (absX > 0) {
        event.preventDefault();
        track.scrollLeft += event.deltaX;
      }
    };

    track.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      track.removeEventListener('scroll', updateScrollState);
      track.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  const scroll = (direction: 'left' | 'right') => {
    const track = trackRef.current;
    if (!track) return;

    const card = track.querySelector<HTMLElement>('.feature-card');
    const gap = 20;
    const amount = card ? card.offsetWidth + gap : track.clientWidth * 0.85;

    track.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="feature-carousel" id="features" aria-labelledby="feature-carousel-title">
      <div className="feature-carousel__container">
        <div className="feature-carousel__header">
          <motion.h2
            id="feature-carousel-title"
            className="feature-carousel__title"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
          >
            Get to know BUMP.
          </motion.h2>
        </div>

        <div className="feature-carousel__track-shell">
          <div
            ref={trackRef}
            className="feature-carousel__track"
            role="region"
            aria-label="BUMP features"
          >
            {cards.map((card, i) => (
              <motion.article
                key={card.id}
                className={`feature-card feature-card--${card.theme}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, delay: i * 0.06 }}
              >
                <div className="feature-card__copy">
                  <span className="feature-card__label">{card.label}</span>
                  <h3 className="feature-card__headline">
                    {card.headline.split('\n').map((line, lineIndex, lines) => (
                      <span key={lineIndex}>
                        {line}
                        {lineIndex < lines.length - 1 && <br />}
                      </span>
                    ))}
                  </h3>
                </div>

                <div className={`feature-card__visual feature-card__visual--${card.visual}`}>
                  <CardVisual type={card.visual} />
                </div>
              </motion.article>
            ))}
          </div>
        </div>

        <div className="feature-carousel__footer">
          <div className="feature-carousel__nav">
            <button
              type="button"
              className="feature-carousel__nav-btn"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label="Previous feature"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              className="feature-carousel__nav-btn"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              aria-label="Next feature"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CardVisual({ type }: { type: FeatureCard['visual'] }) {
  switch (type) {
    case 'monitor':
      return (
        <>
          <div className="feature-card__glow feature-card__glow--red" />
          <BumpDevice variant="monitor" className="feature-card__device" />
        </>
      );
    case 'detect':
      return (
        <>
          <div className="feature-card__glow feature-card__glow--alert" />
          <BumpDevice variant="detect" className="feature-card__device" />
          <PhoneApp screen="dashboard" size="sm" className="feature-card__phone" />
        </>
      );
    case 'respond':
      return (
        <>
          <div className="feature-card__glow feature-card__glow--warm" />
          <BumpDevice variant="respond" className="feature-card__device" />
        </>
      );
    case 'app':
      return (
        <>
          <div className="feature-card__glow feature-card__glow--soft" />
          <PhoneApp screen="dashboard" size="md" className="feature-card__phone feature-card__phone--solo" />
        </>
      );
    case 'alert':
      return (
        <>
          <div className="feature-card__glow feature-card__glow--pulse" />
          <BumpDevice variant="alert" className="feature-card__device" />
          <PhoneApp screen="alert" size="sm" className="feature-card__phone" />
        </>
      );
  }
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M9 2L4 7L9 12' : 'M5 2L10 7L5 12'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
