# Contributing to PFG Live Support

Welcome! Thank you for helping build and improve **PFG Live Support**. We welcome bug fixes, architecture improvements, feature additions, and documentation enhancements.

Project Maintainer: **Shahil Ali** ([@shahilali5](https://github.com/shahilali5))

---

## Code of Conduct

Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in the community.

---

## Local Development Workflow

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/shahilali5/pfg-live-support.git
   cd pfg-live-support
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run automated test suite**:
   ```bash
   npm test
   ```

4. **Start in local watch mode**:
   ```bash
   npm run dev
   ```

---

## Core Engineering Principles

1. **Zero-Dependency Customer Widget**: `public/widget.js` must remain ultra-lightweight and scoped so it never pollutes the global namespace or interferes with the host website's CSS and DOM.
2. **Security & Financial Privacy**: Never transmit or request sensitive financial secrets (UPI PIN, CVV, OTP, passwords). Always isolate customer socket rooms from administrative data.
3. **No AI Slop**: Write clear, direct code, clean comments, and human documentation. Avoid boilerplate filler.

---

## Submitting Pull Requests

1. Create a branch: `git checkout -b feature/your-feature-name`
2. Run test verification: `npm test`
3. Commit with clear, conventional messages.
4. Open a pull request against `main` on [github.com/shahilali5/pfg-live-support](https://github.com/shahilali5/pfg-live-support).
