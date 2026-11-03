/**
 * Authentication Routes for PFG Live Support Agents
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { comparePassword, generateAgentToken, requireAgentAuth } = require('../auth');

// Agent Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const agent = await db.getAgentByEmail(email);
    if (!agent) {
      return res.status(401).json({ success: false, error: 'Invalid email or credentials' });
    }

    const isValid = comparePassword(password, agent.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or credentials' });
    }

    // Set online
    await db.updateAgentStatus(agent.agent_id, true);

    const token = generateAgentToken(agent);
    const { password_hash, ...safeAgent } = agent;

    res.json({
      success: true,
      token,
      agent: safeAgent
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
});

// Verify Current Agent Session
router.get('/me', requireAgentAuth, async (req, res) => {
  try {
    const agent = await db.getAgentById(req.agent.agent_id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    const { password_hash, ...safeAgent } = agent;
    res.json({ success: true, agent: safeAgent });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Agent Logout
router.post('/logout', requireAgentAuth, async (req, res) => {
  try {
    await db.updateAgentStatus(req.agent.agent_id, false);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
