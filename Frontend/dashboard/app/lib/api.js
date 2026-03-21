export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';

  const runtimeConfigUrl = window.__APP_RUNTIME_CONFIG__?.API_BASE_URL;
  if (runtimeConfigUrl) return runtimeConfigUrl;

  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envUrl) return envUrl;

  const hostname = window.location.hostname;

  if (hostname === 'localhost') return 'http://localhost:5010';
  if (hostname === '192.168.0.51') return 'http://192.168.0.51:5010';
  if (hostname === '192.168.0.100') return 'http://192.168.0.100:18080/proxy/5010';

  return `http://${hostname}:5010`;
};

export const API_BASE_URL = getApiBaseUrl();

export const fetchJson = async (path, init) => {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  return response.json();
};

export const formatError = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return error.message || 'Unknown error';
};
