const fs = require('fs-extra');
const path = require('path');

const configFilePath = path.join(__dirname, '../data/configuration/configuration.json');

const loadConfiguration = async () => {
  try {
    return await fs.readJson(configFilePath);
  } catch (error) {
    console.error('Error while loading configuration:', error.message);
    throw new Error('Failed to load configuration file');
  }
};

const saveConfiguration = async (newConfig) => {
  try {
    await fs.writeJson(configFilePath, newConfig, { spaces: 2 });
    console.log('Configuration saved successfully');
  } catch (error) {
    console.error('Error while saving configuration:', error.message);
    throw new Error('Failed to save configuration file');
  }
};

// Rekurencyjnie aktualizuje tylko istniejące klucze
const updateExistingKeysOnly = (target, source, path = '') => {
  const updated = [];
  const skipped = [];

  for (const key in source) {
    const currentPath = path ? `${path}.${key}` : key;

    if (key in target) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        const { updated: subUpdated, skipped: subSkipped } = updateExistingKeysOnly(
          target[key],
          source[key],
          currentPath
        );
        updated.push(...subUpdated);
        skipped.push(...subSkipped);
      } else {
        target[key] = source[key];
        updated.push(currentPath);
      }
    } else {
      skipped.push(currentPath);
    }
  }

  return { updated, skipped };
};

const setup = (app) => {
  // GET endpoint - Pobierz konfigurację
  app.get('/api/configuration', async (req, res) => {
    try {
      const config = await loadConfiguration();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Error while retrieving configuration', message: error.message });
    }
  });

  // POST endpoint - Częściowa aktualizacja konfiguracji
  app.post('/api/configuration', async (req, res) => {
    try {
      const existingConfig = await loadConfiguration();
      const newValues = req.body;

      if (typeof newValues !== 'object' || Array.isArray(newValues)) {
        return res.status(400).json({ error: 'Data must be sent as a JSON object.' });
      }

      const { updated, skipped } = updateExistingKeysOnly(existingConfig, newValues);

      await saveConfiguration(existingConfig);
      res.json({
        success: true,
        message: 'Configuration partially updated',
        updatedKeys: updated,
        skippedKeys: skipped
      });
    } catch (error) {
      res.status(500).json({ error: 'Error while updating configuration', message: error.message });
    }
  });
};

module.exports = { 
  setup,
  loadConfiguration,
  saveConfiguration
 };
