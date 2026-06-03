import axios from 'axios';

// Evolution API axios instance
export const evolutionApi = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to set URL and API Key dynamically if stored in state/storage
evolutionApi.interceptors.request.use((config) => {
  const settingsStr = localStorage.getItem('crm_settings');
  if (settingsStr) {
    try {
      const settings = JSON.parse(settingsStr);
      if (settings.evolutionUrl) {
        config.baseURL = settings.evolutionUrl;
      }
      if (settings.apiKey) {
        config.headers['apikey'] = settings.apiKey;
      }
    } catch (e) {
      console.error('Failed to parse settings for Axios', e);
    }
  }
  return config;
});
