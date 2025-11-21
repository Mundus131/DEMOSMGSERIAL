const ping = require('ping');

/**
 * Formats bytes into a human-readable string.
 * @param {number} bytes - The number of bytes.
 * @returns {string} The formatted string.
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Decodes textual control sequences like <STX>, <ETX> into actual ASCII control characters.
 * @param {string} str - The input string with textual codes.
 * @returns {string} The converted string.
 */
const decodeControlSequences = (str) => {
  if (!str || typeof str !== 'string') return str;

  const map = {
    '<NUL>': '\x00',
    '<SOH>': '\x01',
    '<STX>': '\x02',
    '<ETX>': '\x03',
    '<EOT>': '\x04',
    '<ENQ>': '\x05',
    '<ACK>': '\x06',
    '<BEL>': '\x07',
    '<BS>':  '\x08',
    '<TAB>': '\x09',
    '<LF>':  '\x0A',
    '<VT>':  '\x0B',
    '<FF>':  '\x0C',
    '<CR>':  '\x0D',
    '<SO>':  '\x0E',
    '<SI>':  '\x0F',
    '<DLE>': '\x10',
    '<DC1>': '\x11',
    '<DC2>': '\x12',
    '<DC3>': '\x13',
    '<DC4>': '\x14',
    '<NAK>': '\x15',
    '<SYN>': '\x16',
    '<ETB>': '\x17',
    '<CAN>': '\x18',
    '<EM>':  '\x19',
    '<SUB>': '\x1A',
    '<ESC>': '\x1B',
    '<FS>':  '\x1C',
    '<GS>':  '\x1D',
    '<RS>':  '\x1E',
    '<US>':  '\x1F',
    '<DEL>': '\x7F'
  };

  return str.replace(/<[^>]+>/g, match => map[match] || match);
};

/**
 * Sets up utility endpoints for the Express app.
 * @param {Object} app - The Express application instance.
 */
const setup = (app) => {
  // Endpoint to ping an IP address
  app.get('/api/ping', async (req, res) => {
    const { ip } = req.query;

    if (!ip) {
      return res.status(400).json({ error: 'IP address must be provided as a query parameter.' });
    }

    try {
      const result = await ping.promise.probe(ip);
      if (result.alive) {
        res.json({ success: true, message: `IP address ${ip} is reachable`, result });
      } else {
        res.json({ success: false, message: `IP address ${ip} is unreachable`, result });
      }
    } catch (error) {
      res.status(500).json({ error: 'Error while pinging IP address', message: error.message });
    }
  });
};

module.exports = {
  setup,
  formatBytes,
  decodeControlSequences
};
