-- Removes staff.pin_length, added one migration ago in 0002.
--
-- 0002 existed so the PIN pad could know when the user had finished typing,
-- because a PIN was 4 to 6 digits and only its hash was stored. PINs are now
-- fixed at exactly 6 digits, so the length is a constant in the app and the
-- column earns nothing. An unused column is a thing future readers have to
-- work out, so it goes.
--
-- If you have not created the Supabase project yet, run neither 0002 nor this
-- one -- 0001 plus a six-digit PIN rule is the whole story. `if exists` makes
-- this safe to run either way.

alter table staff drop column if exists pin_length;
