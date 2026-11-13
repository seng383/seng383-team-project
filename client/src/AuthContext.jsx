import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from './api.js';

export const START_PATHS = { parent: '/parent', specialist: '/specialist', child: '/child' };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // A stored token has to be checked with the API before any route can decide.
  const [loading, setLoading] = useState(() => getToken() !== null);

  function clearSession() {
    clearToken();
    setUser(null);
  }

  function loadUser() {
    api('/api/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    if (getToken()) loadUser();

    // The back/forward cache can bring back the page of an earlier session: since then the token may be
    // gone or belong to someone else, so nothing of the restored user is kept.
    function onPageShow(event) {
      if (!event.persisted) return;
      setUser(null);
      if (getToken()) {
        setLoading(true);
        loadUser();
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function login(email, password) {
    const { token, user: loggedIn } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    setUser(loggedIn);
  }

  async function logout() {
    // The session ends in this browser even when the server cannot be reached.
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearSession();
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
