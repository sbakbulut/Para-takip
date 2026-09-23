# Para Takip Security Hardening Design

## Goal

Close the identified sync-destination, unauthenticated rate-limit, and PIN-at-rest gaps without losing existing local or remote financial records.

## Approved approach

### Sync destination validation

- Accept only HTTPS Google Apps Script web-app URLs on `script.google.com` with the `/macros/s/<deployment-id>/exec` path.
- Reject credentials, query strings, fragments, other hosts, schemes, and paths.
- Validate both when saving settings and immediately before each Drive or Jev-proxy request, so edited local storage cannot bypass the check.
- Do not send the Drive token, Jev key, or financial data when validation fails; show a clear settings error.

### Apps Script request limiting

- Keep request-body size checks and token validation.
- Increment the shared request counter only after the token is accepted, so unauthenticated requests cannot exhaust the user's valid-request quota.
- Preserve the current authenticated-request ceiling and existing error response.

### Encrypted financial-data vault

- Replace the four-digit UI-only PIN gate with a passphrase-backed vault for the primary financial state.
- Use Web Crypto PBKDF2-HMAC-SHA-256 to derive an AES-GCM key; store only a versioned envelope containing KDF parameters, random salt, random IV, and ciphertext.
- Require the passphrase on startup before loading financial data into application state. Fail closed if the secure cryptographic APIs are unavailable; never fall back to plaintext or a plain PIN.
- Encrypt the Drive sync payload client-side as the same envelope, so the Apps Script store and other devices receive ciphertext. Use the same passphrase to unlock on each device.
- Migrate existing local and remote plaintext data only after successful decryption/validation and a verified encrypted write. Keep a recoverable copy until migration succeeds; never silently overwrite data on wrong passphrase, tampering, or failed writes.
- A lost passphrase cannot be reset by the app; provide an explicit warning and retain the existing export/backup path where possible.
- This protects data at rest and in transit to the sync store; it does not protect data while the app is unlocked, against browser/device compromise, or against same-origin malicious JavaScript.

## Tests

- Reject malicious sync URLs at save and request time; assert no fetch occurs and no token/data/key is sent.
- Accept the documented Apps Script `/exec` URL.
- Verify invalid tokens do not increment the valid-request limiter; verify authenticated traffic still reaches the current limit.
- Verify vault encryption/decryption round-trips, wrong passphrases and modified ciphertext fail, and migration preserves the original until the encrypted replacement is verified.
- Verify Drive push stores only an encrypted envelope and Drive pull unlocks/migrates supported legacy plaintext data without replacing local records on failure.
- Run the existing test suite and inline JavaScript syntax check.

## Scope and risks

- The repository stays public and no repository-visibility changes are included.
- Existing 4-digit PIN settings will require a one-time passphrase migration; this is a deliberate security-related UX change.
- API provider keys and sync credentials are outside the financial-state vault in this change unless their existing storage is required for migration; they must not be mistaken for encrypted by this design.
- Old clients and new clients sharing a sync endpoint may not understand the same payload envelope. The implementation must detect legacy plaintext and migrate safely, and must not overwrite an encrypted remote record from a client that cannot decrypt it.
