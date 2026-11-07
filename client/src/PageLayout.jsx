import { useAuth } from './AuthContext.jsx';

const ROLE_LABELS = { parent: 'Ebeveyn', specialist: 'Uzman', child: 'Çocuk' };

// Header of every logged-in screen: the user, their role and the logout button.
export default function PageLayout({ title, children }) {
  const { user, logout } = useAuth();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '32px auto', padding: '0 16px' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong>Çocuk Gelişim Platformu</strong>
        <span>
          {user.name} · {ROLE_LABELS[user.role]}{' '}
          <button type="button" onClick={logout}>
            Çıkış yap
          </button>
        </span>
      </header>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
