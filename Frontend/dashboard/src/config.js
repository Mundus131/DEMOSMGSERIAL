const getApiBaseUrl = () => {
  const hostname = window.location.hostname;

  if (hostname === 'localhost') {
    return 'http://localhost:5010';
  }

  if (hostname === '192.168.0.51') {
    return 'http://192.168.0.51:5010';
  }

  // domyślny fallback (np. na produkcji)
  return `http://${hostname}:5010`;
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
};

export default config;