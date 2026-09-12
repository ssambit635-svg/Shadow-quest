const mongoose = require('mongoose');

async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined. Copy .env.example to .env and set it.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri);

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = {
  connectDatabase,
  disconnectDatabase
};
