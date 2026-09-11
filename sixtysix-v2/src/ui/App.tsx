import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { CohortScreen } from './screens/CohortScreen';
import { RecordScreen } from './screens/RecordScreen';
import { ComposeScreen } from './screens/ComposeScreen';

/**
 * 하단 고정 UI 중복 금지 (V1 유지 목록).
 * StickyActionBar 를 쓰는 화면에서는 BottomNav 를 내린다.
 */
const BAR_ROUTES = ['/checkin'];

export function App() {
  const { pathname } = useLocation();
  const hasStickyBar = BAR_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/cohort" element={<CohortScreen />} />
        <Route path="/record" element={<RecordScreen />} />
        <Route path="/checkin" element={<ComposeScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {!hasStickyBar && <BottomNav />}
    </div>
  );
}
