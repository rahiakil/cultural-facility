const config = window.CULTURAL_FACILITY_CONFIG || {};
const STORE = String(config.storagePrefix || "cultural-facility").replace(/[^\w-]/g, "") || "cultural-facility";
const S = CulturalStore;

function storeKey(name) {
  return `${STORE}-v2-${name}`;
}

const SESSION_KEY = storeKey("session");
const ALIAS_KEY = storeKey("alias");
const BOOK_KEY = storeKey("book");
const RECORD_KEY = storeKey("record-url");
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const nowCal = new Date();
let calView = { year: nowCal.getFullYear(), month: nowCal.getMonth() };
let selectedCalDate = "";

const gate = document.querySelector("#gate");
const policyScreen = document.querySelector("#policy-screen");
const registerScreen = document.querySelector("#register-screen");
const loginScreen = document.querySelector("#login-screen");
const workspace = document.querySelector("#workspace");

let book = null;
let session = null;
let page = "home";
let draftPrefs = [];

const POLICY_HTML = `
<p><strong>Policy UTT-CULT-001</strong> · Cultural rehearsal & facility usage · Samantha Smith Elementary Gym.</p>
<h3>Purpose</h3>
<p>Uttoron promotes Bengali culture and performing arts. Affordable rehearsal space is shared with community cultural groups under school availability and this policy.</p>
<h3>Facility</h3>
<ul>
  <li>Evening hours 6–9 PM; preferences in 15-minute steps.</li>
  <li>Uttoron books the gym centrally when cultural sees enough demand—groups may not extend or transfer bookings.</li>
  <li>Facility evenings are capped for the year; cultural team sees the session counter when approving times.</li>
</ul>
<h3>Eligible activities</h3>
<p>Children’s/youth dance, musical ensembles, Bengali plays, recitation, adult/intergenerational cultural performances.</p>
<h3>Group coordinators</h3>
<p>Register with email/username. Cultural must approve your account before you can create a team or submit preferences. Each team includes a comment naming the event/program.</p>
<h3>Child safety &amp; conduct</h3>
<p>Adult supervision, authorized areas only, protect school property. Report incidents promptly.</p>
`;

function show(el) {
  [gate, policyScreen, registerScreen, loginScreen, workspace].forEach((node) => {
    if (node) node.hidden = node !== el;
  });
}

function flash(message, bad) {
  const el = document.querySelector("#flash");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
  el.className = bad ? "result bad" : "result ok";
  if (message) setTimeout(() => { if (el.textContent === message) el.hidden = true; }, 5000);
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!saved || !saved.username || !saved.exp || saved.exp < Date.now()) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveSession(next) {
  session = next;
  if (!next) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  if (next.displayName) localStorage.setItem(ALIAS_KEY, next.displayName);
}

function actor() {
  if (!session) return "unknown";
  const name = String(session.displayName || localStorage.getItem(ALIAS_KEY) || "").trim();
  return name ? `${name} (${session.username})` : session.username;
}

function recordUrlValue() {
  return CulturalRecord.recordUrl(config.recordUrl || localStorage.getItem(RECORD_KEY) || "");
}

function persistBookLocal() {
  localStorage.setItem(BOOK_KEY, JSON.stringify(book));
}

function loadBookLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOK_KEY) || "null");
    if (raw && (raw.schemaVersion === 1 || raw.schemaVersion === 2)) return S.normalizeBook(raw);
  } catch { /* ignore */ }
  return null;
}

async function loadLiveSeed() {
  try {
    const response = await fetch(`live.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return S.normalizeBook(await response.json());
  } catch {
    return null;
  }
}

async function ensureBook() {
  if (book) return book;
  const local = loadBookLocal();
  if (local && (local.accounts || []).length) {
    book = local;
    return book;
  }
  const seed = await loadLiveSeed();
  book = seed || S.seedBook();
  persistBookLocal();
  return book;
}

async function mutateBook(fn, options = {}) {
  await ensureBook();
  const url = recordUrlValue();
  if (url && options.remote !== false) {
    const result = await CulturalRecord.commit({ recordUrl: url }, (remote) => {
      const changed = fn(remote);
      if (!changed || changed.ok === false) return { write: false, message: (changed && changed.message) || "No change.", book: remote };
      return { write: true, message: changed.message || "Saved.", book: remote };
    });
    if (result.ok) {
      book = S.normalizeBook(result.book);
      persistBookLocal();
      return { ok: true, message: result.message };
    }
    if (!options.allowLocalFallback) return { ok: false, message: result.message };
  }
  const copy = S.normalizeBook(JSON.parse(JSON.stringify(book)));
  const changed = fn(copy);
  if (!changed || changed.ok === false) return { ok: false, message: (changed && changed.message) || "No change." };
  book = copy;
  persistBookLocal();
  return { ok: true, message: changed.message || "Saved." };
}

function currentAccount() {
  if (!session || !book) return null;
  return S.findAccount(book, session.username);
}

function can(roleNeeded) {
  const account = currentAccount();
  if (!account || account.status !== "active") return false;
  if (roleNeeded === "coordinator") return true;
  if (roleNeeded === "cultural") return account.role === "cultural" || account.role === "admin";
  if (roleNeeded === "admin") return account.role === "admin";
  return false;
}

function myGroups() {
  const account = currentAccount();
  let groups = book.groups || [];
  if (account.role === "coordinator") {
    groups = groups.filter((g) => g.coordinatorUsername === account.username && g.status === "active");
  }
  return groups;
}

function tabsForRole(role) {
  const base = [
    ["home", "Home"],
    ["groups", "My team"],
    ["calendar", "Calendar"],
    ["bookings", "My prefs"],
  ];
  if (role === "cultural" || role === "admin") {
    base.splice(3, 0, ["approvals", "Demand"]);
    base.push(["events", "Events"]);
    base.push(["people", "People"]);
    base.push(["log", "Log"]);
    base.push(["stats", "Stats"]);
  }
  if (role === "admin") base.push(["admin", "Admin"]);
  return base;
}

function renderTabs() {
  const account = currentAccount();
  const tabs = document.querySelector("#page-tabs");
  tabs.innerHTML = "";
  tabsForRole(account.role).forEach(([id, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = id === page ? "btn-teal active" : "btn-quiet";
    btn.textContent = label;
    btn.addEventListener("click", () => showPage(id));
    tabs.append(btn);
  });
}

function showPage(id) {
  page = id;
  document.querySelectorAll("[data-page]").forEach((panel) => {
    panel.hidden = panel.getAttribute("data-page") !== id;
  });
  renderTabs();
  renderPage();
}

function fillEventSelects() {
  const events = (book.events || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  ["#cal-event", "#grp-event", "#sess-event"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const previous = el.value;
    el.innerHTML = events.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.status === "closed" ? " (closed)" : ""}</option>`).join("");
    if (previous && events.some((e) => e.id === previous)) el.value = previous;
  });
}

function groupsForSelect() {
  const eventId = document.querySelector("#cal-event").value;
  return myGroups().filter((g) => !eventId || g.eventId === eventId);
}

function fillGroupSelect() {
  const el = document.querySelector("#cal-group");
  const groups = groupsForSelect();
  const previous = el.value;
  el.innerHTML = groups.length
    ? groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("")
    : `<option value="">Create a team first (My team)</option>`;
  if (previous && groups.some((g) => g.id === previous)) el.value = previous;
  const group = S.findGroup(book, el.value);
  if (group) {
    document.querySelector("#cal-kids").value = group.participantEstimate || 0;
    document.querySelector("#cal-poc").value = group.contactName || group.coordinatorUsername || "";
    document.querySelector("#cal-reqs").value = group.specialRequirements || "";
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date) {
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return date;
  }
}

function formatDuration(mins) {
  if (mins % 60 === 0) return `${mins / 60}h`;
  if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins} min`;
}

function bookingWhen(b) {
  return `${formatDate(b.date)} · ${b.start}–${b.end} (${formatDuration(b.durationMinutes || 0)})`;
}

function renderHome() {
  const account = currentAccount();
  const alias = session.displayName || account.name || account.username;
  document.querySelector("#who").textContent = `${alias} · ${account.username}`;
  document.querySelector("#who-role").textContent = S.ROLES.find((r) => r[0] === account.role)?.[1] || account.role;
  const teams = myGroups().length;
  document.querySelector("#home-blurb").textContent =
    account.role === "coordinator"
      ? teams
        ? "Submit preferred evenings on Calendar. When cultural books the gym and approves you, those dates light up green."
        : "First create your team under My team (include a comment for the event/program). Then open Calendar to pick preferred dates."
      : "Review demand by evening. When enough preferences arrive, book the 6–9 PM facility rental and approve teams so their calendars light up.";

  const pendingPeople = (book.accounts || []).filter((a) => a.status === "pending").length;
  const pendingPrefs = (book.bookings || []).filter((b) => b.status === "pending").length;
  const approved = (book.bookings || []).filter((b) => {
    if (b.status !== "approved") return false;
    if (account.role !== "coordinator") return true;
    const g = S.findGroup(book, b.groupId);
    return g && g.coordinatorUsername === account.username;
  }).length;
  const years = new Set((book.sessions || []).map((s) => S.yearFromDate(s.date)));
  years.add(new Date().getFullYear());
  const counterStats = can("cultural")
    ? [...years].sort().map((y) => {
      const u = S.yearSessionUsage(book, y);
      return `<div class="stat${u.atLimit ? " at-limit" : ""}"><span class="muted">${y} sessions</span><strong>${u.used} / ${u.max}</strong></div>`;
    }).join("")
    : `<div class="stat"><span class="muted">Your teams</span><strong>${teams}</strong></div>`;
  document.querySelector("#home-stats").innerHTML = `
    <div class="stat"><span class="muted">Pending logins</span><strong>${pendingPeople}</strong></div>
    <div class="stat"><span class="muted">Pending prefs</span><strong>${pendingPrefs}</strong></div>
    <div class="stat"><span class="muted">Approved (lit)</span><strong>${approved}</strong></div>
    ${counterStats}
  `;

  let rows = book.bookings || [];
  if (account.role === "coordinator") {
    rows = rows.filter((b) => {
      const g = S.findGroup(book, b.groupId);
      return g && g.coordinatorUsername === account.username;
    });
  } else {
    rows = rows.filter((b) => b.status === "pending");
  }
  rows = rows.slice(0, 8);
  document.querySelector("#home-pending").innerHTML = rows.length
    ? rows.map((b) => {
      const g = S.findGroup(book, b.groupId);
      return `<div class="card"><h3>${escapeHtml(g ? g.name : b.groupId)} <span class="badge ${b.status}">${b.status}</span></h3><p class="meta">${escapeHtml(bookingWhen(b))}</p></div>`;
    }).join("")
    : `<p class="muted">Nothing waiting right now.</p>`;
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function bookingsForDate(date, eventId) {
  const account = currentAccount();
  return (book.bookings || []).filter((b) => {
    if (b.date !== date) return false;
    if (eventId && b.eventId !== eventId) return false;
    const g = S.findGroup(book, b.groupId);
    if (account.role === "coordinator") {
      return g && g.coordinatorUsername === account.username;
    }
    return true;
  });
}

function renderMonthGrid() {
  const host = document.querySelector("#month-grid");
  const label = document.querySelector("#cal-month-label");
  const eventId = document.querySelector("#cal-event")?.value;
  const year = calView.year;
  const month = calView.month;
  label.textContent = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const sessions = (book.sessions || []).filter((s) => !eventId || s.eventId === eventId);
  const byDate = {};
  sessions.forEach((s) => { byDate[s.date] = s; });

  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = dows.map((d) => `<div class="month-dow">${d}</div>`).join("");
  for (let i = 0; i < firstDow; i += 1) html += `<button type="button" class="month-cell outside" disabled></button>`;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(year, month, day);
    const sess = byDate[key];
    const prefs = bookingsForDate(key, eventId);
    const approved = prefs.some((b) => b.status === "approved");
    const pending = prefs.some((b) => b.status === "pending");
    const booked = sess && (sess.facilityBooked || sess.status === "booked");
    const classes = ["month-cell"];
    if (sess) classes.push("open-eve");
    if (booked) classes.push("booked");
    if (approved) classes.push("lit");
    else if (pending) classes.push("pending-day");
    if (selectedCalDate === key) classes.push("selected");
    const marks = [];
    if (sess) marks.push(booked ? "booked" : "open");
    if (approved) marks.push("approved");
    else if (pending) marks.push("pending");
    html += `<button type="button" class="${classes.join(" ")}" data-cal-date="${key}" ${sess ? "" : ""}>
      <span class="num">${day}</span>
      <span class="marks">${escapeHtml(marks.join(" · ") || "—")}</span>
    </button>`;
  }
  host.innerHTML = html;
  host.querySelectorAll("[data-cal-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCalDate = btn.dataset.calDate;
      renderCalendar();
      const card = document.querySelector(`[data-session-card][data-date="${selectedCalDate}"], [data-session-card]`);
      const match = document.querySelector(`[data-session-date="${selectedCalDate}"]`);
      if (match) match.scrollIntoView({ behavior: "smooth", block: "nearest" });
      else if (card) {/* stay */}
    });
  });

  const detail = document.querySelector("#cal-day-detail");
  if (!selectedCalDate) {
    detail.textContent = "Select a day on the calendar. Use Previous / Next to move through every month.";
    return;
  }
  const sess = byDate[selectedCalDate] || (book.sessions || []).find((s) => s.date === selectedCalDate && (!eventId || s.eventId === eventId));
  const prefs = bookingsForDate(selectedCalDate, eventId);
  if (!sess && !prefs.length) {
    detail.textContent = `${formatDate(selectedCalDate)} — no preference evening configured for this event. Cultural/admin can add it under Events.`;
    return;
  }
  const prefText = prefs.length
    ? prefs.map((b) => `${b.start}–${b.end} (${b.status})`).join("; ")
    : "no preferences yet";
  detail.innerHTML = `<strong>${escapeHtml(formatDate(selectedCalDate))}</strong> · ${sess ? `${sess.start}–${sess.end}` : ""} · ${escapeHtml(prefText)}`;
}

function renderDraftList() {
  const host = document.querySelector("#draft-list");
  if (!draftPrefs.length) {
    host.className = "muted";
    host.textContent = "None yet — pick start time and length on evenings below, then Add.";
    return;
  }
  host.className = "list";
  host.innerHTML = draftPrefs.map((d, index) => `
    <div class="card">
      <h3>${escapeHtml(formatDate(d.date))} · ${d.start}–${d.end}</h3>
      <p class="meta">${formatDuration(d.durationMinutes)}</p>
      <div class="actions"><button type="button" class="btn-quiet" data-drop-draft="${index}">Remove</button></div>
    </div>`).join("");
  host.querySelectorAll("[data-drop-draft]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draftPrefs.splice(Number(btn.dataset.dropDraft), 1);
      renderDraftList();
    });
  });
}

function renderCalendar() {
  fillEventSelects();
  fillGroupSelect();
  renderMonthGrid();
  renderDraftList();

  const eventId = document.querySelector("#cal-event").value;
  const groupId = document.querySelector("#cal-group").value;
  let sessions = (book.sessions || [])
    .filter((s) => s.eventId === eventId && (s.status === "open" || s.status === "booked"))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (selectedCalDate) {
    const focused = sessions.filter((s) => s.date === selectedCalDate);
    if (focused.length) sessions = focused.concat(sessions.filter((s) => s.date !== selectedCalDate));
  }
  const event = S.findEvent(book, eventId);
  const max = event ? event.maxSlotsPerGroup : 6;
  const used = groupId ? S.activeBookingsForGroup(book, groupId).length : 0;
  const host = document.querySelector("#cal-sessions");

  if (!can("cultural") && !myGroups().length) {
    host.innerHTML = `<p class="muted">Create your team under <strong>My team</strong> first (with a program comment). Then return here to pick preferred dates.</p>`;
    return;
  }
  if (!sessions.length) {
    host.innerHTML = `<p class="muted">No preference evenings yet for this event. Cultural/admin adds 6–9 PM dates under Events. Use the month grid above to browse all dates.</p>`;
    return;
  }

  host.innerHTML = `<p class="note">Active preferences for this team: ${used} / ${max}. Times are 15‑minute steps inside 6–9 PM.</p>` + sessions.map((sess) => {
    const starts = S.startOptions(sess, 60);
    const startOpts = starts.map((t) => `<option value="${t}">${t}</option>`).join("");
    const bookedBadge = sess.facilityBooked || sess.status === "booked"
      ? `<span class="badge approved">facility booked</span>`
      : `<span class="badge open">collecting prefs</span>`;
    const highlight = selectedCalDate === sess.date ? " style=\"outline:2px solid var(--orange)\"" : "";
    return `<div class="card" data-session-card="${sess.id}" data-session-date="${sess.date}"${highlight}>
      <h3>${escapeHtml(formatDate(sess.date))} ${bookedBadge}</h3>
      <p class="meta">${sess.start}–${sess.end}${sess.notes ? ` · ${escapeHtml(sess.notes)}` : ""}</p>
      <div class="pref-row">
        <label>Preferred start
          <select data-start="${sess.id}">${startOpts}</select>
        </label>
        <label>How long
          <select data-dur="${sess.id}"></select>
        </label>
        <button type="button" class="btn-teal" data-add-pref="${sess.id}">Add</button>
      </div>
    </div>`;
  }).join("");

  host.querySelectorAll("[data-start]").forEach((sel) => {
    const sid = sel.dataset.start;
    const sess = S.findSession(book, sid);
    const durSel = host.querySelector(`[data-dur="${sid}"]`);
    function refillDur() {
      const options = S.durationOptions(sess, sel.value);
      durSel.innerHTML = options.map((d) => `<option value="${d}" ${d === 60 ? "selected" : ""}>${formatDuration(d)}</option>`).join("");
    }
    refillDur();
    sel.addEventListener("change", refillDur);
  });

  host.querySelectorAll("[data-add-pref]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!groupId) {
        flash("Select your team first.", true);
        return;
      }
      const sid = btn.dataset.addPref;
      const sess = S.findSession(book, sid);
      const start = host.querySelector(`[data-start="${sid}"]`).value;
      const durationMinutes = Number(host.querySelector(`[data-dur="${sid}"]`).value);
      const end = S.fromMinutes(S.toMinutes(start) + durationMinutes);
      if (draftPrefs.some((d) => d.sessionId === sid && d.start === start && d.durationMinutes === durationMinutes)) {
        flash("That preference is already in your list.", true);
        return;
      }
      draftPrefs.push({ sessionId: sid, date: sess.date, start, end, durationMinutes });
      renderDraftList();
      flash(`Added ${formatDate(sess.date)} ${start}–${end}`);
    });
  });
}

function renderGroups() {
  fillEventSelects();
  document.querySelector("#grp-coord-wrap").hidden = !can("cultural");
  const account = currentAccount();
  let groups = book.groups || [];
  if (account.role === "coordinator") groups = groups.filter((g) => g.coordinatorUsername === account.username);
  const host = document.querySelector("#group-list");
  host.innerHTML = groups.length ? groups.map((g) => {
    const event = S.findEvent(book, g.eventId);
    const active = S.activeBookingsForGroup(book, g.id).length;
    return `<div class="card">
      <h3>${escapeHtml(g.name)} <span class="badge ${g.status}">${g.status}</span></h3>
      <p class="meta">${escapeHtml(event ? event.name : g.eventId)} · ${escapeHtml(g.type)} · ${active} active prefs</p>
      <p class="meta"><strong>Program comment:</strong> ${escapeHtml(g.programComment || "—")}</p>
      <div class="actions">
        ${can("admin") || (account.role === "coordinator" && g.coordinatorUsername === account.username)
          ? `<button type="button" class="btn-danger" data-del-group="${g.id}">Delete</button>` : ""}
      </div>
    </div>`;
  }).join("") : `<p class="muted">No team yet. Create one above so you can submit date preferences.</p>`;
  host.querySelectorAll("[data-del-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this team?")) return;
      const result = await mutateBook((b) => S.deleteGroup(b, btn.dataset.delGroup, actor()));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function renderSessionCounter(focusYear) {
  const host = document.querySelector("#session-counter");
  if (!host) return null;
  const years = new Set((book.sessions || []).map((s) => S.yearFromDate(s.date)));
  years.add(focusYear || new Date().getFullYear());
  const sorted = [...years].sort();
  host.innerHTML = sorted.map((year) => {
    const usage = S.yearSessionUsage(book, year);
    return `<div class="stat${usage.atLimit ? " at-limit" : ""}">
      <span class="muted">${year} facility sessions</span>
      <strong>${usage.used} / ${usage.max}</strong>
      <span class="muted">${usage.remaining} remaining</span>
    </div>`;
  }).join("");
  return S.yearSessionUsage(book, focusYear || sorted[sorted.length - 1]);
}

function renderApprovals() {
  const demandHost = document.querySelector("#demand-list");
  const demand = S.demandByDate(book, null);
  const sessions = book.sessions || [];
  renderSessionCounter();

  if (!demand.length && !sessions.length) {
    demandHost.innerHTML = `<p class="muted">No preferences yet.</p>`;
  } else {
    const dates = new Set([
      ...demand.map((d) => d.date),
      ...sessions.map((s) => s.date),
    ]);
    demandHost.innerHTML = [...dates].sort().map((date) => {
      const row = demand.find((d) => d.date === date) || { pending: 0, approved: 0, total: 0 };
      const sess = sessions.find((s) => s.date === date);
      const booked = sess && (sess.facilityBooked || sess.status === "booked");
      const usage = S.yearSessionUsage(book, S.yearFromDate(date));
      const blockBook = !booked && usage.atLimit;
      return `<div class="card">
        <h3>${escapeHtml(formatDate(date))}</h3>
        <p class="meta">${sess ? `${sess.start}–${sess.end}` : "no evening configured"} · pending <span class="demand-count">${row.pending || 0}</span> · approved ${row.approved || 0}</p>
        <p class="meta">Year counter: ${usage.label}</p>
        <div class="actions">
          ${sess && !booked && !blockBook ? `<button type="button" class="btn-orange" data-book-facility="${sess.id}">Book facility evening</button>` : ""}
          ${blockBook ? `<span class="badge rejected">yearly limit reached</span>` : ""}
          ${booked ? `<span class="badge approved">facility booked</span>` : ""}
        </div>
      </div>`;
    }).join("");
  }

  demandHost.querySelectorAll("[data-book-facility]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.bookFacilitySession(b, btn.dataset.bookFacility, actor(), "School rental confirmed by cultural team"));
      flash(result.message, !result.ok);
      renderPage();
    });
  });

  const pending = (book.bookings || []).filter((b) => b.status === "pending");
  const host = document.querySelector("#approval-list");
  host.innerHTML = pending.length ? pending.map((b) => bookingCard(b, true)).join("") : `<p class="muted">No pending preferences.</p>`;
  wireBookingActions(host);
}

function renderBookings() {
  const account = currentAccount();
  let list = book.bookings || [];
  if (account.role === "coordinator") {
    list = list.filter((b) => {
      const g = S.findGroup(book, b.groupId);
      return g && g.coordinatorUsername === account.username;
    });
  }
  list = list.slice().sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  const host = document.querySelector("#booking-list");
  host.innerHTML = list.length ? list.map((b) => bookingCard(b, can("cultural"))).join("") : `<p class="muted">No preferences yet.</p>`;
  wireBookingActions(host);
}

function bookingCard(b, manage) {
  const g = S.findGroup(book, b.groupId);
  const event = S.findEvent(book, b.eventId);
  const comments = (b.comments || []).map((c) => `<li><strong>${escapeHtml(c.by)}</strong> · ${escapeHtml(c.text)}</li>`).join("");
  return `<div class="card" data-booking="${b.id}">
    <h3>${escapeHtml(g ? g.name : b.groupId)} <span class="badge ${b.status}">${b.status}</span></h3>
    <p class="meta">${escapeHtml(event ? event.name : "")} · ${escapeHtml(bookingWhen(b))}</p>
    <p class="meta">${b.kidsCount} participants · POC ${escapeHtml(b.pointOfContact || "—")}</p>
    <p class="meta">${escapeHtml((g && g.programComment) || "")}</p>
    <p class="meta">${escapeHtml(b.specialRequirements || "No special requirements.")}</p>
    ${comments ? `<ul class="comments">${comments}</ul>` : ""}
    ${manage ? `<label>Comment<textarea data-comment="${b.id}"></textarea></label>
      <div class="actions">
        ${b.status === "pending" ? `<button type="button" class="btn-teal" data-approve="${b.id}">Approve time (counts session)</button><button type="button" class="btn-danger" data-reject="${b.id}">Reject</button>` : ""}
        <button type="button" class="btn-quiet" data-add-comment="${b.id}">Add comment</button>
        ${can("admin") ? `<button type="button" class="btn-danger" data-delete-booking="${b.id}">Delete</button>` : ""}
        ${b.status === "pending" || b.status === "approved" ? `<button type="button" class="btn-quiet" data-cancel="${b.id}">Cancel</button>` : ""}
      </div>` : `${b.status === "pending" || b.status === "approved" ? `<div class="actions"><button type="button" class="btn-quiet" data-cancel="${b.id}">Cancel my preference</button></div>` : ""}`}
  </div>`;
}

function wireBookingActions(host) {
  host.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const note = host.querySelector(`[data-comment="${btn.dataset.approve}"]`)?.value || "";
      const result = await mutateBook((b) => S.setBookingStatus(b, btn.dataset.approve, "approved", actor(), note));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const note = host.querySelector(`[data-comment="${btn.dataset.reject}"]`)?.value || "";
      const result = await mutateBook((b) => S.setBookingStatus(b, btn.dataset.reject, "rejected", actor(), note));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.setBookingStatus(b, btn.dataset.cancel, "cancelled", actor(), "Cancelled"));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-add-comment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const note = host.querySelector(`[data-comment="${btn.dataset.addComment}"]`)?.value || "";
      const result = await mutateBook((b) => S.addBookingComment(b, btn.dataset.addComment, note, actor()));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-delete-booking]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this preference?")) return;
      const result = await mutateBook((b) => S.deleteBooking(b, btn.dataset.deleteBooking, actor()));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function renderEvents() {
  fillEventSelects();
  const host = document.querySelector("#event-list");
  host.innerHTML = (book.events || []).map((event) => {
    const sessions = (book.sessions || []).filter((s) => s.eventId === event.id);
    const sessionHtml = sessions.map((s) => `
      <div class="card" style="margin-top:8px">
        <h3>${escapeHtml(formatDate(s.date))} · ${s.start}–${s.end}
          ${s.facilityBooked || s.status === "booked" ? `<span class="badge approved">booked</span>` : `<span class="badge open">prefs</span>`}
        </h3>
        <p class="meta">${escapeHtml(s.notes || "")}</p>
        <div class="actions"><button type="button" class="btn-danger" data-del-session="${s.id}">Remove evening</button></div>
      </div>`).join("") || `<p class="muted">No evenings yet.</p>`;
    return `<div class="card">
      <h3>${escapeHtml(event.name)} <span class="badge ${event.status}">${event.status}</span></h3>
      <p class="meta">Max ${event.maxSlotsPerGroup} prefs/team · ${escapeHtml(event.description || "")}</p>
      <div class="actions">
        <button type="button" class="btn-quiet" data-toggle-event="${event.id}">${event.status === "open" ? "Close event" : "Reopen event"}</button>
      </div>
      ${sessionHtml}
    </div>`;
  }).join("") || `<p class="muted">No events.</p>`;
  host.querySelectorAll("[data-toggle-event]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const event = S.findEvent(book, btn.dataset.toggleEvent);
      const result = await mutateBook((b) => S.updateEvent(b, event.id, { status: event.status === "open" ? "closed" : "open" }, actor()));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-del-session]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this evening?")) return;
      const result = await mutateBook((b) => S.deleteSession(b, btn.dataset.delSession, actor()));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function canManageAccount(target) {
  if (!target) return false;
  if (can("admin")) return true;
  if (can("cultural")) return target.role === "coordinator";
  return false;
}

function renderPeople() {
  const roleSelect = document.querySelector("#ppl-role");
  if (roleSelect) {
    if (can("admin")) {
      roleSelect.innerHTML = `
        <option value="coordinator">Coordinator</option>
        <option value="cultural">Cultural</option>
        <option value="admin">Admin</option>`;
    } else {
      roleSelect.innerHTML = `<option value="coordinator">Coordinator</option>`;
    }
  }
  const host = document.querySelector("#people-list");
  const accounts = (book.accounts || []).slice().sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return a.username.localeCompare(b.username);
  });
  host.innerHTML = accounts.map((a) => {
    const manage = canManageAccount(a);
    const reinstate = manage && a.status === "disabled";
    const approve = manage && a.status === "pending";
    const disable = manage && a.status === "active";
    return `<div class="card">
      <h3>${escapeHtml(a.username)} <span class="badge ${a.status}">${a.status}</span> · ${escapeHtml(a.role)}</h3>
      <p class="meta">${escapeHtml(a.name || "")} · ${escapeHtml(a.email || "no email")} · ${escapeHtml(a.phone || "")}</p>
      <div class="actions">
        ${approve ? `<button type="button" class="btn-teal" data-activate="${a.username}">Approve login</button>` : ""}
        ${reinstate ? `<button type="button" class="btn-teal" data-activate="${a.username}">Reinstate</button>` : ""}
        ${disable ? `<button type="button" class="btn-quiet" data-disable="${a.username}">Disable</button>` : ""}
        ${!manage && (a.role === "cultural" || a.role === "admin") ? `<span class="muted">Protected account</span>` : ""}
        ${can("admin") && a.username !== "admin" ? `<button type="button" class="btn-danger" data-delete-user="${a.username}">Delete</button>` : ""}
      </div>
    </div>`;
  }).join("");
  host.querySelectorAll("[data-activate]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.setAccountStatus(b, btn.dataset.activate, "active", actor(), { actorRole: currentAccount().role }));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-disable]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.setAccountStatus(b, btn.dataset.disable, "disabled", actor(), { actorRole: currentAccount().role }));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete ${btn.dataset.deleteUser}?`)) return;
      const result = await mutateBook((b) => S.deleteAccount(b, btn.dataset.deleteUser, actor()));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function renderLog() {
  const host = document.querySelector("#log-list");
  const rows = (book.log || []).slice(0, 200);
  host.innerHTML = rows.length
    ? rows.map((row) => `<div class="card"><h3>${escapeHtml(row.action)}</h3><p class="meta">${escapeHtml(row.at)} · ${escapeHtml(row.actor)}</p><p class="meta">${escapeHtml(row.detail)}</p></div>`).join("")
    : `<p class="muted">No log entries yet.</p>`;
}

function renderStats() {
  const days = Number(document.querySelector("#stats-window").value || 30);
  const data = S.stats(book, days);
  const year = new Date().getFullYear();
  const usage = S.yearSessionUsage(book, year);
  const nextYearUsage = S.yearSessionUsage(book, year + 1);
  document.querySelector("#stats-grid").innerHTML = `
    <div class="stat"><span class="muted">${usage.year} session counter</span><strong>${usage.used} / ${usage.max}</strong></div>
    <div class="stat"><span class="muted">${usage.year} remaining</span><strong>${usage.remaining}</strong></div>
    <div class="stat"><span class="muted">${nextYearUsage.year} booked</span><strong>${nextYearUsage.used} / ${nextYearUsage.max}</strong></div>
    <div class="stat"><span class="muted">Evenings offered</span><strong>${data.sessionsBooked}</strong></div>
    <div class="stat"><span class="muted">Prefs approved</span><strong>${data.usedSlots}</strong></div>
    <div class="stat"><span class="muted">All requests</span><strong>${data.bookingCount}</strong></div>
  `;
  const body = document.querySelector("#stats-coords");
  const entries = Object.entries(data.byCoordinator).sort((a, b) => b[1].total - a[1].total);
  body.innerHTML = entries.length
    ? entries.map(([name, row]) => `<tr><td>${escapeHtml(name)}</td><td>${row.total}</td><td>${row.approved || 0}</td><td>${row.pending || 0}</td><td>${row.rejected || 0}</td></tr>`).join("")
    : `<tr><td colspan="5">No coordinator activity in this window.</td></tr>`;
}

function renderAdmin() {
  document.querySelector("#record-url").value = recordUrlValue();
  document.querySelector("#sync-status").textContent = recordUrlValue()
    ? "Active store: Google Apps Script Drive file (plus a local browser cache). Activity log is inside that JSON book."
    : "Active store: this browser’s localStorage. Use Download JSON to save the full book (accounts, prefs, log). Optional: paste Apps Script /exec URL to sync a Drive file across phones.";
}

function renderPage() {
  if (!book || !session) return;
  if (page === "home") renderHome();
  if (page === "calendar") renderCalendar();
  if (page === "groups") renderGroups();
  if (page === "approvals") renderApprovals();
  if (page === "bookings") renderBookings();
  if (page === "events") renderEvents();
  if (page === "people") renderPeople();
  if (page === "log") renderLog();
  if (page === "stats") renderStats();
  if (page === "admin") renderAdmin();
}

async function enterWorkspace() {
  await ensureBook();
  const account = currentAccount();
  if (!account || account.status !== "active") {
    saveSession(null);
    show(gate);
    flash("Account is not active yet. Wait for cultural approval.", true);
    return;
  }
  show(workspace);
  page = "home";
  showPage("home");
}

document.querySelector("#show-register").addEventListener("click", () => show(registerScreen));
document.querySelector("#show-login").addEventListener("click", () => show(loginScreen));
document.querySelector("#show-policy").addEventListener("click", () => {
  document.querySelector("#policy-body").innerHTML = POLICY_HTML;
  show(policyScreen);
});
document.querySelector("#policy-back").addEventListener("click", () => show(gate));
document.querySelector("#register-back").addEventListener("click", () => show(gate));
document.querySelector("#login-back").addEventListener("click", () => show(gate));
document.querySelector("#logout").addEventListener("click", () => {
  saveSession(null);
  draftPrefs = [];
  show(gate);
});

document.querySelector("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const err = document.querySelector("#register-error");
  err.hidden = true;
  await ensureBook();
  const email = document.querySelector("#reg-email").value.trim();
  let username = document.querySelector("#reg-username").value.trim();
  if (!username && email) username = email;
  const hash = await sha256(document.querySelector("#reg-password").value);
  const result = await mutateBook((b) => S.registerAccount(b, {
    username,
    name: document.querySelector("#reg-name").value,
    email,
    phone: document.querySelector("#reg-phone").value,
    hash,
    policyAck: document.querySelector("#reg-policy").checked,
  }, "self"), { allowLocalFallback: true });
  if (!result.ok) {
    err.textContent = result.message;
    err.hidden = false;
    return;
  }
  flash(result.message);
  show(loginScreen);
});

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const err = document.querySelector("#login-error");
  err.hidden = true;
  await ensureBook();
  const username = document.querySelector("#username").value;
  const password = document.querySelector("#password").value;
  const displayName = document.querySelector("#display-name").value.trim();
  if (!displayName) {
    err.textContent = "Enter your name for the activity log.";
    err.hidden = false;
    return;
  }
  const account = S.findAccount(book, username);
  const digest = await sha256(password);
  if (!account || account.hash !== digest) {
    err.textContent = "Login or password is wrong.";
    err.hidden = false;
    return;
  }
  if (account.status !== "active") {
    err.textContent = account.status === "pending"
      ? "Cultural team has not approved your account yet. You cannot book until then."
      : "This account is disabled. Ask cultural or admin to reinstate you.";
    err.hidden = false;
    return;
  }
  saveSession({
    username: account.username,
    role: account.role,
    displayName,
    exp: Date.now() + SESSION_MS,
  });
  await mutateBook((b) => {
    S.pushLog(b, "login", `${displayName} (${account.username})`, `Signed in as ${account.role}`);
    return { ok: true, message: "Logged in." };
  }, { allowLocalFallback: true });
  await enterWorkspace();
});

document.querySelector("#group-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const account = currentAccount();
  const coord = can("cultural")
    ? (document.querySelector("#grp-coord").value || account.username)
    : account.username;
  const result = await mutateBook((b) => S.createGroup(b, {
    eventId: document.querySelector("#grp-event").value,
    name: document.querySelector("#grp-name").value,
    programComment: document.querySelector("#grp-program").value,
    type: document.querySelector("#grp-type").value,
    ageGroups: document.querySelector("#grp-ages").value,
    participantEstimate: document.querySelector("#grp-count").value,
    contactName: document.querySelector("#grp-contact").value || account.name,
    contactPhone: document.querySelector("#grp-phone").value || account.phone,
    contactEmail: document.querySelector("#grp-email").value || account.email,
    specialRequirements: document.querySelector("#grp-reqs").value,
    coordinatorUsername: coord,
  }, actor()));
  flash(result.message, !result.ok);
  if (result.ok) {
    event.target.reset();
    showPage("calendar");
    return;
  }
  renderPage();
});

document.querySelector("#submit-prefs").addEventListener("click", async () => {
  const groupId = document.querySelector("#cal-group").value;
  if (!groupId) {
    flash("Select your team first.", true);
    return;
  }
  if (!draftPrefs.length) {
    flash("Add at least one preferred evening first.", true);
    return;
  }
  const result = await mutateBook((b) => S.createPreferences(b, {
    groupId,
    kidsCount: document.querySelector("#cal-kids").value,
    pointOfContact: document.querySelector("#cal-poc").value,
    specialRequirements: document.querySelector("#cal-reqs").value,
    preferences: draftPrefs,
  }, actor()));
  flash(result.message, !result.ok);
  if (result.ok) {
    draftPrefs = [];
    renderPage();
  }
});

document.querySelector("#clear-drafts").addEventListener("click", () => {
  draftPrefs = [];
  renderDraftList();
});

document.querySelector("#event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!can("cultural")) return;
  const result = await mutateBook((b) => S.createEvent(b, {
    name: document.querySelector("#evt-name").value,
    maxSlotsPerGroup: document.querySelector("#evt-max").value,
    description: document.querySelector("#evt-desc").value,
  }, actor()));
  flash(result.message, !result.ok);
  if (result.ok) event.target.reset();
  renderPage();
});

document.querySelector("#session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!can("cultural")) return;
  const result = await mutateBook((b) => S.createSession(b, {
    eventId: document.querySelector("#sess-event").value,
    date: document.querySelector("#sess-date").value,
    start: document.querySelector("#sess-start").value,
    end: document.querySelector("#sess-end").value,
    notes: document.querySelector("#sess-notes").value,
  }, actor()));
  flash(result.message, !result.ok);
  renderPage();
});

document.querySelector("#people-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!can("cultural")) return;
  const password = document.querySelector("#ppl-password").value;
  const payload = {
    username: document.querySelector("#ppl-username").value,
    role: document.querySelector("#ppl-role").value,
    name: document.querySelector("#ppl-name").value,
    email: document.querySelector("#ppl-email").value,
    status: document.querySelector("#ppl-status").value,
  };
  if (password) payload.hash = await sha256(password);
  if (payload.role === "admin" && !can("admin")) {
    flash("Only admin can create admin accounts.", true);
    return;
  }
  const result = await mutateBook((b) => S.upsertAccount(b, payload, actor(), { actorRole: currentAccount().role }));
  flash(result.message, !result.ok);
  renderPage();
});

document.querySelector("#cal-event").addEventListener("change", () => {
  draftPrefs = [];
  selectedCalDate = "";
  fillGroupSelect();
  renderCalendar();
});
document.querySelector("#cal-group").addEventListener("change", () => renderCalendar());
document.querySelector("#cal-prev").addEventListener("click", () => {
  calView.month -= 1;
  if (calView.month < 0) {
    calView.month = 11;
    calView.year -= 1;
  }
  renderCalendar();
});
document.querySelector("#cal-next").addEventListener("click", () => {
  calView.month += 1;
  if (calView.month > 11) {
    calView.month = 0;
    calView.year += 1;
  }
  renderCalendar();
});
document.querySelector("#stats-window").addEventListener("change", renderStats);

document.querySelector("#save-record-url").addEventListener("click", () => {
  const url = CulturalRecord.recordUrl(document.querySelector("#record-url").value);
  if (!url && document.querySelector("#record-url").value.trim()) {
    flash("That does not look like a Google Apps Script /exec URL.", true);
    return;
  }
  localStorage.setItem(RECORD_KEY, url);
  flash(url ? "Sync link saved on this browser." : "Sync link cleared.");
  renderAdmin();
});

document.querySelector("#pull-record").addEventListener("click", async () => {
  const url = recordUrlValue();
  if (!url) {
    flash("Save a record link first.", true);
    return;
  }
  try {
    const remote = await CulturalRecord.loadWithScript(url);
    book = S.normalizeBook(remote);
    persistBookLocal();
    flash("Pulled shared record.");
    renderPage();
  } catch {
    flash("Could not pull record.", true);
  }
});

document.querySelector("#push-record").addEventListener("click", async () => {
  const url = recordUrlValue();
  if (!url) {
    flash("Save a record link first.", true);
    return;
  }
  await ensureBook();
  book.lastWriteId = `${Date.now()}`;
  try {
    await CulturalRecord.postWithForm(url, book);
    flash("Pushed local book to shared record.");
  } catch {
    flash("Push failed.", true);
  }
});

document.querySelector("#export-file").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(book, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `cultural-facility-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    book = S.normalizeBook(JSON.parse(text));
    persistBookLocal();
    flash(`Imported ${file.name}.`);
    renderPage();
  } catch {
    flash("Could not import that file.", true);
  }
  event.target.value = "";
});

document.querySelector("#reset-seed").addEventListener("click", async () => {
  if (!can("admin")) return;
  if (!confirm("Replace all local data with the Boishakhi 2027 seed?")) return;
  book = S.seedBook();
  persistBookLocal();
  draftPrefs = [];
  flash("Reset to seed data.");
  renderPage();
});

(async function boot() {
  const maps = document.querySelector("#facility-maps");
  if (maps && config.facilityMapsUrl) {
    maps.href = config.facilityMapsUrl;
    const name = config.facilityName || "Samantha Smith Elementary";
    const address = config.facilityAddress || "";
    maps.textContent = address ? `${name.replace(/ Gym$/i, "")} · ${address}` : name.replace(/ Gym$/i, "");
  }
  await ensureBook();
  const savedAlias = localStorage.getItem(ALIAS_KEY) || "";
  if (savedAlias && document.querySelector("#display-name")) {
    document.querySelector("#display-name").value = savedAlias;
  }
  session = loadSession();
  if (session) {
    if (!session.displayName && savedAlias) session.displayName = savedAlias;
    const account = S.findAccount(book, session.username);
    if (account && account.status === "active") await enterWorkspace();
    else {
      saveSession(null);
      show(gate);
    }
  } else show(gate);
})();
