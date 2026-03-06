const mongoose = require('mongoose');

/**
 * College → MongoDB URI mapping.
 * MONGODB_URI (the original env var) is used as the NSUT connection.
 */
const COLLEGE_URI_MAP = {
  nsut: process.env.MONGODB_URI_NSUT || process.env.MONGODB_URI,
  igdtuw: process.env.MONGODB_URI_IGDTUW,
  dtu: process.env.MONGODB_URI_DTU,
};

/** @type {Record<string, mongoose.Connection>} */
const connections = {};

const connectDB = async () => {
  const opts = { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 };

  for (const [college, uri] of Object.entries(COLLEGE_URI_MAP)) {
    if (!uri) {
      console.warn(`[db] No URI for ${college}, skipping`);
      continue;
    }
    connections[college] = mongoose.createConnection(uri, opts);
    connections[college].on('error', (err) =>
      console.error(`[${college}] MongoDB error:`, err),
    );
    connections[college].on('disconnected', () =>
      console.warn(`[${college}] MongoDB disconnected`),
    );
    // Wait for connection to be ready
    await connections[college].asPromise();
    console.log(`MongoDB connected for ${college}: ${connections[college].host}`);
  }

  if (Object.keys(connections).length === 0) {
    throw new Error('No database URIs configured. Set at least MONGODB_URI or MONGODB_URI_NSUT.');
  }
};

/** Get the mongoose connection for a college key. */
const getConnection = (college) => connections[college] || null;

/** Get list of connected college keys. */
const getActiveColleges = () => Object.keys(connections);

module.exports = { connectDB, getConnection, getActiveColleges };
