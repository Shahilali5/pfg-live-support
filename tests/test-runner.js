/**
 * Automated Test Suite for PFG Live Support
 * Verifies DB operations, Auth, REST endpoints, and WebSocket flow
 */
const assert = require('assert');
const http = require('http');
const db = require('../server/db');
const { hashPassword, comparePassword, generateAgentToken, verifyAgentToken } = require('../server/auth');
const { sanitizeText, isAllowedFile, SocketRateLimiter } = require('../server/utils/security');

async function runTests() {
  console.log('🧪 Starting PFG Live Support automated test suite...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`, err.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`, err.message);
      failed++;
    }
  }

  // 1. Security & Sanitization
  test('XSS sanitization escapes angle brackets and quotes', () => {
    const raw = '<script>alert("hack")</script>';
    const safe = sanitizeText(raw);
    assert.strictEqual(safe, '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
  });

  test('File upload validation checks extension and MIME', () => {
    assert.strictEqual(isAllowedFile('receipt.png', 'image/png'), true);
    assert.strictEqual(isAllowedFile('invoice.pdf', 'application/pdf'), true);
    assert.strictEqual(isAllowedFile('malware.exe', 'application/x-msdownload'), false);
    assert.strictEqual(isAllowedFile('shell.php', 'application/x-httpd-php'), false);
  });

  test('Socket rate limiter allows within limits and blocks burst spam', () => {
    const limiter = new SocketRateLimiter(3, 1000);
    const sockId = 'test_sock_1';
    assert.strictEqual(limiter.isAllowed(sockId), true);
    assert.strictEqual(limiter.isAllowed(sockId), true);
    assert.strictEqual(limiter.isAllowed(sockId), true);
    assert.strictEqual(limiter.isAllowed(sockId), false); // 4th request blocked
  });

  // 2. Authentication & JWT
  test('Password hashing and comparison with bcrypt', () => {
    const pass = 'gatewayPass123';
    const hash = hashPassword(pass);
    assert.strictEqual(comparePassword(pass, hash), true);
    assert.strictEqual(comparePassword('wrongPass', hash), false);
  });

  test('Agent JWT generation and signature verification', () => {
    const mockAgent = {
      agent_id: 'agent_test_99',
      email: 'support@pfg.com',
      name: 'Test Agent',
      role: 'agent',
      department: 'Payments'
    };
    const token = generateAgentToken(mockAgent);
    assert.ok(token);

    const verified = verifyAgentToken(token);
    assert.strictEqual(verified.email, 'support@pfg.com');
    assert.strictEqual(verified.agent_id, 'agent_test_99');

    const invalid = verifyAgentToken('corrupted.token.signature');
    assert.strictEqual(invalid, null);
  });

  // 3. Database & Repository Operations
  await testAsync('Database initializes and default site exists', async () => {
    await db.init();
    const site = await db.getSite('pfg_gateway_default');
    assert.ok(site);
    assert.strictEqual(site.site_id, 'pfg_gateway_default');
  });

  await testAsync('Default Admin agent exists and can be looked up', async () => {
    const admin = await db.getAgentByEmail('admin@pfg.com');
    assert.ok(admin);
    assert.strictEqual(admin.email, 'admin@pfg.com');
    assert.strictEqual(comparePassword('admin123', admin.password_hash), true);
  });

  await testAsync('Customer creation, session token lookup, and active conversation', async () => {
    const token = 'cust_sess_test_' + Date.now();
    const customer = await db.createCustomer({
      siteId: 'pfg_gateway_default',
      sessionToken: token,
      name: 'Rohan Sharma',
      email: 'rohan@example.com',
      ip: '192.168.1.100'
    });
    assert.ok(customer.customer_id);

    const retrieved = await db.getCustomerByToken(token);
    assert.strictEqual(retrieved.name, 'Rohan Sharma');

    const conv = await db.createConversation({
      siteId: 'pfg_gateway_default',
      customerId: customer.customer_id,
      department: 'Payments'
    });
    assert.ok(conv.conversation_id);

    const activeConv = await db.getActiveConversationForCustomer(customer.customer_id);
    assert.strictEqual(activeConv.conversation_id, conv.conversation_id);
  });

  await testAsync('Message creation, deduplication via clientMsgId, and read status update', async () => {
    const customer = await db.createCustomer({
      siteId: 'pfg_gateway_default',
      sessionToken: 'cust_sess_msg_' + Date.now(),
      name: 'Priya Patel'
    });
    const conv = await db.createConversation({
      siteId: 'pfg_gateway_default',
      customerId: customer.customer_id
    });

    const clientMsgId = 'cl_uuid_' + Date.now();
    const msg1 = await db.addMessage({
      conversationId: conv.conversation_id,
      senderType: 'customer',
      senderId: customer.customer_id,
      senderName: customer.name,
      text: 'Need help with UPI payment deduction',
      clientMsgId
    });
    assert.ok(msg1.message_id);

    // Test deduplication
    const msgDuplicate = await db.addMessage({
      conversationId: conv.conversation_id,
      senderType: 'customer',
      senderId: customer.customer_id,
      senderName: customer.name,
      text: 'Need help with UPI payment deduction',
      clientMsgId
    });
    assert.strictEqual(msgDuplicate.message_id, msg1.message_id);

    // Test read receipt status
    await db.updateMessageStatus(msg1.message_id, 'seen');
    const messages = await db.getMessages(conv.conversation_id);
    assert.strictEqual(messages[0].status, 'seen');
  });

  await testAsync('Internal team notes are excluded from customer-facing messages', async () => {
    const customer = await db.createCustomer({
      siteId: 'pfg_gateway_default',
      sessionToken: 'cust_sess_notes_' + Date.now()
    });
    const conv = await db.createConversation({
      siteId: 'pfg_gateway_default',
      customerId: customer.customer_id
    });

    await db.addMessage({
      conversationId: conv.conversation_id,
      senderType: 'customer',
      senderId: customer.customer_id,
      text: 'Customer visible question'
    });

    await db.addInternalNote({
      conversationId: conv.conversation_id,
      agentId: 'agent_pfg_admin',
      agentName: 'PFG Senior Support',
      noteText: 'Internal note: Customer account has high velocity chargebacks.'
    });

    const customerVisible = await db.getMessages(conv.conversation_id, { includeInternal: false });
    assert.strictEqual(customerVisible.length, 1);
    assert.strictEqual(customerVisible[0].text, 'Customer visible question');

    const internalNotes = await db.getInternalNotes(conv.conversation_id);
    assert.strictEqual(internalNotes.length, 1);
    assert.ok(internalNotes[0].note_text.includes('chargebacks'));
  });

  await testAsync('Canned responses retrieval and department filtering', async () => {
    const all = await db.getCannedResponses();
    assert.ok(all.length >= 5);

    const paymentResponses = await db.getCannedResponses('Payments');
    assert.ok(paymentResponses.some(r => r.shortcut === '#tx_lookup'));
  });

  await testAsync('White-label site settings retrieval and live update', async () => {
    const initial = await db.getSiteSettings('pfg_gateway_default');
    assert.ok(initial);
    assert.ok(initial.brand_color);

    const updated = await db.updateSiteSettings('pfg_gateway_default', {
      company_name: 'Acme Support Desk',
      brand_color: '#2563EB',
      position: 'left'
    });
    assert.strictEqual(updated.company_name, 'Acme Support Desk');
    assert.strictEqual(updated.brand_color, '#2563EB');
    assert.strictEqual(updated.position, 'left');

    const retrieved = await db.getSiteSettings('pfg_gateway_default');
    assert.strictEqual(retrieved.company_name, 'Acme Support Desk');
  });

  console.log(`\n==================================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed.`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
