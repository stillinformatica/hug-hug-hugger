# Architecture rules
- Administrative access requires the designated owner's immutable auth ID, a protected role, and AAL2 MFA in both database policies and Edge Functions; enrollment remains accessible before AAL2 to prevent lockout.
- Privileged Edge Functions validate the caller with the shared server-side guard; decoded token claims alone cannot authorize operations.
- Orders are created only by payment functions using catalog prices and verified shipping quotes; browsers cannot create or change payment state.
- Payment webhooks retrieve authoritative provider records and match stored identifiers and amounts before updating orders.
- Marketplace publishing must use authorized seller APIs and confirmed real product data; missing access or media blocks publication rather than inventing content.