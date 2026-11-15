import { NavLink } from 'react-router-dom';

// The pages about one child for a parent or a specialist, in the order of the mockups. A module adds its page
// with one entry here and one route under /children/:childId in App.jsx.
export const CHILD_TABS = [{ label: 'Haftalık program', path: 'schedule' }];

const tabStyle = {
  padding: '8px 16px',
  color: '#333333',
  background: '#ffffff',
  border: '1px solid #999999',
  borderRadius: 4,
  fontSize: 13,
  textDecoration: 'none',
};
// The bar under the open page, as in the mockups; NavLink also marks it with aria-current="page".
const currentTabStyle = { ...tabStyle, fontWeight: 'bold', boxShadow: 'inset 0 -3px 0 #333333' };

export default function ChildTabs({ childId }) {
  return (
    <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {CHILD_TABS.map(({ label, path }) => (
        <NavLink
          key={path}
          to={`/children/${childId}/${path}`}
          style={({ isActive }) => (isActive ? currentTabStyle : tabStyle)}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
