require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  try {
    await connectDatabase();
    console.log('MongoDB connected');

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`LifeRPG API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received. Shutting down...`);
      server.close(async () => {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
