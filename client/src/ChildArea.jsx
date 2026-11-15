import { useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { api } from './api.js';
import { START_PATHS, useAuth } from './AuthContext.jsx';
import ChildTabs from './ChildTabs.jsx';
import PageLayout from './PageLayout.jsx';

const errorStyle = { color: '#b3261e' };

// Frame of the pages about one child (/children/:childId/...): the child's name, the tabs and the way back.
// A page opens only for a child in the user's own list, so a typed address of another child shows nothing of it;
// the API still checks the access on every request.
export default function ChildArea() {
  const { childId } = useParams();
  const { user } = useAuth();
  const [children, setChildren] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    api('/api/children')
      .then(setChildren)
      .catch((err) => setLoadError(err.status === 403 ? 'denied' : 'failed'));
  }, []);

  if (!children && !loadError) {
    return <p>Yükleniyor…</p>;
  }

  const backLink = <Link to={START_PATHS[user.role]}>Başlangıç ekranına dön</Link>;
  // Compared as text: like the API, the page does not read "02" or "2.0" as child 2.
  const child = children?.find((listed) => String(listed.id) === childId);

  if (loadError === 'failed') {
    return (
      <PageLayout title="Bir sorun oluştu">
        <p role="alert" style={errorStyle}>
          Çocuk bilgileri yüklenemedi.
        </p>
        {backLink}
      </PageLayout>
    );
  }
  if (!child) {
    return (
      <PageLayout title="Erişim engellendi">
        <p role="alert" style={errorStyle}>
          Bu çocuğa erişim izniniz yok.
        </p>
        {backLink}
      </PageLayout>
    );
  }
  return (
    <PageLayout title={child.name}>
      <p style={{ marginTop: 0 }}>{backLink}</p>
      <ChildTabs childId={child.id} />
      <Outlet />
    </PageLayout>
  );
}
