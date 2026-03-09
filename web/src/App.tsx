import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Traces from './pages/Traces';
import TraceDetail from './pages/TraceDetail';
import Logs from './pages/Logs';
import SettingsPage from './pages/Settings';
import NotFoundPage from './pages/NotFound';
import AppLayout from './components/AppLayout';

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
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
