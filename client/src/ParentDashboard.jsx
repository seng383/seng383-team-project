import { useEffect, useState } from 'react';
import { api } from './api.js';
import Avatar from './Avatar.jsx';
import PageLayout from './PageLayout.jsx';

const SPECIALIST_TYPES = {
  teacher: 'Öğretmen',
  psychologist: 'Psikolog',
  doctor: 'Doktor',
  special_education_teacher: 'Özel eğitim öğretmeni',
  coach: 'Koç',
};

const panelStyle = { flex: '1 1 280px', padding: 16, background: '#f2f2f2', border: '1px solid #999999', borderRadius: 8 };
const rowStyle = { padding: 12, marginBottom: 8, background: '#ffffff', border: '1px solid #999999', borderRadius: 4 };
const primaryButtonStyle = { padding: 8, color: '#ffffff', background: '#3b6ea5', border: 'none', borderRadius: 4, fontWeight: 'bold' };
const confirmStyle = { padding: 8, marginTop: 8, background: '#f2f2f2', border: '1px solid #999999', borderRadius: 4, fontSize: 13 };
const errorStyle = { color: '#b3261e' };

function ChildCard({ child }) {
  const [specialists, setSpecialists] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [linkNotice, setLinkNotice] = useState(null);
  const [linkError, setLinkError] = useState(null);
  // One change at a time: the answers to a link and an unlink that overlap could leave the list unlike the server's.
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [unlinkError, setUnlinkError] = useState(null);

  useEffect(() => {
    api(`/api/children/${child.id}/specialists`)
      .then(setSpecialists)
      .catch(() => setLoadFailed(true));
  }, [child.id]);

  async function handleLink(event) {
    event.preventDefault();
    setLinkNotice(null);
    setLinkError(null);
    setSaving(true);
    try {
      const linked = await api(`/api/children/${child.id}/specialists`, { method: 'POST', body: { email } });
      // The API answers a repeated link with the existing one, so only the list tells the two cases apart.
      if (specialists.some((specialist) => specialist.id === linked.id)) {
        setLinkNotice('Bu uzman zaten bağlı.');
      } else {
        setSpecialists([...specialists, linked]);
        setLinkNotice('Uzman bağlandı.');
      }
      setEmail('');
    } catch (err) {
      setLinkError(err.status === 400 ? 'Bu e-posta kayıtlı bir uzmana ait değil.' : 'Uzman eklenemedi. Lütfen tekrar deneyin.');
    }
    setSaving(false);
  }

  function askToUnlink(specialistId) {
    setUnlinkError(null);
    setConfirmingId(specialistId);
  }

  async function handleUnlink(specialistId) {
    setLinkNotice(null);
    setUnlinkError(null);
    setSaving(true);
    try {
      await api(`/api/children/${child.id}/specialists/${specialistId}`, { method: 'DELETE' });
      setSpecialists((list) => list.filter((specialist) => specialist.id !== specialistId));
      setConfirmingId(null);
    } catch {
      setUnlinkError('Bağlantı kaldırılamadı. Lütfen tekrar deneyin.');
    }
    setSaving(false);
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 18 }}>
        <Avatar name={child.name} />
        {child.name}
      </h2>

      {!specialists && !loadFailed && <p>Uzmanlar yükleniyor…</p>}
      {loadFailed && (
        <p role="alert" style={errorStyle}>
          Bağlı uzmanlar yüklenemedi.
        </p>
      )}
      {specialists && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={panelStyle}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Bağlı uzmanlar</h3>
            {specialists.length === 0 && <p>Henüz bağlı uzman yok.</p>}
            {specialists.map((specialist) => (
              <div key={specialist.id} data-testid="specialist" style={rowStyle}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong>{specialist.name}</strong>
                    <div style={{ fontSize: 13 }}>{SPECIALIST_TYPES[specialist.specialistType]}</div>
                  </div>
                  {confirmingId !== specialist.id && (
                    <button type="button" onClick={() => askToUnlink(specialist.id)}>
                      Bağlantıyı kaldır
                    </button>
                  )}
                </div>
                {confirmingId === specialist.id && (
                  <div style={confirmStyle}>
                    <strong>Bağlantı kaldırılsın mı?</strong>
                    <div>Uzman artık kayıtları göremez.</div>
                    {unlinkError && (
                      <p role="alert" style={errorStyle}>
                        {unlinkError}
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <button type="button" onClick={() => setConfirmingId(null)}>
                        Vazgeç
                      </button>
                      <button type="button" disabled={saving} onClick={() => handleUnlink(specialist.id)} style={primaryButtonStyle}>
                        Evet, kaldır
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleLink} style={panelStyle}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Uzman ekle</h3>
            <p style={{ fontSize: 13 }}>Kayıtlı bir uzmanı e-postasıyla bağlayın.</p>
            <label style={{ fontSize: 13, fontWeight: 'bold' }}>
              Uzmanın e-posta adresi
              <input
                type="email"
                required
                placeholder="uzman@ornek.test"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 4, marginBottom: 12 }}
              />
            </label>
            {linkError && (
              <p role="alert" style={errorStyle}>
                {linkError}
              </p>
            )}
            {linkNotice && <p role="status">{linkNotice}</p>}
            <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, width: '100%' }}>
              Uzman ekle
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

// Start screen of the parent: each child with the specialists who may see their records.
export default function ParentDashboard() {
  const [children, setChildren] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    api('/api/children')
      .then(setChildren)
      .catch(() => setLoadFailed(true));
  }, []);

  return (
    <PageLayout title="Ebeveyn paneli">
      {!children && !loadFailed && <p>Çocuklar yükleniyor…</p>}
      {loadFailed && (
        <p role="alert" style={errorStyle}>
          Çocuk bilgileri yüklenemedi.
        </p>
      )}
      {children && children.length === 0 && <p>Henüz kayıtlı çocuğunuz yok.</p>}
      {children && children.map((child) => <ChildCard key={child.id} child={child} />)}
    </PageLayout>
  );
}
