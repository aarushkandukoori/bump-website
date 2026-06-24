import { Logo } from './Logo';
import './Footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <Logo height={56} showText={false} className="footer__logo" />
        <div className="footer__social">
          <a
            href="https://www.linkedin.com/company/bumpmed/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BUMP on LinkedIn"
            className="footer__social-link"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>
        <p className="footer__copy">
          &copy; {new Date().getFullYear()} BUMP Medical, Inc. All rights reserved.
        </p>
        <p className="footer__disclaimer">
          BUMP is an investigational device. It has not been evaluated or approved
          by the FDA or any other regulatory authority. Product design and
          specifications are subject to change. This website is for informational
          purposes only and does not constitute medical advice.
        </p>
      </div>
    </footer>
  );
}
