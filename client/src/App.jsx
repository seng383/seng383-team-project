import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, START_PATHS, useAuth } from './AuthContext.jsx';
import ChildTasksPage from './ChildTasksPage.jsx';
import LoginPage from './LoginPage.jsx';
import ParentDashboard from './ParentDashboard.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import SpecialistChildrenPage from './SpecialistChildrenPage.jsx';

function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p>Yükleniyor…</p>;
  }
  return <Navigate to={user ? START_PATHS[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path={START_PATHS.parent}
            element={
              <ProtectedRoute role="parent">
                <ParentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path={START_PATHS.specialist}
            element={
              <ProtectedRoute role="specialist">
                <SpecialistChildrenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path={START_PATHS.child}
            element={
              <ProtectedRoute role="child">
                <ChildTasksPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Home />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
