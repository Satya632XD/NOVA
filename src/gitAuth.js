const AUTH_STORAGE_KEY = 'nova_github_auth';

export const GitAuth = {
  getCredentials() {
    try {
      const data = localStorage.getItem(AUTH_STORAGE_KEY);
      return data ? JSON.parse(data) : { token: '', name: 'NOVA Mobile User', email: 'user@nova.local' };
    } catch {
      return { token: '', name: 'NOVA Mobile User', email: 'user@nova.local' };
    }
  },

  setCredentials(credentials) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      token: credentials.token?.trim() || '',
      name: credentials.name?.trim() || 'NOVA Mobile User',
      email: credentials.email?.trim() || 'user@nova.local'
    }));
  },

  hasToken() {
    const creds = this.getCredentials();
    return Boolean(creds.token && creds.token.length > 0);
  },

  getAuthor() {
    const { name, email } = this.getCredentials();
    return { name, email };
  },

  // Auth callback for isomorphic-git HTTP operations
  getAuthCallback() {
    const creds = this.getCredentials();
    return () => ({
      username: creds.token, // GitHub Personal Access Token acts as username/token
      password: ''
    });
  }
};
