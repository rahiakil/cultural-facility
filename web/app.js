const config = window.CULTURAL_FACILITY_CONFIG || {};
const STORE = String(config.storagePrefix || "cultural-facility").replace(/[^\w-]/g, "") || "cultural-facility";
const S = CulturalStore;

function storeKey(name) {
  return `${STORE}-${name}`;
}

const SESSION_KEY = storeKey("session");
const BOOK_KEY = storeKey("book");
const RECORD_KEY = storeKey("record-url");
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

const gate = document.querySelector("#gate");
const policyScreen = document.querySelector("#policy-screen");
const registerScreen = document.querySelector("#register-screen");
const loginScreen = document.querySelector("#login-screen");
const workspace = document.querySelector("#workspace");

let book = null;
let session = null;
let page = "home";
let selectedSlot = null;

const POLICY_HTML = `
<p><strong>Policy UTT-CULT-001</strong> · Cultural rehearsal & facility usage · Samantha Smith Elementary Gym.</p>
<h3>Purpose</h3>
<p>Uttoron promotes Bengali culture and performing arts. Affordable rehearsal space is shared with community cultural groups under school availability and this policy.</p>
<h3>Facility</h3>
<ul>
  <li>Anticipated cost about $70 per three-hour session (setup, rehearsal, cleanup, departure).</li>
  <li>Evening hours; enter only during your authorized window.</li>
  <li>Uttoron books the gym centrally—groups may not extend or transfer bookings.</li>
</ul>
<h3>Eligible activities</h3>
<p>Children’s/youth dance, musical ensembles, Bengali plays, recitation, adult/intergenerational cultural performances. Private commercial classes and unrelated paid instruction are not covered unless approved in writing.</p>
<h3>Group coordinators</h3>
<p>Each group names an adult coordinator who registers with Uttoron, keeps a roster, supervises, and follows safety rules. Forming a group does not guarantee performance selection.</p>
<h3>Booking</h3>
<ul>
  <li>Request at least 14 days ahead when possible; cancel 72 hours ahead when possible.</li>
  <li>Multiple groups may share one three-hour rental in separate hour slots.</li>
  <li>No permanent exclusive priority.</li>
</ul>
<h3>Child safety</h3>
<p>One responsible adult per about ten children (stricter school rules win). Check-in/out to authorized adults only. Report injuries and incidents promptly.</p>
<h3>Conduct</h3>
<p>Authorized areas only; protect floors and property; no smoking, alcohol, flames, weapons, or restricted-area access. Water only in gym unless school permits food.</p>
<h3>Acknowledgment</h3>
<p>“I understand that the rehearsal facility is a shared community resource arranged by Uttoron. I agree to follow the approved schedule, provide appropriate supervision, respect school property, comply with Uttoron’s safety and conduct policies, and communicate these requirements to participating families.”</p>
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
  if (message) setTimeout(() => { if (el.textContent === message) el.hidden = true; }, 4500);
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
  if (!next) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(next));
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
    if (raw && raw.schemaVersion === 1) return S.normalizeBook(raw);
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

function tabsForRole(role) {
  const base = [
    ["home", "Home"],
    ["calendar", "Calendar"],
    ["groups", "Groups"],
    ["bookings", "My bookings"],
  ];
  if (role === "cultural" || role === "admin") {
    base.splice(3, 0, ["approvals", "Approvals"]);
    base.push(["events", "Events"]);
    base.push(["people", "People"]);
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
  const account = currentAccount();
  const eventId = document.querySelector("#cal-event").value;
  let groups = (book.groups || []).filter((g) => g.status === "active" && (!eventId || g.eventId === eventId));
  if (account.role === "coordinator") {
    groups = groups.filter((g) => g.coordinatorUsername === account.username);
  }
  return groups;
}

function fillGroupSelect() {
  const el = document.querySelector("#cal-group");
  const groups = groupsForSelect();
  const previous = el.value;
  el.innerHTML = groups.length
    ? groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("")
    : `<option value="">No groups yet — create one under Groups</option>`;
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

function bookingLabel(booking) {
  const group = S.findGroup(book, booking.groupId);
  const session = S.findSession(book, booking.sessionId);
  const event = S.findEvent(book, booking.eventId);
  return {
    title: group ? group.name : booking.groupId,
    when: session ? `${formatDate(session.date)} · ${booking.slotStart}–${booking.slotEnd}` : `${booking.slotStart}–${booking.slotEnd}`,
    event: event ? event.name : booking.eventId,
  };
}

function renderHome() {
  const account = currentAccount();
  document.querySelector("#who").textContent = `${account.name || account.username}`;
  document.querySelector("#who-role").textContent = S.ROLES.find((r) => r[0] === account.role)?.[1] || account.role;
  document.querySelector("#home-blurb").textContent =
    account.role === "coordinator"
      ? "Create your performance group, request rehearsal hours, and watch approval status."
      : account.role === "cultural"
        ? "Approve coordinator bookings, comment on logistics needs, and keep the shared gym calendar fair."
        : "Full control: events, sessions, people, approvals, sync file, and usage stats.";

  const mine = (book.bookings || []).filter((b) => {
    if (account.role === "coordinator") {
      const g = S.findGroup(book, b.groupId);
      return g && g.coordinatorUsername === account.username;
    }
    return b.status === "pending";
  });
  const pending = (book.bookings || []).filter((b) => b.status === "pending").length;
  const approved = (book.bookings || []).filter((b) => b.status === "approved").length;
  const groups = (book.groups || []).filter((g) => account.role !== "coordinator" || g.coordinatorUsername === account.username).length;
  document.querySelector("#home-stats").innerHTML = `
    <div class="stat"><span class="muted">Pending</span><strong>${pending}</strong></div>
    <div class="stat"><span class="muted">Approved</span><strong>${approved}</strong></div>
    <div class="stat"><span class="muted">Groups</span><strong>${groups}</strong></div>
    <div class="stat"><span class="muted">Events</span><strong>${(book.events || []).length}</strong></div>
  `;
  const list = document.querySelector("#home-pending");
  const rows = mine.slice(0, 8);
  list.innerHTML = rows.length
    ? rows.map((b) => {
      const info = bookingLabel(b);
      return `<div class="card"><h3>${escapeHtml(info.title)} <span class="badge ${b.status}">${b.status}</span></h3><p class="meta">${escapeHtml(info.event)} · ${escapeHtml(info.when)} · ${b.kidsCount} participants</p></div>`;
    }).join("")
    : `<p class="muted">No recent bookings to show.</p>`;
}

function renderCalendar() {
  fillEventSelects();
  fillGroupSelect();
  const eventId = document.querySelector("#cal-event").value;
  const sessions = (book.sessions || [])
    .filter((s) => s.eventId === eventId && s.status === "open")
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const event = S.findEvent(book, eventId);
  const max = event ? event.maxSlotsPerGroup : 4;
  const groupId = document.querySelector("#cal-group").value;
  const used = groupId ? S.activeBookingsForGroup(book, groupId).length : 0;
  const host = document.querySelector("#cal-sessions");
  if (!sessions.length) {
    host.innerHTML = `<p class="muted">No open sessions for this event yet. Admin/cultural can add rental evenings under Events.</p>`;
    return;
  }
  host.innerHTML = `<p class="note">Active slots for this group: ${used} / ${max}</p>` + sessions.map((session) => {
    const slots = S.hourSlots(session.start, session.end);
    const buttons = slots.map((slot) => {
      const taken = S.slotTaken(book, session.id, slot.start);
      const mine = (book.bookings || []).find(
        (b) => b.sessionId === session.id && b.slotStart === slot.start && (b.status === "pending" || b.status === "approved")
      );
      const selected = selectedSlot && selectedSlot.sessionId === session.id && selectedSlot.slotStart === slot.start;
      const who = mine ? S.findGroup(book, mine.groupId) : null;
      const label = taken
        ? `${slot.start}–${slot.end} · ${mine.status}${who ? ` · ${who.name}` : ""}`
        : `${slot.start}–${slot.end} · available`;
      return `<button type="button" class="slot-btn${taken ? " taken" : ""}${mine && mine.groupId === groupId ? " mine" : ""}${selected ? " selected" : ""}" data-session="${session.id}" data-start="${slot.start}" ${taken ? "disabled" : ""}>${escapeHtml(label)}</button>`;
    }).join("");
    return `<div class="card"><h3>${escapeHtml(formatDate(session.date))}</h3><p class="meta">${session.start}–${session.end} rental${session.notes ? ` · ${escapeHtml(session.notes)}` : ""}</p><div class="slot-grid">${buttons}</div><div class="actions"><button type="button" class="btn-orange book-slot" data-session="${session.id}">Request selected hour</button></div></div>`;
  }).join("");

  host.querySelectorAll(".slot-btn:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSlot = { sessionId: btn.dataset.session, slotStart: btn.dataset.start };
      renderCalendar();
    });
  });
  host.querySelectorAll(".book-slot").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!selectedSlot || selectedSlot.sessionId !== btn.dataset.session) {
        flash("Select an available hour in this session first.", true);
        return;
      }
      const groupIdNow = document.querySelector("#cal-group").value;
      if (!groupIdNow) {
        flash("Create or select a group first.", true);
        return;
      }
      const result = await mutateBook((b) => S.createBooking(b, {
        groupId: groupIdNow,
        sessionId: selectedSlot.sessionId,
        slotStart: selectedSlot.slotStart,
        kidsCount: document.querySelector("#cal-kids").value,
        pointOfContact: document.querySelector("#cal-poc").value,
        specialRequirements: document.querySelector("#cal-reqs").value,
      }, session.username));
      flash(result.message, !result.ok);
      selectedSlot = null;
      renderPage();
    });
  });
}

function renderGroups() {
  fillEventSelects();
  document.querySelector("#grp-coord-wrap").hidden = !(can("cultural"));
  const account = currentAccount();
  let groups = book.groups || [];
  if (account.role === "coordinator") groups = groups.filter((g) => g.coordinatorUsername === account.username);
  const host = document.querySelector("#group-list");
  host.innerHTML = groups.length ? groups.map((g) => {
    const event = S.findEvent(book, g.eventId);
    const active = S.activeBookingsForGroup(book, g.id).length;
    return `<div class="card">
      <h3>${escapeHtml(g.name)} <span class="badge ${g.status}">${g.status}</span></h3>
      <p class="meta">${escapeHtml(event ? event.name : g.eventId)} · ${escapeHtml(g.type)} · coord ${escapeHtml(g.coordinatorUsername || "—")} · ${g.participantEstimate || 0} est. · ${active} active slots</p>
      <p class="meta">${escapeHtml(g.specialRequirements || "No special requirements noted.")}</p>
      <div class="actions">
        ${can("admin") || (account.role === "coordinator" && g.coordinatorUsername === account.username) ? `<button type="button" class="btn-danger" data-del-group="${g.id}">Delete</button>` : ""}
      </div>
    </div>`;
  }).join("") : `<p class="muted">No groups yet.</p>`;
  host.querySelectorAll("[data-del-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this group?")) return;
      const result = await mutateBook((b) => S.deleteGroup(b, btn.dataset.delGroup, session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function renderApprovals() {
  const pending = (book.bookings || []).filter((b) => b.status === "pending");
  const host = document.querySelector("#approval-list");
  host.innerHTML = pending.length ? pending.map((b) => bookingCard(b, true)).join("") : `<p class="muted">No pending requests.</p>`;
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
  host.innerHTML = list.length ? list.map((b) => bookingCard(b, can("cultural"))).join("") : `<p class="muted">No bookings yet.</p>`;
  wireBookingActions(host);
}

function bookingCard(b, manage) {
  const info = bookingLabel(b);
  const comments = (b.comments || []).map((c) => `<li><strong>${escapeHtml(c.by)}</strong> · ${escapeHtml(c.text)}<br><span class="muted">${escapeHtml(c.at)}</span></li>`).join("");
  return `<div class="card" data-booking="${b.id}">
    <h3>${escapeHtml(info.title)} <span class="badge ${b.status}">${b.status}</span></h3>
    <p class="meta">${escapeHtml(info.event)} · ${escapeHtml(info.when)}</p>
    <p class="meta">${b.kidsCount} participants · POC ${escapeHtml(b.pointOfContact || "—")} · by ${escapeHtml(b.requestedBy)}</p>
    <p class="meta">${escapeHtml(b.specialRequirements || "No special requirements.")}</p>
    ${comments ? `<ul class="comments">${comments}</ul>` : ""}
    ${manage ? `<label>Comment / logistics note<textarea data-comment="${b.id}"></textarea></label>
      <div class="actions">
        ${b.status === "pending" ? `<button type="button" class="btn-teal" data-approve="${b.id}">Approve</button><button type="button" class="btn-danger" data-reject="${b.id}">Reject</button>` : ""}
        <button type="button" class="btn-quiet" data-add-comment="${b.id}">Add comment</button>
        ${can("admin") ? `<button type="button" class="btn-danger" data-delete-booking="${b.id}">Delete</button>` : ""}
        ${b.status === "pending" || b.status === "approved" ? `<button type="button" class="btn-quiet" data-cancel="${b.id}">Cancel</button>` : ""}
      </div>` : `${b.status === "pending" || b.status === "approved" ? `<div class="actions"><button type="button" class="btn-quiet" data-cancel="${b.id}">Cancel my request</button></div>` : ""}`}
  </div>`;
}

function wireBookingActions(host) {
  host.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const note = host.querySelector(`[data-comment="${btn.dataset.approve}"]`)?.value || "";
      const result = await mutateBook((b) => S.setBookingStatus(b, btn.dataset.approve, "approved", session.username, note));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const note = host.querySelector(`[data-comment="${btn.dataset.reject}"]`)?.value || "";
      const result = await mutateBook((b) => S.setBookingStatus(b, btn.dataset.reject, "rejected", session.username, note));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.setBookingStatus(b, btn.dataset.cancel, "cancelled", session.username, "Cancelled"));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-add-comment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const note = host.querySelector(`[data-comment="${btn.dataset.addComment}"]`)?.value || "";
      const result = await mutateBook((b) => S.addBookingComment(b, btn.dataset.addComment, note, session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-delete-booking]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this booking?")) return;
      const result = await mutateBook((b) => S.deleteBooking(b, btn.dataset.deleteBooking, session.username));
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
        <h3>${escapeHtml(formatDate(s.date))} · ${s.start}–${s.end}</h3>
        <p class="meta">${escapeHtml(s.notes || "")}</p>
        <div class="actions"><button type="button" class="btn-danger" data-del-session="${s.id}">Remove session</button></div>
      </div>`).join("") || `<p class="muted">No sessions yet.</p>`;
    return `<div class="card">
      <h3>${escapeHtml(event.name)} <span class="badge ${event.status}">${event.status}</span></h3>
      <p class="meta">Max ${event.maxSlotsPerGroup} slots/group · ${escapeHtml(event.description || "")}</p>
      <div class="actions">
        <button type="button" class="btn-quiet" data-toggle-event="${event.id}">${event.status === "open" ? "Close event" : "Reopen event"}</button>
      </div>
      ${sessionHtml}
    </div>`;
  }).join("") || `<p class="muted">No events.</p>`;
  host.querySelectorAll("[data-toggle-event]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const event = S.findEvent(book, btn.dataset.toggleEvent);
      const result = await mutateBook((b) => S.updateEvent(b, event.id, { status: event.status === "open" ? "closed" : "open" }, session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-del-session]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this rental session?")) return;
      const result = await mutateBook((b) => S.deleteSession(b, btn.dataset.delSession, session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function renderPeople() {
  const host = document.querySelector("#people-list");
  const accounts = (book.accounts || []).slice().sort((a, b) => a.username.localeCompare(b.username));
  host.innerHTML = accounts.map((a) => `
    <div class="card">
      <h3>${escapeHtml(a.username)} <span class="badge ${a.status}">${a.status}</span> · ${escapeHtml(a.role)}</h3>
      <p class="meta">${escapeHtml(a.name || "")} · ${escapeHtml(a.email || "no email")} · ${escapeHtml(a.phone || "")}</p>
      <div class="actions">
        ${a.status !== "active" ? `<button type="button" class="btn-teal" data-activate="${a.username}">Activate</button>` : ""}
        ${a.status === "active" ? `<button type="button" class="btn-quiet" data-disable="${a.username}">Disable</button>` : ""}
        ${can("admin") && a.username !== "admin" ? `<button type="button" class="btn-danger" data-delete-user="${a.username}">Delete</button>` : ""}
      </div>
    </div>`).join("");
  host.querySelectorAll("[data-activate]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.setAccountStatus(b, btn.dataset.activate, "active", session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-disable]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await mutateBook((b) => S.setAccountStatus(b, btn.dataset.disable, "disabled", session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
  host.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete ${btn.dataset.deleteUser}?`)) return;
      const result = await mutateBook((b) => S.deleteAccount(b, btn.dataset.deleteUser, session.username));
      flash(result.message, !result.ok);
      renderPage();
    });
  });
}

function renderStats() {
  const days = Number(document.querySelector("#stats-window").value || 30);
  const data = S.stats(book, days);
  document.querySelector("#stats-grid").innerHTML = `
    <div class="stat"><span class="muted">Sessions in window</span><strong>${data.sessionsBooked}</strong></div>
    <div class="stat"><span class="muted">Hour slots available</span><strong>${data.availableSlots}</strong></div>
    <div class="stat"><span class="muted">Approved usage</span><strong>${data.usedSlots}</strong></div>
    <div class="stat"><span class="muted">Unused capacity</span><strong>${data.unusedSlots}</strong></div>
    <div class="stat"><span class="muted">Utilization</span><strong>${data.utilization}%</strong></div>
    <div class="stat"><span class="muted">Requests</span><strong>${data.bookingCount}</strong></div>
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
    ? "Record link saved. Pull/Push syncs the shared Google file (ticket-tracker style)."
    : "Using local browser storage. Download/upload JSON to move data between devices, or paste a Google Apps Script /exec URL.";
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
  if (page === "stats") renderStats();
  if (page === "admin") renderAdmin();
}

async function enterWorkspace() {
  await ensureBook();
  const account = currentAccount();
  if (!account || account.status !== "active") {
    saveSession(null);
    show(gate);
    flash("Account is not active yet.", true);
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
  show(gate);
});

document.querySelector("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const err = document.querySelector("#register-error");
  err.hidden = true;
  await ensureBook();
  const hash = await sha256(document.querySelector("#reg-password").value);
  const result = await mutateBook((b) => S.registerAccount(b, {
    username: document.querySelector("#reg-username").value,
    name: document.querySelector("#reg-name").value,
    email: document.querySelector("#reg-email").value,
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
  const account = S.findAccount(book, username);
  const digest = await sha256(password);
  if (!account || account.hash !== digest) {
    err.textContent = "Username or password is wrong.";
    err.hidden = false;
    return;
  }
  if (account.status !== "active") {
    err.textContent = account.status === "pending"
      ? "Registration is pending cultural team activation."
      : "This account is disabled.";
    err.hidden = false;
    return;
  }
  saveSession({ username: account.username, role: account.role, exp: Date.now() + SESSION_MS });
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
    type: document.querySelector("#grp-type").value,
    ageGroups: document.querySelector("#grp-ages").value,
    participantEstimate: document.querySelector("#grp-count").value,
    contactName: document.querySelector("#grp-contact").value || account.name,
    contactPhone: document.querySelector("#grp-phone").value || account.phone,
    contactEmail: document.querySelector("#grp-email").value || account.email,
    specialRequirements: document.querySelector("#grp-reqs").value,
    coordinatorUsername: coord,
  }, account.username));
  flash(result.message, !result.ok);
  if (result.ok) event.target.reset();
  renderPage();
});

document.querySelector("#event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!can("cultural")) return;
  const result = await mutateBook((b) => S.createEvent(b, {
    name: document.querySelector("#evt-name").value,
    maxSlotsPerGroup: document.querySelector("#evt-max").value,
    description: document.querySelector("#evt-desc").value,
  }, session.username));
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
  }, session.username));
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
  const result = await mutateBook((b) => S.upsertAccount(b, payload, session.username));
  flash(result.message, !result.ok);
  renderPage();
});

document.querySelector("#cal-event").addEventListener("change", () => {
  selectedSlot = null;
  fillGroupSelect();
  renderCalendar();
});
document.querySelector("#cal-group").addEventListener("change", () => {
  selectedSlot = null;
  fillGroupSelect();
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
  } catch (error) {
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
    flash("Pushed local book to shared record (no-cors; verify in Drive).");
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
  flash("Reset to seed data.");
  renderPage();
});

(async function boot() {
  const maps = document.querySelector("#facility-maps");
  if (maps && config.facilityMapsUrl) {
    maps.href = config.facilityMapsUrl;
    maps.textContent = config.facilityAddress || maps.textContent;
  }
  await ensureBook();
  session = loadSession();
  if (session) {
    const account = S.findAccount(book, session.username);
    if (account && account.status === "active") await enterWorkspace();
    else {
      saveSession(null);
      show(gate);
    }
  } else show(gate);
})();
