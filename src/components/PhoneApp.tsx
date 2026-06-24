import { motion } from 'framer-motion';
import { useId, useRef } from 'react';
import { LOGO_SRC } from './Logo';
import './PhoneApp.css';

type AppScreen = 'dashboard' | 'alert' | 'history' | 'status';

type PhoneSize = 'sm' | 'md' | 'lg';

interface PhoneAppProps {
  screen?: AppScreen;
  size?: PhoneSize;
  className?: string;
}

export function PhoneApp({ screen = 'dashboard', size = 'md', className = '' }: PhoneAppProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className={`phone-app phone-app--${size} ${className}`}>
      <div className="phone-app__device">
        <div className="phone-app__side-btn phone-app__side-btn--silent" />
        <div className="phone-app__side-btn phone-app__side-btn--vol-up" />
        <div className="phone-app__side-btn phone-app__side-btn--vol-down" />
        <div className="phone-app__side-btn phone-app__side-btn--power" />

        <div className="phone-app__frame">
          <div className="phone-app__screen">
            <div className="phone-app__ui">
              <div className="phone-app__content">
                {screen === 'dashboard' && <DashboardScreen compact={size === 'sm'} />}
                {screen === 'alert' && <AlertScreen compact={size === 'sm'} />}
                {screen === 'history' && <HistoryScreen compact={size === 'sm'} />}
                {screen === 'status' && <StatusScreen compact={size === 'sm'} />}
              </div>
              <DynamicIsland />
              {screen === 'dashboard' && <TabBar active="home" />}
              {screen === 'history' && <TabBar active="history" />}
              {screen === 'status' && <TabBar active="monitor" />}
            </div>
          </div>
        </div>
      </div>
      <div className="phone-app__shadow" />
      <div className="phone-app__shadow phone-app__shadow--ambient" />
    </div>
  );
}

function DynamicIsland() {
  return (
    <div className="ios-dynamic-island" aria-hidden="true">
      <div className="ios-dynamic-island__cam" />
    </div>
  );
}

function TabBar({ active }: { active: 'home' | 'history' | 'monitor' }) {
  const tabs = [
    { id: 'home' as const, label: 'Home', icon: HomeIcon },
    { id: 'monitor' as const, label: 'Monitor', icon: HeartIcon },
    { id: 'history' as const, label: 'History', icon: ClockIcon },
  ];

  return (
    <div className="ios-tab-bar">
      <div className="ios-tab-bar__items">
        {tabs.map((tab) => (
          <div key={tab.id} className={`ios-tab-bar__item ${active === tab.id ? 'ios-tab-bar__item--active' : ''}`}>
            <tab.icon />
            <span>{tab.label}</span>
          </div>
        ))}
      </div>
      <div className="ios-tab-bar__indicator" aria-hidden="true" />
    </div>
  );
}

function DashboardScreen({ compact = false }: { compact?: boolean }) {
  const ecgId = useId();

  return (
    <div className="app-screen app-screen--dashboard">
      <header className="app-nav">
        <img src={LOGO_SRC} alt="BUMP" className="app-nav__logo" />
        <div className="app-nav__badge">
          <span className="app-nav__badge-dot" />
          Device connected
        </div>
      </header>

      <div className="app-hero-card">
        <div className="app-hero-card__top">
          <span className="app-hero-card__label">Heart Rate</span>
          <span className="app-hero-card__status app-hero-card__status--normal">Normal</span>
        </div>
        <div className="app-hero-card__value-row">
          <motion.span
            className="app-hero-card__value"
            animate={{ opacity: [1, 0.88, 1] }}
            transition={{ duration: 1.15, repeat: Infinity }}
          >
            72
          </motion.span>
          <span className="app-hero-card__unit">bpm</span>
        </div>
        <div className="app-ecg-wrap">
          <svg className="app-ecg" viewBox="0 0 400 80" aria-hidden="true">
            <defs>
              <linearGradient id={ecgId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
                <stop offset="15%" stopColor="var(--accent)" stopOpacity="1" />
                <stop offset="85%" stopColor="var(--accent)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="40" x2="400" y2="40" stroke="rgba(122,24,24,0.08)" strokeWidth="1" />
            <motion.g
              animate={{ x: [-120, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <path
                d="M0 40 H60 L68 40 L74 14 L80 66 L86 40 H104 L112 40 L118 24 L124 56 L130 40 H160 L168 40 L174 14 L180 66 L186 40 H220 L228 40 L234 24 L240 56 L246 40 H400"
                fill="none"
                stroke={`url(#${ecgId})`}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.g>
          </svg>
        </div>
        <div className="app-hero-card__meta">
          <span>Resting</span>
          <span>Updated just now</span>
        </div>
      </div>

      <div className="app-stat-grid">
        <div className="app-stat-card">
          <div className="app-stat-card__icon app-stat-card__icon--dose">
            <DoseIcon />
          </div>
          <div className="app-stat-card__content">
            <span className="app-stat-card__label">Doses today</span>
            <span className="app-stat-card__value">0</span>
          </div>
        </div>
        <div className="app-stat-card">
          <div className="app-stat-card__icon app-stat-card__icon--battery">
            <BatteryIcon level={94} />
          </div>
          <div className="app-stat-card__content">
            <span className="app-stat-card__label">Battery</span>
            <span className="app-stat-card__value">94%</span>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="app-device-card">
          <div className="app-device-card__icon">
            <DeviceIcon />
          </div>
          <div className="app-device-card__text">
            <span className="app-device-card__title">BUMP Device</span>
            <span className="app-device-card__sub">Worn · Signal strong</span>
          </div>
          <ChevronIcon />
        </div>
      )}
    </div>
  );
}

function AlertScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="app-screen app-screen--alert">
      <div className="app-alert-sheet">
        <motion.div
          className="app-alert-sheet__icon"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          <AlertIcon />
        </motion.div>
        <h3 className="app-alert-sheet__title">Bradycardia Detected</h3>
        <p className="app-alert-sheet__body">
          {compact
            ? 'Medication administered. Emergency contacts notified.'
            : 'A dangerous heart-rate drop was detected. Medication has been administered and your emergency contacts have been notified.'}
        </p>
        {!compact && (
          <div className="app-alert-sheet__stats">
            <div><span>Heart rate</span><strong>38 bpm</strong></div>
            <div><span>Response</span><strong>Delivered</strong></div>
          </div>
        )}
        <motion.button
          className="app-alert-sheet__cta"
          animate={{ boxShadow: ['0 4px 20px rgba(122,24,24,0.25)', '0 4px 32px rgba(122,24,24,0.45)', '0 4px 20px rgba(122,24,24,0.25)'] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          Call Emergency Contact
        </motion.button>
        <button type="button" className="app-alert-sheet__secondary">View event details</button>
      </div>
    </div>
  );
}

function HistoryScreen({ compact = false }: { compact?: boolean }) {
  const events = compact
    ? [
        { time: '2:34 PM', title: 'Heart rate stable', sub: '72 bpm', type: 'ok' as const },
        { time: '9:45 AM', title: 'Device synced', sub: 'Up to date', type: 'info' as const },
      ]
    : [
        { time: '2:34 PM', title: 'Heart rate stable', sub: '72 bpm · Normal range', type: 'ok' as const },
        { time: '1:12 PM', title: 'Routine check passed', sub: 'Continuous monitoring active', type: 'ok' as const },
        { time: '9:45 AM', title: 'Device synced', sub: 'Firmware up to date', type: 'info' as const },
      ];

  return (
    <div className="app-screen app-screen--history">
      <h2 className="app-screen-heading">Event Log</h2>
      <p className="app-screen-sub">Last 7 days</p>
      <div className="app-event-list">
        {events.map((e, i) => (
          <motion.div
            key={e.title}
            className={`app-event-row app-event-row--${e.type}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className={`app-event-row__dot app-event-row__dot--${e.type}`} />
            <div className="app-event-row__content">
              <div className="app-event-row__top">
                <span className="app-event-row__title">{e.title}</span>
                <span className="app-event-row__time">{e.time}</span>
              </div>
              <span className="app-event-row__sub">{e.sub}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function StatusScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="app-screen app-screen--status">
      {!compact && <h2 className="app-screen-heading">Live Monitor</h2>}
      <div className="app-monitor-ring">
        <svg viewBox="0 0 120 120" className="app-monitor-ring__svg" aria-hidden="true">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#ebebed" strokeWidth="8" />
          <motion.circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="314"
            animate={{ strokeDashoffset: [78, 55, 78] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="app-monitor-ring__center">
          <motion.span
            className="app-monitor-ring__bpm"
            animate={{ opacity: [1, 0.85, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            72
          </motion.span>
          <span className="app-monitor-ring__unit">bpm</span>
        </div>
      </div>
      <div className="app-monitor-pills">
        <span className="app-monitor-pill app-monitor-pill--active">Monitoring</span>
        <span className="app-monitor-pill">On body</span>
      </div>
      <p className="app-monitor-note">Last sync · 2 sec ago</p>
    </div>
  );
}

/* ── Icons ── */
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 20.5l-1.2-1.1C5.4 14.8 2 11.6 2 7.9 2 5 4.2 2.8 7 2.8c1.7 0 3.3.8 4.3 2.1.9-1.3 2.6-2.1 4.3-2.1 2.8 0 5 2.2 5 5.1 0 3.7-3.4 6.9-8.8 11.5L12 20.5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function DoseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="8" y="2" width="8" height="14" rx="4" />
      <path d="M12 16v4M9 20h6" strokeLinecap="round" />
    </svg>
  );
}

function BatteryIcon({ level }: { level: number }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" stroke="currentColor" strokeWidth="1" />
      <rect x="2.5" y="2.5" width={(14 * level) / 100} height="7" rx="1" fill="currentColor" />
      <path d="M20 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="4" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="rgba(255,69,58,0.12)" stroke="#ff453a" strokeWidth="1.5" />
      <path d="M12 8v5M12 15.5h.01" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
