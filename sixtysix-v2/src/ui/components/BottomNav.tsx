import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/home',   label: '홈',     icon: 'M12 3 2 11h3v9h6v-6h2v6h6v-9h3z' },
  { to: '/cohort', label: '코호트', icon: 'M12 3 2 8l10 5 10-5zM2 12l10 5 10-5M2 16l10 5 10-5' },
  { to: '/record', label: '기록',   icon: 'M4 4h16v16H4zM8 2v4M16 2v4M4 9h16M9 14l2 2 4-4' },
  { to: '/my',     label: '마이',   icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="주요 화면">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className="bottom-nav__item">
          {({ isActive }) => (
            <>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav__icon"
                   fill={t.label === '코호트' || t.label === '기록' ? 'none' : 'currentColor'}
                   stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
                <path d={t.icon} />
              </svg>
              <span className={isActive ? 'bottom-nav__label is-active' : 'bottom-nav__label'}>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
