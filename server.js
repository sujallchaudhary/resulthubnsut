require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/db');

const studentsRouter = require('./src/routes/students');
const statsRouter = require('./src/routes/stats');
const filterRouter = require('./src/routes/filter');
const twinsDataStore = require('./src/cache/twinsDataStore');
const wrappedRouter = require('./src/routes/wrapped');
const subjectsRouter = require('./src/routes/subjects');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many requests, please try again later.' },
});

app.use('/api/', apiLimiter);

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use('/api/students', studentsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/filter', filterRouter);
app.use('/api/wrapped', wrappedRouter);
app.use('/api/subjects', subjectsRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, data: null, message: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    data: null,
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();

  // Preload academic data into memory for the twins feature (non-blocking)
  twinsDataStore.init().catch((err) => {
    console.error('TwinsDataStore initial load failed:', err.message);
  });

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

module.exports = app;
