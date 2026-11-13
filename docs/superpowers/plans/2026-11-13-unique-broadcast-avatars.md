# Unique broadcast avatars

Latest owner correction supersedes duplicate-permitted v1 slots. No need for 5,000 simultaneous photos. Each broadcast reserves one actual photo per identity until it ends. Re-entry keeps that reservation; old history resolves the same profile. Different system nickname identities have 30 distinct reserved photos and never borrow customer images. Remove repeated celebrity/character/logo subject families, plus near-identical square crops.

Implementation: immutable v2 catalog with a one-to-one customer index mapping, no modulo or alternate-photo fallback. DB serializes allocation per broadcast and enforces unique (broadcast_id, avatar_id). Backfill ON broadcasts and update their existing public message IDs atomically. Completed broadcasts retain old v1 presentation via a catalog version marker. An exhausted photo pool must show an identity-specific text fallback, never reuse a photo or block an order/chat. Preserve private originals and signed identity checks.

Validation: reproduce existing duplicated slots; catalog URL/family/hash disjointness; database simultaneous-style reservation, same-identity reentry, history update, broadcast separation, exhausted-pool fallback; UI renderer no borrowed images; anonymous/private regressions; TypeScript/build; deployment and production uniqueness query plus browser screenshot.
