-- Adds staff.pin_length, so the PIN pad can submit itself the moment the last
-- digit is typed instead of asking for a confirming tap.
--
-- Why the length has to be stored: a PIN is 4 to 6 digits and only its hash is
-- kept, so nothing else on the device knows when the user has finished
-- typing. The alternative is re-deriving the hash on every keystroke from the
-- fourth digit onward, which at 210,000 PBKDF2 iterations is roughly half a
-- second of work per attempt on a phone -- three times over, on every login.
--
-- What this gives away: that a PIN is 4, 5, or 6 digits long. Set against a
-- keyspace of 10,000 for the shortest case, and a PIN that is explicitly an
-- attribution check rather than a security boundary (ARCHITECTURE.md D4), that
-- is not a meaningful reduction. It is written down here so it stays a
-- decision rather than a detail nobody weighed.
--
-- Nullable on purpose. Rows written before this migration have no recorded
-- length, and the app falls back to a confirm button for them rather than
-- guessing 4 and locking out anyone with a longer PIN. The value is filled in
-- the next time that person's PIN is set.

alter table staff
  add column pin_length smallint check (pin_length between 4 and 6);

comment on column staff.pin_length is
  'Digit count of the PIN behind pin_hash. Lets the PIN pad auto-submit. Null for rows predating this column.';
