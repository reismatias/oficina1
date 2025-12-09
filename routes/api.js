const express = require('express');
const router = express.Router();
const { listDevices, getDeviceData, saveDeviceData, getDeviceStats, deleteDevice, clearDeviceData, renameDevice, setDeviceLed, getDeviceLed, setDeviceThreshold, getDeviceThreshold } = require('../services/deviceService');
const { logger } = require('../utils/logger');

// ========================================
// Device Data API
// Endpoints para listar devices e buscar dados de um device específico.
// ========================================
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

// ========================================
// Data Ingestion
// Endpoint para ESP32 enviar dados de medições.
// ========================================
router.post('/dados', async (req, res) => {
  const deviceId = req.body.device_id;
  if (!deviceId) return res.status(400).json({ message: 'device_id é obrigatório' });

  try {
    const filename = await saveDeviceData(deviceId, req.body);
    const ledState = await getDeviceLed(deviceId);
    return res.status(200).json({
      message: `Dados recebidos e salvos no banco de dados (device: ${filename})`,
      acender_giroflex: ledState
    });
  } catch (err) {
    logger.error('Erro ao salvar os dados: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao salvar os dados' });
  }
});

// ========================================
// Device Management
// CRUD operations para gerenciar devices (stats, delete, clear, rename).
// ========================================

// Get device statistics
router.get('/api/devices/:id/stats', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;

  try {
    const stats = await getDeviceStats(deviceId);
    return res.json(stats);
  } catch (err) {
    logger.error('Error getting device stats: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao obter estatísticas' });
  }
});

router.delete('/api/devices/:id', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;

  try {
    const numRemoved = await deleteDevice(deviceId);
    return res.json({ message: `Device deletado com sucesso (${numRemoved} registros removidos)` });
  } catch (err) {
    logger.error('Error deleting device: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao deletar device' });
  }
});

router.delete('/api/devices/:id/data', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;

  try {
    const numRemoved = await clearDeviceData(deviceId);
    return res.json({ message: `Dados limpos com sucesso (${numRemoved} registros removidos)` });
  } catch (err) {
    logger.error('Error clearing device data: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao limpar dados' });
  }
});

router.put('/api/devices/:id', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const oldId = req.params.id;
  const { newId } = req.body;

  if (!newId) {
    return res.status(400).json({ message: 'newId é obrigatório' });
  }

  try {
    const numUpdated = await renameDevice(oldId, newId);
    return res.json({ message: `Device renomeado com sucesso (${numUpdated} registros atualizados)` });
  } catch (err) {
    logger.error('Error renaming device: ' + (err && err.message));
    return res.status(500).json({ message: err.message || 'Erro ao renomear device' });
  }
});

// Get LED state
router.get('/api/devices/:id/led', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;

  try {
    const state = await getDeviceLed(deviceId);
    return res.json({ led: state });
  } catch (err) {
    logger.error('Error getting LED state: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao obter estado do LED' });
  }
});

// Set LED state
router.post('/api/devices/:id/led', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;
  const { state } = req.body; // Expecting boolean

  try {
    await setDeviceLed(deviceId, !!state);
    return res.json({ message: `LED ${state ? 'ligado' : 'desligado'} com sucesso`, led: !!state });
  } catch (err) {
    logger.error('Error setting LED state: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao alterar estado do LED' });
  }
});

// Get Device Threshold
router.get('/api/devices/:id/threshold', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;

  try {
    const threshold = await getDeviceThreshold(deviceId);
    return res.json({ threshold });
  } catch (err) {
    logger.error('Error getting device threshold: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao obter threshold' });
  }
});

// Set Device Threshold
router.post('/api/devices/:id/threshold', async (req, res) => {
  if (!req.session || !req.session.username) return res.status(401).json({ message: 'Unauthorized' });

  const deviceId = req.params.id;
  const { threshold } = req.body;

  if (threshold === undefined || threshold === null) {
    return res.status(400).json({ message: 'Threshold é obrigatório' });
  }

  try {
    await setDeviceThreshold(deviceId, threshold);
    return res.json({ message: `Threshold definido para ${threshold} dB`, threshold });
  } catch (err) {
    logger.error('Error setting device threshold: ' + (err && err.message));
    return res.status(500).json({ message: 'Erro ao definir threshold' });
  }
});

module.exports = router;
