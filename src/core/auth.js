const crypto = require('crypto');

const SECRET = process.env.WORDGRID_SECRET || 'wordgrid_dev_secret';
const TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 12;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decode(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8'));
}

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function createToken(payload, expiresInMs = TOKEN_EXPIRY_MS) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ ...payload, exp: Date.now() + expiresInMs });
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [header, body, signature] = token.split('.');
  const validSignature = sign(`${header}.${body}`);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(validSignature))) {
    return null;
  }
  const payload = decode(body);
  if (Date.now() > payload.exp) {
    return null;
  }
  return payload;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken
};
