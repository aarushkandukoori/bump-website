import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import './Header.css';

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="header__inner">
        <a href="#" aria-label="BUMP home">
          <Logo height={56} showText={false} className="header__logo" />
        </a>
        <a href="#contact" className="header__cta">
          Get in Touch
        </a>
      </div>
    </header>
  );
}
