const net = require('net');

function isValidHost(host) {
  const value = String(host || '').trim();
  if (!value) return false;
  if (value === 'localhost') return true;
  if (net.isIP(value)) return true;
  return /^[a-zA-Z0-9.-]+$/.test(value) && !value.endsWith('.') && !value.startsWith('.');
}

module.exports = {
  isValidHost,
};
