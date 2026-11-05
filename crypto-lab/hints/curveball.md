# 01 · Curveball

1. Ask for `{"op":"ca"}`. Compare the returned curve order, generator `G`, and public key `Q`.
2. Ask for a target with `{"op":"targets"}`. A record tells you which flag certificate you want to read.
3. The verifier checks the signature against a generator supplied in your request. If it trusted the CA public point as that generator, what scalar would produce a signature under `Q`? Send the role, record, chosen point and signature to `{"op":"read", ...}`.

Useful math: if `G' = Q`, the scalar-1 signing key under `G'` has public key `Q`. The repair compares the supplied generator with the named P-256 generator before signature verification.
