import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Traces = lazy(() => import('./pages/Traces'));
const TraceDetail = lazy(() => import('./pages/TraceDetail'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'));
const Logs = lazy(() => import('./pages/Logs'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function App() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400">Loading...</div></div>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/services/:serviceName" element={<ServiceDetail />} />
        <Route path="/traces" element={<Traces />} />
        <Route path="/traces/:traceId" element={<TraceDetail />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
