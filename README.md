# Uttoron Cultural Rehearsal Booking

GitHub Pages app for coordinators, cultural team, and admins to register, book Samantha Smith Elementary Gym rehearsal slots, and approve requests.

**Live page:** https://rahiakil.github.io/cultural-facility/

**Facility:** Samantha Smith Elementary Gym · 23305 NE 14th St, Sammamish, WA 98074 · [map](https://share.google/C8C33ynszqGr7fR40)

Policy reference: UTT-CULT-001 (summarized in the app).

## Roles

| Role | Can do |
| --- | --- |
| **Coordinator** | Register, create performance groups, request hour slots (limited per group), cancel own requests |
| **Cultural** | Activate coordinators, approve/reject bookings, comment on logistics/props, manage events & sessions, view stats |
| **Admin** | Everything cultural can do, plus delete accounts/bookings, sync file, reset seed |

## Default logins (change after first use)

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin` | Admin |
| `cultural` | `cultural` | Cultural team |

New coordinators register from the landing page. Status starts as **pending** until cultural/admin activates them under **People**.

## How booking works

1. Admin/cultural create an **event** (seeded: **Boishakhi 2027**) and **three-hour rental sessions**.
2. Coordinator creates a **group** under that event (e.g. children’s dance).
3. On **Calendar**, pick open hour slots inside a rental (e.g. 6–7, 7–8, 8–9).
4. Each group has a **max slots** limit (default 4, set per event).
5. Cultural team **Approvals** page approves or rejects; comments cover props/logistics.

## File-based storage (same idea as ticket tracker)

- Browser keeps a local copy of the book JSON.
- **Admin → Download JSON / Import JSON** to move data between devices.
- Optional shared Drive file via Google Apps Script (`scripts/google-record.gs`):
  1. Create a new Apps Script project, paste `scripts/google-record.gs`.
  2. Deploy → Web app → Execute as Me → Who has access: Anyone.
  3. Paste the `/exec` URL into Admin → Sync on the site.

Seed data also ships as `web/live.json` for first load / GitHub Pages.

## Local preview

Open `web/index.html` in a browser, or:

```bash
npx --yes serve web
```

## GitHub Pages

Push `main`; workflow publishes the `web/` folder.
