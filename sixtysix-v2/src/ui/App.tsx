import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { CohortScreen } from './screens/CohortScreen';
import { RecordScreen } from './screens/RecordScreen';
import { ComposeScreen } from './screens/ComposeScreen';
import { MyScreen } from './screens/MyScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { useApp } from '../app/AppProvider';

/**
 * 하단 고정 UI 중복 금지 (V1 유지 목록).
 * StickyActionBar 를 쓰는 화면에서는 BottomNav 를 내린다.
 */
const BAR_ROUTES = ['/checkin', '/onboarding'];

export function App() {
  const { pathname } = useLocation();
  const { state } = useApp();
  const hasStickyBar = BAR_ROUTES.some((r) => pathname.startsWith(r));

  // 온보딩을 안 마쳤으면 거기서만 머문다
  if (!state.onboarded && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/cohort" element={<CohortScreen />} />
        <Route path="/record" element={<RecordScreen />} />
        <Route path="/checkin" element={<ComposeScreen />} />
        <Route path="/my" element={<MyScreen />} />
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {!hasStickyBar && <BottomNav />}
    </div>
  );
}
