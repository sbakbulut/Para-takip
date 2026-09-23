# Para Takip Security Hardening Implementation Plan

> **For agentic workers:** Execute the tasks in order with test-first changes. Do not commit unless explicitly requested.

**Goal:** Prevent sync-secret exfiltration through arbitrary endpoints, prevent unauthenticated clients consuming the Apps Script quota, and encrypt local and synced financial data behind a passphrase.

**Architecture:** Keep the single-file browser app and existing Apps Script protocol. Validate the sync destination at both configuration and request time, move the authenticated request counter after token verification, and use a versioned Web Crypto AES-GCM envelope for the main financial state and Drive snapshots. A startup gate migrates legacy plaintext once and unlocks encrypted local or remote data before the app state is mounted.

**Tech Stack:** Inline JavaScript, Web Crypto API (PBKDF2-HMAC-SHA-256 and AES-GCM), Google Apps Script, Node.js tests in jsdom.

## Global Constraints

- Accept only HTTPS `script.google.com/macros/s/<deployment-id>/exec` sync destinations.
- Keep the Apps Script body-size limit and authenticated request limit.
- Do not fall back to plaintext storage if Web Crypto or decryption fails.
- Verify encrypted writes before removing legacy plaintext; preserve data on failure.
- Encrypt Drive payloads and local snapshots; do not write commits.
- State clearly that unlocked/runtime compromise and provider credentials outside the vault are not protected.

---

### Task 1: Restrict sync destinations

**Files:** `index.html`, `tests/test-sync.js`

- [ ] Add tests that reject non-HTTPS, foreign hosts, wrong paths, credentials, query strings, and fragments.
- [ ] Verify valid Apps Script `/exec` URLs still reach `fetch`.
- [ ] Implement one URL validator and apply it during save and immediately before both Drive and Jev-proxy requests.
- [ ] Run the sync test file and full test suite.

### Task 2: Protect the Apps Script limiter

**Files:** `gas/Code.gs`, `tests/test-sync.js`

- [ ] Add a test proving invalid/missing tokens do not change the rate property.
- [ ] Keep size/action checks, authenticate, then increment the existing shared counter.
- [ ] Verify the 61st authenticated request is still rate-limited and run the GAS tests.

### Task 3: Add encrypted vault primitives and startup migration

**Files:** `index.html`, `tests/test.js`, `tests/harness.js`

- [ ] Test envelope round-trip, wrong passphrase rejection, tamper rejection, and secure-context/API failure.
- [ ] Implement versioned PBKDF2-HMAC-SHA-256/AES-GCM helpers with random salts and IVs.
- [ ] Add a startup setup/unlock gate before the financial state is loaded into the main app.
- [ ] Migrate legacy local data and snapshots; verify encrypted copies before deleting plaintext/PIN artifacts.
- [ ] Replace four-digit PIN UI/tests with vault-passphrase setup/unlock/change behavior.

### Task 4: Encrypt sync and snapshots

**Files:** `index.html`, `tests/test-sync.js`, `tests/test-jev.js`

- [ ] Test that Drive puts contain only an encrypted envelope and that remote encrypted data requires a valid passphrase.
- [ ] Encrypt snapshots and support restoring encrypted snapshots.
- [ ] Support safe legacy plaintext pulls and migrate them to encrypted local/remote form after validation.
- [ ] Preserve local data on wrong passphrase, malformed envelope, or remote write failure.
- [ ] Ensure a fresh device can configure sync, unlock an encrypted remote envelope, and adopt that vault's KDF salt/key metadata.

### Task 5: Verify and document

**Files:** `README.md`, `gas/KURULUM.md` if protocol behavior changes

- [ ] Document vault migration, passphrase-loss implications, and security limits.
- [ ] Run `npm test` and the inline JavaScript syntax check.
- [ ] Inspect `git diff` and confirm no secrets, unrelated edits, or commits.
