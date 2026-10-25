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

1. Coordinator **registers** (email as login works). Status is **pending** until cultural approves — no booking until then.
2. After approval, coordinator creates a **team** with a required **program comment** (which event/segment).
3. Admin/cultural publish candidate **6–9 PM evenings** under an event (seeded: **Boishakhi 2027**).
4. Coordinator picks **multiple preferred dates**, each with start time and length in **15-minute** steps inside 6–9 PM, then submits them all.
5. Cultural **Demand** page shows preference demand. Approving a time (or booking the evening) updates the **yearly facility session counter** (cap **28 / year**). Approved dates **light up green** on the coordinator calendar. Usage cost is internal only and is not shown in the app.

## File-based storage (same idea as ticket tracker)

**Where the live data is**

| Place | What it is |
| --- | --- |
| Browser **localStorage** | Default working copy on each phone/laptop (includes full activity `log`) |
| **Download JSON** (Admin) | Portable file of the whole book — accounts, events, prefs, log |
| Google Drive via Apps Script | Optional shared file so cultural/admin see the same data |
| `web/live.json` on GitHub Pages | Seed only — not updated by bookings |

Optional shared Drive file (`scripts/google-record.gs`):

1. Create a new Apps Script project, paste `scripts/google-record.gs`.
2. Deploy → Web app → Execute as Me → Who has access: Anyone.
3. Paste the `/exec` URL into Admin → Sync on the site.

Cultural can approve / disable / reinstate **coordinators only** (not cultural or admin). Login always asks for a **display name** used in the activity log.

## Local preview

Open `web/index.html` in a browser, or:

```bash
npx --yes serve web
```

## GitHub Pages

Push `main`; workflow publishes the `web/` folder.
