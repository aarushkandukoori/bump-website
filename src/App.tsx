import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { HomePage } from './pages/HomePage';

const DemoPage = lazy(() =>
  import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })),
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
