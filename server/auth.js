/**
 * Authentication and Token Utilities
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'pfg_super_secret_jwt_key_2026_dev_secure';
const JWT_EXPIRES_IN = '7d';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateAgentToken(agent) {
  return jwt.sign(
    {
      agent_id: agent.agent_id,
      email: agent.email,
      name: agent.name,
      role: agent.role,
      department: agent.department
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyAgentToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function generateCustomerSessionToken() {
  return 'cust_sess_' + crypto.randomBytes(24).toString('hex');
}

// Express Middleware for Authenticated Agent Routes
function requireAgentAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAgentToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }

  req.agent = decoded;
  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAgentToken,
  verifyAgentToken,
  generateCustomerSessionToken,
  requireAgentAuth
};
