# Optional encrypted-log exercise — design slot

Not required before the first attack/detect/fix loop. No encryption tools implemented.

Decide offline artifact encryption versus live log-format change. AES-GCM authenticates ciphertext; extra HMAC needs a separate purpose/key design. Specify envelope version, nonce uniqueness, external keys/rotation and tamper failure. Deletion/reordering/truncation are separate threats.

Existing readers, rotation and recovery need compatibility proof before integration. No keys or private ciphertext in version control.
