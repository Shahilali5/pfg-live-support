<div align="center">

# ⚡ PFG Live Support

### Embeddable, White-Label Real-Time Customer Chat Platform for Modern Websites & SaaS

[![GitHub stars](https://img.shields.io/github/stars/shahilali5/pfg-live-support?style=social)](https://github.com/shahilali5/pfg-live-support)
[![License: MIT](https://img.shields.io/badge/License-MIT-4F46E5.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-22c55e.svg)](https://nodejs.org)
[![WebSocket](https://img.shields.io/badge/Realtime-Socket.IO-6366f1.svg)](https://socket.io)
[![Bootstrap Icons](https://img.shields.io/badge/Icons-Bootstrap-7952b3.svg)](https://icons.getbootstrap.com/)
[![Maintainer](https://img.shields.io/badge/Maintainer-shahilali5-0ea5e9.svg)](https://github.com/shahilali5)

<br/>

<a href="#quick-start">Quick Start</a> •
<a href="#white-label-customization">Customization</a> •
<a href="#automated-vps-setup-setupsh">VPS Setup</a> •
<a href="#api-reference">API Docs</a> •
<a href="#security--banking-privacy">Security</a> •
<a href="#author--maintainer">Author</a>

<br/>
<br/>

<img src="https://raw.githubusercontent.com/shahilali5/pfg-live-support/main/public/uploads/banner_preview.png" alt="PFG Live Support Preview" width="850" onerror="this.style.display='none'"/>

</div>

---

## What is PFG Live Support?

**PFG Live Support** is an open-source, self-hosted real-time customer support widget and multi-agent inbox designed for web applications, SaaS platforms, and digital portals.

Most commercial live chat widgets are bloated, inject third-party tracking scripts, or look like generic marketing bots. PFG Live Support is built from scratch with zero client-side dependencies, strict CSS isolation, dual PostgreSQL/JSON database persistence, and an integrated real-time multi-agent console with private team notes.

---

## Key Highlights

- **Lightweight Floating Widget**: Vanilla JavaScript embed (`widget.js`) under 25KB, styled with scoped CSS so it never conflicts with host site styles.
- **Bi-directional WebSocket Messaging**: Real-time communication powered by Socket.IO with sub-50ms message latency, reconnect backoff, and heartbeat detection.
- **A-to-Z White-Label Customizer**: Live brand customizer studio inside the admin console. Change brand colors, logo, company name, launcher position, and FAQ pills in real time without refreshing the page.
- **Multi-Agent Support Inbox**: Manage multiple customer threads, assign conversations to departments (General Support, Tech, Billing), and filter by ticket status.
- **Private Team Notes (`🔒`)**: Leave internal agent notes that are strictly hidden from customers and never broadcast to customer sockets.
- **Zero External Audio Dependencies**: Custom notification chime synthesized dynamically via Web Audio API (no 404 MP3 errors).
- **Dual Storage Engine**: Runs out of the box with zero-config local persistent storage (`data/pfg_store.json`), or points to PostgreSQL in production with automatic schema migrations.
- **Built-In Security & Privacy**: Prominent security banner reminding customers never to share sensitive passwords, secret keys, or OTPs.

---

## Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Clone and Run

```bash
# Clone the repository
git clone https://github.com/shahilali5/pfg-live-support.git
cd pfg-live-support

# Run the automated installer (Linux / macOS / WSL)
chmod +x setup.sh
./setup.sh install

# Or manually using npm
npm install
npm start
```

### 3. Open in Browser

Once started, the server listens at `http://localhost:3000`:

| Interface | URL | Description |
| :--- | :--- | :--- |
| **Interactive Sandbox & Showcase** | `http://localhost:3000/` | Live product playground, interactive customizer & feature showcase |
| **Admin Support Console** | `http://localhost:3000/admin` | Support agent dashboard & Brand Customizer |
| **API Documentation** | `http://localhost:3000/docs` | Interactive REST and WebSocket developer documentation |
| **Embeddable Script** | `http://localhost:3000/widget.js` | Single-line script to embed on any website |

**Default Admin Credentials:**
- **Email**: `admin@pfg.com`
- **Password**: `admin123`

---

## Single-Line Website Integration

Add this snippet to your HTML before the closing `</body>` tag:

```html
<script
  src="http://localhost:3000/widget.js"
  data-site-id="pfg_gateway_default"
  async>
</script>
```

### Script Tag Customization Attributes

You can override branding directly from the embed script tag:

```html
<script
  src="http://localhost:3000/widget.js"
  data-site-id="pfg_gateway_default"
  data-company-name="Acme Support"
  data-logo-url="https://yourdomain.com/logo.png"
  data-primary-color="#2563EB"
  data-position="right"
  data-security-notice="Acme Security Note: Never share confidential passwords or security keys."
  async>
</script>
```

### JavaScript Runtime API

Control the chat window programmatically from your web application:

```javascript
// Open chat window
window.PFGChat.open();

// Close chat window
window.PFGChat.close();

// Toggle chat window
window.PFGChat.toggle();

// Trigger automated message
window.PFGChat.sendMessage("Hi! I have a question about getting started with the platform.");

// Dynamically change theme at runtime
window.PFGChat.setConfig({
  company_name: "Acme Cloud",
  brand_color: "#10b981",
  position: "left"
});
```

---

## White-Label Customization

PFG Live Support lets you rebrand the entire support experience without touching any backend code.

### Using the Admin Studio (`/admin`)
1. Log in to the console at `http://localhost:3000/admin`.
2. Click the **"Brand Customizer"** tab in the sidebar.
3. Edit the following fields:
   - **Company Name & Subtitle**: Sets widget header title and agent status.
   - **Custom Logo URL**: Points to your company SVG or PNG image.
   - **Brand Colors**: Interactive color picker with HEX inputs and CSS gradient definitions.
   - **Widget Position**: Choose between Bottom-Right or Bottom-Left.
   - **Security Advisory Text**: Custom warning banner text against sharing confidential secrets.
   - **Quick Reply FAQ Pills**: Add, edit, or remove clickable shortcut questions.
4. Preview changes in real time in the sticky mockup on the right.
5. Click **"Save & Broadcast Live"** — Socket.IO immediately pushes the new styles to all connected customers without reloading.

---

## Automated VPS Setup (`setup.sh`)

PFG Live Support includes an all-in-one bash deployment script for Ubuntu, Debian, CentOS, and WSL:

```bash
chmod +x setup.sh

# Complete auto-setup (creates secure .env, installs dependencies, runs unit tests)
./setup.sh install

# Start the application (prompts for port, auto-detects and frees occupied ports, manages PM2)
./setup.sh start

# Stop the application
./setup.sh stop

# Restart the application
./setup.sh restart

# Pull git updates, install new packages, and reload with zero downtime
./setup.sh update

# Generate Linux Systemd daemon service file (pfg-support.service)
./setup.sh service

# Generate production Nginx reverse-proxy configuration with WebSocket WSS support
./setup.sh nginx

# Run test suite
./setup.sh test
```

---

## Production Deployment (Nginx + SSL + Systemd)

### 1. Systemd Service
Generate the unit file using `./setup.sh service`, then copy to systemd:

```bash
sudo mv pfg-support.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pfg-support
```

### 2. Nginx Reverse Proxy with WebSocket Upgrades
Generate the Nginx configuration using `./setup.sh nginx`:

```nginx
server {
    listen 80;
    server_name chat.yourdomain.com;
    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Client IP headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
    }
}
```

Enable SSL using Let's Encrypt:
```bash
sudo certbot --nginx -d chat.yourdomain.com
```

---

## Production Database (PostgreSQL)

By default, the system runs with zero setup using an embedded JSON database (`data/pfg_store.json`). For high-concurrency production deployments, connect PostgreSQL:

1. Create a database:
   ```sql
   CREATE DATABASE pfg_support;
   ```
2. Update `.env`:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/pfg_support
   ```
3. Restart the server. The tables and performance indexes in `schema.sql` are applied automatically on startup.

---

## API Reference

Interactive API documentation and WebSocket protocol specifications are available at **[`/docs`](http://localhost:3000/docs)**.

### REST Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/public/config` | Public branding and quick reply pills | No |
| `POST` | `/api/customer/session` | Create or resume customer conversation | No |
| `GET` | `/api/customer/conversation/:id/messages` | Get conversation history | Session Token |
| `POST` | `/api/customer/conversation/:id/rating` | Submit CSAT rating (1-5 stars) & review | Session Token |
| `POST` | `/api/upload` | Upload attachment (Images, PDF, TXT, max 10MB) | No |
| `POST` | `/api/auth/login` | Agent login (returns signed JWT) | No |
| `GET` | `/api/auth/me` | Verify agent session | JWT Bearer |
| `GET` | `/api/admin/conversations` | List conversation threads with unread counts | JWT Bearer |
| `GET` | `/api/admin/conversation/:id` | Full conversation details with internal notes | JWT Bearer |
| `POST` | `/api/admin/conversation/:id/status` | Update status (`open`, `pending`, `resolved`) | JWT Bearer |
| `POST` | `/api/admin/conversation/:id/assign` | Assign conversation to agent | JWT Bearer |
| `POST` | `/api/admin/conversation/:id/notes` | Create private internal team note (`🔒`) | JWT Bearer |
| `GET` | `/api/admin/settings` | Get site branding settings | JWT Bearer |
| `PUT` | `/api/admin/settings` | Update and broadcast live white-label settings | JWT Bearer |
| `GET` | `/api/admin/analytics` | View active chats, avg response time, CSAT | JWT Bearer |
| `GET` | `/api/admin/conversation/:id/export` | Download transcript as `.txt` or `.json` | JWT Bearer |

### WebSocket Events (Socket.IO)

#### Client to Server
- `customer:join_conversation` — Join private customer room (`conv_<id>`).
- `agent:join_conversation` — Agent subscribes to conversation stream.
- `message:send` — Send message (with unique `clientMsgId` for deduplication).
- `typing:start` / `typing:stop` — Keystroke typing feedback.
- `message:delivered` — Acknowledges delivery receipt.
- `conversation:seen` — Marks unread messages as seen.

#### Server to Client
- `message:new` — Broadcasts incoming message to conversation room.
- `internal_note:new` — Emits private note to agents only (never delivered to customers).
- `agent:typing` / `customer:typing` — Live typing feedback indicator.
- `settings:updated` — Live white-label settings broadcast.
- `messages:seen` — Updates read receipts to blue double checks.

---

## Security & Banking Privacy

PFG Live Support is built with strict privacy controls for modern platforms:

1. **Anti-Fraud Security Ribbon**: Visible advisory banner on both customer and agent interfaces reminding users never to share confidential passwords or secret keys.
2. **Room & Data Isolation**: Customer sockets can only subscribe to their own conversation room. Administrative events, customer intelligence data, and internal notes are blocked from customer sockets.
3. **MIME-Type Screening**: File uploads strictly validate against a safe whitelist (`JPEG`, `PNG`, `WEBP`, `GIF`, `PDF`, `TXT`, `JSON`), preventing malicious executable uploads.
4. **Input Sanitization**: All incoming text payloads are HTML-escaped to prevent Cross-Site Scripting (XSS).
5. **Sliding-Window Rate Limiting**: Protects HTTP endpoints and WebSocket events against spam floods and denial-of-service attempts.

---

## Automated Testing

Run the test suite:

```bash
npm test
```

Includes 12 automated unit and integration tests verifying:
- XSS escaping and malicious payload prevention
- Attachment MIME whitelist screening
- Sliding-window rate limiter under burst traffic
- Bcrypt password hashing & JWT token issuance
- Customer session generation and conversation recovery
- Message deduplication by `clientMsgId`
- Complete isolation of private internal notes from customer streams
- Canned responses and department filtering
- Real-time white-label settings sync

---

## Author & Maintainer

<table style="border:none;">
  <tr>
    <td width="110" align="center" valign="middle">
      <a href="https://github.com/shahilali5">
        <img src="https://github.com/shahilali5.png" width="90" height="90" style="border-radius:50%;border:2px solid #4F46E5;" alt="Shahil Ali" />
      </a>
    </td>
    <td valign="middle">
      <strong>Shahil Ali</strong><br/>
      GitHub: <a href="https://github.com/shahilali5">@shahilali5</a><br/>
      Project: <a href="https://github.com/shahilali5/pfg-live-support">PFG Live Support</a><br/>
      Role: Lead Platform Engineer & Open Source Maintainer
    </td>
  </tr>
</table>

Contributions, issues, and feature requests are welcome! Feel free to star the repo on [GitHub](https://github.com/shahilali5/pfg-live-support).

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
