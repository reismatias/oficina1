const db = require('./db');
const { logger } = require('../utils/logger');

async function listDevices() {
  try {
    // NeDB doesn't have distinct query easily, so we fetch all and filter unique device_ids
    // For performance with large datasets, we might want a separate collection for devices,
    // but for now this is better than reading 500 files.
    // Actually, fetching ALL docs to find distinct is slow if millions of rows.
    // But NeDB is in-memory (mostly) or append-only.
    // Optimization: Maintain a separate 'devices' set or just query.
    // Let's try to find unique device_ids.
    // Since NeDB is not SQL, we can't do SELECT DISTINCT.
    // We can find all, but projection { device_id: 1 } helps.

    // However, for a quick migration, let's assume the number of devices is small
    // even if readings are many.
    // A better approach for NeDB: maintain a separate 'metadata' doc or collection.
    // For now, let's just return the list of devices that have sent data recently?
    // Or we can just query all with projection.

    const docs = await db.find({}, { device_id: 1 });
    const uniqueIds = [...new Set(docs.map(d => d.device_id))];
    return uniqueIds.map(id => ({ device_id: id, filename: id }));
  } catch (err) {
    logger.error('Error listing devices from DB: ' + err.message);
    throw err;
  }
}

async function getDeviceData(deviceId) {
  if (!deviceId) throw new Error('Invalid deviceId');

  try {
    // Get last 500 entries
    const docs = await db.find({ device_id: deviceId })
      .sort({ timestamp: -1 })
      .limit(500);

    const entries = docs.map(d => ({
      device_id: d.device_id,
      db: d.db_level,
      timestamp: d.timestamp,
      _ts: d.timestamp
    }));

    // Reverse to chronological order
    entries.reverse();

    return { filename: deviceId, entries };
  } catch (err) {
    logger.error('Error reading device data from DB: ' + err.message);
    throw err;
  }
}

async function saveDeviceData(deviceId, data) {
  if (!deviceId) throw new Error('device_id is required');

  const dbLevel = data.db || 0;
  const timestamp = data.timestamp || Date.now();

  try {
    await db.insert({
      device_id: deviceId,
      db_level: dbLevel,
      timestamp: timestamp
    });
    return deviceId;
  } catch (err) {
    logger.error('Error saving data to DB: ' + err.message);
    throw err;
  }
}

async function getDeviceStats(deviceId) {
  if (!deviceId) throw new Error('Invalid deviceId');

  try {
    const docs = await db.find({ device_id: deviceId });
    const totalRecords = docs.length;

    if (totalRecords === 0) {
      return {
        totalRecords: 0,
        firstActivity: null,
        lastActivity: null
      };
    }

    const timestamps = docs.map(d => d.timestamp).sort((a, b) => a - b);

    return {
      totalRecords,
      firstActivity: timestamps[0],
      lastActivity: timestamps[timestamps.length - 1]
    };
  } catch (err) {
    logger.error('Error getting device stats from DB: ' + err.message);
    throw err;
  }
}

async function deleteDevice(deviceId) {
  if (!deviceId) throw new Error('Invalid deviceId');

  try {
    const numRemoved = await db.remove({ device_id: deviceId }, { multi: true });
    logger.info(`Deleted device ${deviceId} - ${numRemoved} records removed`);
    return numRemoved;
  } catch (err) {
    logger.error('Error deleting device from DB: ' + err.message);
    throw err;
  }
}

async function clearDeviceData(deviceId) {
  if (!deviceId) throw new Error('Invalid deviceId');

  try {
    const numRemoved = await db.remove({ device_id: deviceId }, { multi: true });
    logger.info(`Cleared data for device ${deviceId} - ${numRemoved} records removed`);
    return numRemoved;
  } catch (err) {
    logger.error('Error clearing device data from DB: ' + err.message);
    throw err;
  }
}

async function renameDevice(oldId, newId) {
  if (!oldId || !newId) throw new Error('Both oldId and newId are required');
  if (oldId === newId) throw new Error('New ID must be different from old ID');

  try {
    // Check if new ID already exists
    const existing = await db.findOne({ device_id: newId });
    if (existing) {
      throw new Error('Device with new ID already exists');
    }

    // Update all records
    const numUpdated = await db.update(
      { device_id: oldId },
      { $set: { device_id: newId } },
      { multi: true }
    );

    logger.info(`Renamed device ${oldId} to ${newId} - ${numUpdated} records updated`);
    return numUpdated;
  } catch (err) {
    logger.error('Error renaming device in DB: ' + err.message);
    throw err;
  }
}

module.exports = {
  listDevices,
  getDeviceData,
  saveDeviceData,
  getDeviceStats,
  deleteDevice,
  clearDeviceData,
  renameDevice
};
