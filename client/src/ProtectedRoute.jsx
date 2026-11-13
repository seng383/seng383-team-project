import { Link, Navigate } from 'react-router-dom';
import { START_PATHS, useAuth } from './AuthContext.jsx';
import PageLayout from './PageLayout.jsx';

// Only decides what to show: the API checks the token and the role again on every request.
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p>Yükleniyor…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return (
      <PageLayout title="Erişim engellendi">
        <p role="alert">Bu sayfaya erişim izniniz yok.</p>
        <Link to={START_PATHS[user.role]}>Başlangıç ekranına dön</Link>
      </PageLayout>
    );
  }
  return children;
}
