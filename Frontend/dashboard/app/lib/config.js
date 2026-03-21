const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  const runtimeConfigUrl = window.__APP_RUNTIME_CONFIG__?.API_BASE_URL;
  if (runtimeConfigUrl) {
    return runtimeConfigUrl;
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  const hostname = window.location.hostname;

  if (hostname === 'localhost') {
    return 'http://localhost:5010';
  }

  if (hostname === '192.168.0.51') {
    return 'http://192.168.0.51:5010';
  }

  return `http://${hostname}:5010`;
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
};

export default config;
