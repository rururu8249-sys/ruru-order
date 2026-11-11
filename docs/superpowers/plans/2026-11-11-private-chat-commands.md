# Private slash command receipts

User request: slash command text is visible only to its sender; product guides remain public. Multi-selection remains a separate proposed design.

1. Keep command audit/rate-limit rows but insert with hidden_at and hidden_by=command. Return an explicitly private receipt only to the POST caller.
2. Use the existing signed identity endpoint to recover only that identity's command history. Admin privileges alone never reveal someone else's commands. Keep deleted-message review separate.
3. Keep immediate receipts in account/broadcast-scoped client state, clear on logout/account change, label them and disable public pin/moderation actions. Ordinary chat stays unchanged.
4. Add a BEFORE trigger enforcing hidden command rows even from old deployments, then hide existing non-bot slash rows without removing their product guides. Existing public event redaction and RLS remain unchanged.
5. Regression tests: private insert/public guide, author versus other moderator/admin, unauthenticated retrieval, hook refresh/realtime/logout, browser label. Test SQL on temporary rows only. tsc, build/BANKDA guards, independent review, push and Vercel success; update CLAUDE with feature hash.
