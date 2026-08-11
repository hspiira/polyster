# Registration redesign

Date: 2026-08-11
Status: implemented
Scope: the landing screen and everything it leads to. Supersedes parts of
`2026-07-30-entry-flow-redesign-design.md`.

## Why

The five-step wizard asked a new owner for eight screens, eighteen digit taps
and a wait on an SMS before they had seen anything the app does. Almost none of
it was needed yet:

- The **PIN** was chosen and confirmed, twelve taps, guarding an empty database.
- **Measurements** were picked before any client existed. `ClientDetail` already
  re-offers the same setup the first time someone is measured.
- **Install** was a full screen standing between the owner and the app.
- **Phone and code** were required up front, so registering needed a signal, on
  an app whose whole premise is working without one.

## The rule

Registration asks for the two things that have no sensible default. Everything
else is offered at the moment it becomes true.

## Decisions

| # | Decision | Supersedes | Why |
|---|---|---|---|
| R1 | Two weighted doors: "Set up my shop" primary, "I already have a shop" quiet | E9 | Only the backend knows what a number maps to, but the person knows whether they are starting or returning. Asking them is what lets a new shop skip verification and register offline. |
| R2 | Registration is one screen: shop name and your name | Setup steps 1–5 | Both appear in things clients see. Nothing else has to be true before the first order. |
| R3 | No PIN at registration. `staff.pin_hash` is nullable; no hash means no lock screen | Setup step 4 | It guarded nothing. Set from Settings → Lock this phone, or from the prompt after the first order. |
| R4 | Measurements dropped from setup entirely | Setup step 5 | `ClientDetail` already shows an empty state pointing at `/settings/measurements`. |
| R5 | Install is a dismissible prompt in the shell, after the first order | E8 | Same "once they know what the app is" reasoning, without a screen in the way. |
| R6 | The number is claimed later, from a standing line plus one prompt after the first order | E3 | Backing up is worth asking for once there is something to lose. |

## Flows

```
New shop      Landing → Your shop → APP                    (2 screens, no signal needed)
Returning     Landing → Phone → Code → (pull) → PIN → APP  (unchanged)
Claim later   Prompt or sync line → Phone → Code → claimShop()
```

## Consequences

**Unclaimed shops are now the normal state, not an edge case.** `SyncBadge`
gains an "Only on this phone" state that is permanently visible and links to
Backup. `claimShop` refuses when the shop already belongs to a different
account rather than overwriting it, but the two-shops-on-one-number case from
ARCHITECTURE D14 is still unreconciled and is now more likely to be reached.

**A shop can have no lock.** `isLocked` returns false when no staff row has a
hash, and `app.tsx` then opens the device as the only person on it so orders
still get attributed. This knowingly reintroduces finding F3, but as a state the
app says out loud and offers to fix, rather than a silent permanent one.

**E14 (sign-out wipes local data) is now more dangerous** and should block on an
unclaimed shop. Not addressed here.

## Still open

- E14 above.
- The claim-conflict resolution D14 describes as "minimum viable" is now on the
  main path and still unbuilt.
