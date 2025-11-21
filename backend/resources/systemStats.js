const os = require('os');
const fs = require('fs');
const diskusage = require('diskusage');

/**
 * Formats uptime in seconds into a human-readable string.
 * @param {number} seconds - The uptime in seconds.
 * @returns {string} The formatted uptime string.
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / (3600 * 24));
  seconds %= 3600 * 24;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

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
 * Sets up the system statistics endpoint for the Express app.
 * @param {Object} app - The Express application instance.
 */
const setup = (app) => {
  app.get('/system-stats', async (req, res) => {
    try {
      const networkInterfaces = os.networkInterfaces();
      const networkData = {};

      Object.entries(networkInterfaces).forEach(([name, ifaces]) => {
        networkData[name] = {
          internal: ifaces[0].internal,
          addresses: ifaces.map(i => i.address),
          rx_bytes: 0,
          tx_bytes: 0
        };

        if (os.platform() === 'linux') {
          try {
            const devData = fs.readFileSync('/proc/net/dev', 'utf8');
            const lines = devData.split('\n');

            for (const line of lines) {
              if (line.includes(name + ':')) {
                const stats = line.trim().split(/\s+/);
                networkData[name].rx_bytes = parseInt(stats[1]);
                networkData[name].tx_bytes = parseInt(stats[9]);
                break;
              }
            }
          } catch (err) {
            console.error('Error reading network stats:', err);
          }
        }
      });

      const cpus = os.cpus();
      const cpuUsage = cpus.map(cpu => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const usage = 100 - (cpu.times.idle * 100 / total);
        return {
          model: cpu.model,
          speed: cpu.speed,
          usage: usage.toFixed(2) + '%'
        };
      });

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memUsage = (usedMem / totalMem * 100).toFixed(2);

      let diskInfo;
      try {
        const diskPath = os.platform() === 'win32' ? 'C:' : '/';
        diskInfo = await diskusage.check(diskPath);
        diskInfo.usage = ((diskInfo.total - diskInfo.free) / diskInfo.total * 100).toFixed(2);
      } catch (diskErr) {
        diskInfo = { error: diskErr.message };
      }

      const systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        uptime: formatUptime(os.uptime()),
        loadavg: os.loadavg(),
        nodeVersion: process.version,
        pid: process.pid,
        memoryUsage: process.memoryUsage()
      };

      res.json({
        network: { interfaces: networkData },
        cpu: { count: cpus.length, usage: cpuUsage, averageLoad: os.loadavg() },
        memory: {
          total: formatBytes(totalMem),
          used: formatBytes(usedMem),
          free: formatBytes(freeMem),
          usage: memUsage + '%'
        },
        disk: diskInfo,
        system: systemInfo,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      res.status(500).json({
        error: "Error fetching system statistics",
        message: err.message
      });
    }
  });
};

module.exports = { setup };