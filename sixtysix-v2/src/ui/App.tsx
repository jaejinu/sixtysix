import { Routes, Route, Navigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { CohortScreen } from './screens/CohortScreen';

export function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/cohort" element={<CohortScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
