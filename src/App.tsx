import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { HomePage } from './pages/HomePage';

const DemoPage = lazy(() =>
  import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })),
);

const RlFdaPage = lazy(() =>
  import('./rlfda/pages/RlFdaPage').then((m) => ({ default: m.RlFdaPage })),
);

function DemoFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: '#5c5c6e',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      Loading demo…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/demo"
          element={
            <Suspense fallback={<DemoFallback />}>
              <DemoPage />
            </Suspense>
          }
        />
        <Route
          path="/demo/"
          element={
            <Suspense fallback={<DemoFallback />}>
              <DemoPage />
            </Suspense>
          }
        />
        {/*
          The regulatory-simulation programme. GitHub Pages serves paths
          case-sensitively, so the lower-case spelling is redirected rather
          than left to the catch-all, which would silently send a shared link
          back to the home page.
        */}
        {['/RL-FDA-Approval', '/RL-FDA-Approval/', '/RL-FDA-Approval/:section'].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<DemoFallback />}>
                <RlFdaPage />
              </Suspense>
            }
          />
        ))}
        <Route path="/rl-fda-approval" element={<Navigate to="/RL-FDA-Approval" replace />} />
        <Route path="/rl-fda-approval/*" element={<Navigate to="/RL-FDA-Approval" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
