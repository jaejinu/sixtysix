export function AppHeader({ title, sub }: { title?: string; sub?: string }) {
  return (
    <header className="app-header">
      {title ? (
        <div className="app-header__stack">
          <p className="app-header__title">{title}</p>
          {sub ? <p className="app-header__sub">{sub}</p> : null}
        </div>
      ) : (
        <div className="app-header__brand">
          <img src="/brand/logo-mark.svg" alt="" width={22} height={20} />
          <span className="app-header__logo">육십육</span>
        </div>
      )}
    </header>
  );
}
