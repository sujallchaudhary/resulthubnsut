require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { connectDB, getActiveColleges } = require('./src/db');
const requestLogger = require('./src/middleware/requestLogger');
const collegeContext = require('./src/middleware/collegeContext');

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
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

/* List available colleges */
app.get('/api/colleges', (_req, res) => {
  res.json({ success: true, data: getActiveColleges() });
});

/* All data routes are prefixed with /:college */
app.use('/api/:college/students', collegeContext, studentsRouter);
app.use('/api/:college/stats',    collegeContext, statsRouter);
app.use('/api/:college/filter',   collegeContext, filterRouter);
app.use('/api/:college/wrapped',  collegeContext, wrappedRouter);
app.use('/api/:college/subjects', collegeContext, subjectsRouter);

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
