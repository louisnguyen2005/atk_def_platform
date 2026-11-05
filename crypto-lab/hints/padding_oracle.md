# 02 · Padding Oracle

1. Use `{"op":"targets"}` and request `{"op":"ciphertext","record":"<record>"}`.
2. The ciphertext contains a 16-byte IV followed by AES-CBC blocks. Flip bytes of the previous block, then ask `{"op":"decrypt","record":"<record>","ciphertext":"<hex>"}`. Observe which error means valid PKCS#7 padding and which means invalid document content.
3. Recover each plaintext block from right to left, changing the previous block to force padding values 1 through 16. XOR the recovered bytes with the original previous block.

The repair adds an HMAC over the record and ciphertext and checks it before decrypting. Do not compare the CBC padding while the MAC is invalid.
