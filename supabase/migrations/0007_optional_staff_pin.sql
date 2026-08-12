-- Lets a staff row exist before anyone has chosen a PIN.
--
-- The PIN is a device-unlock credential, not auth (src/lib/pin.ts) -- RLS still
-- scopes every synced byte by the shop's account. A null hash means this device
-- has no lock yet. Existing rows keep their hash.

alter table staff alter column pin_hash drop not null;
