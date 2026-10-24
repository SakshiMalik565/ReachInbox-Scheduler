import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/utils/crypto';

describe('AES-256-GCM Token Encryption Security Tests', () => {
  it('encrypts plaintext into iv:authTag:ciphertext and decrypts back accurately', () => {
    const sensitiveToken = 'xoxb-1234567890-slack-bot-oauth-token-secret';
    const encrypted = encrypt(sensitiveToken);

    expect(encrypted).not.toBe(sensitiveToken);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(sensitiveToken);
  });

  it('produces distinct ciphertexts with different IVs for identical plaintext inputs', () => {
    const plaintext = 'smtp-secure-password-12345';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);

    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it('detects tampering or invalid auth tags and rejects decryption', () => {
    const plaintext = 'confidential-data';
    const encrypted = encrypt(plaintext);
    const [iv, tag, cipher] = encrypted.split(':');

    // Tamper with ciphertext
    const tamperedCipher = cipher.slice(0, -2) + 'aa';
    const tamperedPayload = `${iv}:${tag}:${tamperedCipher}`;

    expect(() => decrypt(tamperedPayload)).toThrow();
  });
});
