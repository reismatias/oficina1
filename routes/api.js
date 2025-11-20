const express = require('express');
const router = express.Router();
const { listDevices, getDeviceData, saveDeviceData } = require('../services/deviceService');
const { logger } = require('../utils/logger');

// ----- API: list devices with limited entries -----
router.get('/api/dados', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const devices = await listDevices();
    return res.json({ devices });
  } catch (err) {
    logger.error('Error reading data dir: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro lendo dados' });
  }
});

router.get('/api/dados/:filename', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const requested = req.params.filename;

  try {
    const data = await getDeviceData(requested);
    if (!data) return res.status(404).json({ message: 'File not found' });
    return res.json(data);
  } catch (err) {
    if (err.message === 'Invalid filename') {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    logger.error('Error reading file ' + requested + ' : ' + (err && err.message));
    return res.status(500).json({ message: 'Erro lendo arquivo' });
  }
});

// ----- Device ingestion endpoint (ESP32) -----
router.post('/dados', async (req, res) => {
  const deviceId = req.body.device_id;
  if (!deviceId) return res.status(400).json({ message: 'device_id é obrigatório' });

  try {
    const filename = await saveDeviceData(deviceId, req.body);
    return res.status(200).json({ message: `Dados recebidos e salvos no arquivo ${filename}` });
  } catch (err) {
    logger.error('Erro ao salvar os dados: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao salvar os dados' });
  }
});

module.exports = router;
