const jwt = require('jsonwebtoken');

function generateToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.sign({ id: String(userId) }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = {
  generateToken,
  decodeToken
};
