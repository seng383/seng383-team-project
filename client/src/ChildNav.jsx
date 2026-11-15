import { NavLink } from 'react-router-dom';
import { START_PATHS } from './AuthContext.jsx';

function linkStyle({ isActive }) {
  return { color: '#333333', fontWeight: isActive ? 'bold' : 'normal' };
}

// The two screens of a child. `end` keeps "Görevlerim" from also counting as open on /child/schedule.
export default function ChildNav() {
  return (
    <nav style={{ marginBottom: 16 }}>
      <NavLink to={START_PATHS.child} end style={linkStyle}>
        Görevlerim
      </NavLink>
      {' · '}
      <NavLink to="/child/schedule" style={linkStyle}>
        Takvimim
      </NavLink>
    </nav>
  );
}
