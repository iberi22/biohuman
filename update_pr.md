Update PR based on feedback
1. Iterations validation [210_000, 10_000_000], else invalid-envelope.
2. unsupported-version if `v !== 1` before checking shape in decrypt/decode.
3. KDF iterations to 600,000 for new (210,000 as min).
4. Validate sizes: salt 16, IV 12, ciphertext >= 16. Base64 error -> invalid-envelope.
5. Reject empty passphrase. Honest threat model: remove "storage", mention passphrase strength/offline attack.
6. Reuse `encryptWithKey`/`decryptWithKey` from `src/lib/lock/deviceLock.ts`.
7. GCM failure -> wrong-passphrase or tampered. Emit tampered as requested in earlier specs but maybe check requirement 7.
8. Tests M3, M4, M5/M9/M10, M6/M7, M12.
