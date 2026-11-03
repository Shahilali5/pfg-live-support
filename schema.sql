-- ==========================================================
-- PFG Live Support - PostgreSQL Production Schema
-- Real-time Customer Support System for Payment Gateways
-- ==========================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Sites / Merchants Table
CREATE TABLE IF NOT EXISTS sites (
    site_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    webhook_url TEXT,
    settings JSONB DEFAULT '{"theme": "fintech-purple", "allow_guest": true, "operating_hours": "24/7"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Agents / Support Staff Table
CREATE TABLE IF NOT EXISTS agents (
    agent_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) DEFAULT 'agent', -- 'admin', 'agent', 'supervisor'
    department VARCHAR(64) DEFAULT 'Payments', -- 'Payments', 'Technical Support', 'Account Support'
    avatar TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customers / Visitors Table
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) REFERENCES sites(site_id) ON DELETE CASCADE,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) DEFAULT 'Guest Customer',
    email VARCHAR(255),
    ip_address VARCHAR(64),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) REFERENCES sites(site_id) ON DELETE CASCADE,
    customer_id VARCHAR(64) REFERENCES customers(customer_id) ON DELETE CASCADE,
    assigned_agent_id VARCHAR(64) REFERENCES agents(agent_id) ON DELETE SET NULL,
    status VARCHAR(32) DEFAULT 'open', -- 'open', 'pending', 'resolved'
    department VARCHAR(64) DEFAULT 'Payments',
    rating INT CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Messages Table
CREATE TABLE IF NOT EXISTS messages (
    message_id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    sender_type VARCHAR(32) NOT NULL, -- 'customer', 'agent', 'system'
    sender_id VARCHAR(64) NOT NULL,
    sender_name VARCHAR(255),
    text TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'sent', -- 'sent', 'delivered', 'seen'
    is_internal BOOLEAN DEFAULT FALSE,
    client_msg_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Attachments Table
CREATE TABLE IF NOT EXISTS attachments (
    attachment_id VARCHAR(64) PRIMARY KEY,
    message_id VARCHAR(64) REFERENCES messages(message_id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Internal Notes (Private to Support Team)
CREATE TABLE IF NOT EXISTS internal_notes (
    note_id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    agent_id VARCHAR(64) REFERENCES agents(agent_id) ON DELETE CASCADE,
    agent_name VARCHAR(255) NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Canned Responses / Quick Reply Templates
CREATE TABLE IF NOT EXISTS canned_responses (
    response_id VARCHAR(64) PRIMARY KEY,
    shortcut VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    department VARCHAR(64) DEFAULT 'All',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Chat Events Log / Audit Trail
CREATE TABLE IF NOT EXISTS chat_events (
    event_id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL, -- 'started', 'assigned', 'status_change', 'rated', 'resolved'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_site_status ON conversations(site_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_msg_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation ON internal_notes(conversation_id, created_at ASC);

-- Initial Seed Data
INSERT INTO sites (site_id, name, domain, settings)
VALUES (
    'pfg_gateway_default',
    'PFG Payment Gateway',
    'pfg-gateway.io',
    '{"theme": "fintech-purple", "allow_guest": true, "operating_hours": "24/7"}'
) ON CONFLICT (site_id) DO NOTHING;

-- Seed Default Admin Agent (password: admin123, hashed with bcrypt)
INSERT INTO agents (agent_id, name, email, password_hash, role, department, avatar, is_online)
VALUES (
    'agent_pfg_admin',
    'Shahil Ali',
    'admin@pfg.com',
    '$2a$10$wT0lQf/Pqm/R6h0b2I.7lOpOaE1VekqgD6rN.s4JgKz2fN0r17.jO', -- bcrypt for 'admin123'
    'admin',
    'Payments & Platform Engineering',
    'https://github.com/shahilali5.png',
    TRUE
) ON CONFLICT (email) DO NOTHING;

-- Seed Canned Responses
INSERT INTO canned_responses (response_id, shortcut, title, text, department)
VALUES
    ('cr_1', '#greeting', 'Welcome Greeting', 'Hello! Thank you for reaching out to PFG Support. My name is {{agent_name}}. How can I assist with your transaction today?', 'All'),
    ('cr_2', '#tx_lookup', 'Transaction Verification', 'To locate your transaction details, please provide your Transaction ID (e.g. TXN_xxxxxxxx) or Order Reference number. Please remember: NEVER share your UPI PIN, OTP or card CVV.', 'Payments'),
    ('cr_3', '#webhook', 'Webhook Debugging', 'For webhook notifications, ensure your endpoint responds with HTTP 200 within 5 seconds. You can verify payload signatures using your Merchant Secret Key in the PFG Developer Console.', 'Technical Support'),
    ('cr_4', '#refund', 'Refund Processing Time', 'Standard refunds take 3 to 5 business days to credit back to the original source bank/card, depending on the issuing bank network.', 'Payments'),
    ('cr_5', '#resolved', 'Issue Resolved Closing', 'I have marked this issue as resolved. Feel free to leave a quick rating below. Thank you for choosing PFG Gateway!', 'All')
ON CONFLICT (shortcut) DO NOTHING;
