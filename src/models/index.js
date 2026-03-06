/**
 * Model factory — returns college-scoped Mongoose models for a given connection.
 *
 * Because each college lives in its own database (separate connection), we
 * compile the shared schemas once per connection and cache them.
 */

const studentSchema = require('./Student').schema;
const sgpaSchema = require('./SGPA').schema;
const scoreSchema = require('./Score').schema;
const departmentSchema = require('./Department').schema;
const cachedStatsSchema = require('./CachedStats').schema;
const requestLogSchema = require('./RequestLog').schema;

/** @type {Map<string, object>} collegeName → { Student, SGPA, … } */
const modelCache = new Map();

/**
 * Get (or create) compiled models for a specific college connection.
 * @param {import('mongoose').Connection} connection
 * @param {string} collegeName
 */
function getModels(connection, collegeName) {
  if (modelCache.has(collegeName)) return modelCache.get(collegeName);

  const models = {
    Student: connection.model('Student', studentSchema),
    SGPA: connection.model('SGPA', sgpaSchema),
    Score: connection.model('Score', scoreSchema),
    Department: connection.model('Department', departmentSchema),
    CachedStats: connection.model('CachedStats', cachedStatsSchema),
    RequestLog: connection.model('RequestLog', requestLogSchema),
  };

  modelCache.set(collegeName, models);
  return models;
}

module.exports = { getModels };
