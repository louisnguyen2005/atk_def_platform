# 03 · ECDSA Nonce

1. Ask for a public key with `{"op":"pubkey"}`. Get two signatures by calling `{"op":"sign","message":"first"}` and then a different message.
2. If both signatures have the same `r`, the service reused `k`. Hash each message with SHA-256 and interpret the digest as `z`.
3. Work modulo the P-256 order `n`. Recover `k = (z1-z2)/(s1-s2)` and `d = (s1*k-z1)/r`. Sign the exact string `unlock:<record>` and send the signature to `unlock`.

The repair derives a different, deterministic nonce for every message using RFC 6979.
