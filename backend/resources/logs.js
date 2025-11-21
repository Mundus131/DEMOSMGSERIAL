const { LOG_PATHS, readJsonlFile } = require('./logger');

/**
 * Konfiguruje endpointy REST dla logów
 */
function setup(app) {
  // Endpoint do pobrania kodów
  app.get('/api/logs/codes', async (req, res) => {
    try {
      const data = await readJsonlFile(LOG_PATHS.codes);
      res.json(data);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to read codes log',
        details: error.message 
      });
    }
  });

  // Endpoint do pobrania stanów
  app.get('/api/logs/states', async (req, res) => {
    try {
      const data = await readJsonlFile(LOG_PATHS.states);
      res.json(data);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to read states log',
        details: error.message 
      });
    }
  });

  // Endpoint do pobrania wag
  app.get('/api/logs/weights', async (req, res) => {
    try {
      const data = await readJsonlFile(LOG_PATHS.weights);
      res.json(data);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to read weights log',
        details: error.message 
      });
    }
  });

  // Endpoint do pobrania ramek danych
  app.get('/api/logs/data-frames', async (req, res) => {
    try {
      const data = await readJsonlFile(LOG_PATHS.dataFrames);
      res.json(data);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to read data frames log',
        details: error.message 
      });
    }
  });

  // Endpoint do pobrania wszystkich logów
  app.get('/api/logs/all', async (req, res) => {
    try {
      const [codes, states, weights, dataFrames] = await Promise.all([
        readJsonlFile(LOG_PATHS.codes),
        readJsonlFile(LOG_PATHS.states),
        readJsonlFile(LOG_PATHS.weights),
        readJsonlFile(LOG_PATHS.dataFrames)
      ]);
      
      res.json({
        codes,
        states,
        weights,
        dataFrames,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to read logs',
        details: error.message 
      });
    }
  });
}

module.exports = {
  setup
};