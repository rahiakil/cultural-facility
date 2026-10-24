(function (root) {
  const ROLES = [
    ["coordinator", "Coordinator"],
    ["cultural", "Cultural team"],
    ["admin", "Admin"],
  ];

  const BOOKING_STATUSES = ["pending", "approved", "rejected", "cancelled"];

  function emptyBook() {
    return {
      schemaVersion: 1,
      facility: {
        name: "Samantha Smith Elementary Gym",
        address: "23305 NE 14th St, Sammamish, WA 98074",
        mapsUrl: "https://share.google/C8C33ynszqGr7fR40",
        sessionCost: 70,
        sessionHours: 3,
      },
      settings: {
        defaultMaxSlotsPerGroup: 4,
        recommendAdultPerKids: 10,
        cancelNoticeHours: 72,
        requestLeadDays: 14,
      },
      accounts: [],
      events: [],
      sessions: [],
      groups: [],
      bookings: [],
      log: [],
      lastWriteId: "",
    };
  }

  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function cleanText(value, max) {
    return String(value || "").trim().slice(0, max || 200);
  }

  function cleanUsername(value) {
    return cleanText(value, 40).toLowerCase().replace(/[^a-z0-9._-]/g, "");
  }

  function pushLog(book, action, actor, detail) {
    book.log = Array.isArray(book.log) ? book.log : [];
    book.log.unshift({
      id: newId("log"),
      at: nowIso(),
      action,
      actor: cleanText(actor, 60),
      detail: cleanText(detail, 400),
    });
    if (book.log.length > 500) book.log.length = 500;
  }

  function findAccount(book, username) {
    const key = cleanUsername(username);
    return (book.accounts || []).find((a) => a.username === key) || null;
  }

  function findEvent(book, eventId) {
    return (book.events || []).find((e) => e.id === eventId) || null;
  }

  function findGroup(book, groupId) {
    return (book.groups || []).find((g) => g.id === groupId) || null;
  }

  function findSession(book, sessionId) {
    return (book.sessions || []).find((s) => s.id === sessionId) || null;
  }

  function findBooking(book, bookingId) {
    return (book.bookings || []).find((b) => b.id === bookingId) || null;
  }

  function activeBookingsForGroup(book, groupId) {
    return (book.bookings || []).filter(
      (b) => b.groupId === groupId && (b.status === "pending" || b.status === "approved")
    );
  }

  function slotTaken(book, sessionId, slotStart, ignoreId) {
    return (book.bookings || []).some(
      (b) =>
        b.sessionId === sessionId &&
        b.slotStart === slotStart &&
        (b.status === "pending" || b.status === "approved") &&
        b.id !== ignoreId
    );
  }

  function hourSlots(start, end) {
    const [sh, sm] = String(start).split(":").map(Number);
    const [eh, em] = String(end).split(":").map(Number);
    const slots = [];
    let h = sh;
    let m = sm || 0;
    const endMin = eh * 60 + (em || 0);
    while (h * 60 + m + 60 <= endMin) {
      const nextH = m + 60 >= 60 ? h + 1 : h;
      const nextM = (m + 60) % 60;
      const from = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const to = `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
      slots.push({ start: from, end: to });
      h = nextH;
      m = nextM;
    }
    return slots;
  }

  function seedBook() {
    const book = emptyBook();
    book.accounts = [
      {
        username: "admin",
        hash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
        role: "admin",
        name: "Site Admin",
        email: "",
        phone: "",
        status: "active",
        createdAt: nowIso(),
      },
      {
        username: "cultural",
        hash: "7e2215a75ae991148f955d8773ac7819e7c361789d89654f93d11c5be50de550",
        role: "cultural",
        name: "Cultural Coordination",
        email: "",
        phone: "",
        status: "active",
        createdAt: nowIso(),
      },
    ];
    const eventId = "boishakhi-2027";
    book.events = [
      {
        id: eventId,
        name: "Boishakhi 2027",
        description: "Uttoron Boishakhi cultural performances. Rehearsals at Samantha Smith Elementary Gym.",
        status: "open",
        maxSlotsPerGroup: 4,
        createdAt: nowIso(),
      },
    ];
    const sampleDates = ["2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22", "2027-03-29", "2027-04-05"];
    book.sessions = sampleDates.map((date, index) => ({
      id: `sess-${eventId}-${index + 1}`,
      eventId,
      date,
      start: "18:00",
      end: "21:00",
      notes: "Three-hour school rental · setup, rehearsal, cleanup included",
      status: "open",
      createdAt: nowIso(),
    }));
    pushLog(book, "seed", "system", "Seeded Boishakhi 2027 and default accounts");
    return book;
  }

  function registerAccount(book, input, actor) {
    const username = cleanUsername(input.username);
    if (!username || username.length < 3) return { ok: false, message: "Username needs at least 3 letters." };
    if (findAccount(book, username)) return { ok: false, message: "That username is already taken." };
    if (!input.hash) return { ok: false, message: "Password is required." };
    const name = cleanText(input.name, 80);
    if (!name) return { ok: false, message: "Name is required." };
    const account = {
      username,
      hash: String(input.hash),
      role: "coordinator",
      name,
      email: cleanText(input.email, 120),
      phone: cleanText(input.phone, 40),
      status: "pending",
      createdAt: nowIso(),
      policyAckAt: input.policyAck ? nowIso() : "",
    };
    book.accounts.push(account);
    pushLog(book, "register", actor || username, `Registered ${username}`);
    return { ok: true, message: "Registration submitted. Cultural team will activate your login.", account };
  }

  function setAccountStatus(book, username, status, actor) {
    const account = findAccount(book, username);
    if (!account) return { ok: false, message: "Account not found." };
    if (!["active", "pending", "disabled"].includes(status)) return { ok: false, message: "Bad status." };
    account.status = status;
    pushLog(book, "account-status", actor, `${username} → ${status}`);
    return { ok: true, message: `Updated ${username}.`, account };
  }

  function upsertAccount(book, input, actor) {
    const username = cleanUsername(input.username);
    if (!username) return { ok: false, message: "Username required." };
    let account = findAccount(book, username);
    const role = ["coordinator", "cultural", "admin"].includes(input.role) ? input.role : "coordinator";
    if (!account) {
      if (!input.hash) return { ok: false, message: "Password required for new account." };
      account = {
        username,
        hash: String(input.hash),
        role,
        name: cleanText(input.name, 80) || username,
        email: cleanText(input.email, 120),
        phone: cleanText(input.phone, 40),
        status: input.status || "active",
        createdAt: nowIso(),
        policyAckAt: "",
      };
      book.accounts.push(account);
      pushLog(book, "account-create", actor, `Created ${username} (${role})`);
      return { ok: true, message: `Created ${username}.`, account };
    }
    if (input.hash) account.hash = String(input.hash);
    if (input.name != null) account.name = cleanText(input.name, 80) || account.name;
    if (input.email != null) account.email = cleanText(input.email, 120);
    if (input.phone != null) account.phone = cleanText(input.phone, 40);
    if (input.role) account.role = role;
    if (input.status) account.status = input.status;
    pushLog(book, "account-update", actor, `Updated ${username}`);
    return { ok: true, message: `Saved ${username}.`, account };
  }

  function deleteAccount(book, username, actor) {
    const key = cleanUsername(username);
    if (key === "admin") return { ok: false, message: "Cannot delete the built-in admin." };
    const before = book.accounts.length;
    book.accounts = book.accounts.filter((a) => a.username !== key);
    if (book.accounts.length === before) return { ok: false, message: "Account not found." };
    book.groups.forEach((g) => {
      if (g.coordinatorUsername === key) g.coordinatorUsername = "";
    });
    pushLog(book, "account-delete", actor, `Deleted ${key}`);
    return { ok: true, message: `Deleted ${key}.` };
  }

  function createEvent(book, input, actor) {
    const name = cleanText(input.name, 120);
    if (!name) return { ok: false, message: "Event name required." };
    const id = cleanText(input.id, 60) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (findEvent(book, id)) return { ok: false, message: "Event id already exists." };
    const event = {
      id,
      name,
      description: cleanText(input.description, 500),
      status: input.status === "closed" ? "closed" : "open",
      maxSlotsPerGroup: Math.max(1, Number(input.maxSlotsPerGroup) || book.settings.defaultMaxSlotsPerGroup || 4),
      createdAt: nowIso(),
    };
    book.events.push(event);
    pushLog(book, "event-create", actor, event.name);
    return { ok: true, message: `Created ${event.name}.`, event };
  }

  function updateEvent(book, eventId, input, actor) {
    const event = findEvent(book, eventId);
    if (!event) return { ok: false, message: "Event not found." };
    if (input.name != null) event.name = cleanText(input.name, 120) || event.name;
    if (input.description != null) event.description = cleanText(input.description, 500);
    if (input.status) event.status = input.status === "closed" ? "closed" : "open";
    if (input.maxSlotsPerGroup != null) event.maxSlotsPerGroup = Math.max(1, Number(input.maxSlotsPerGroup) || 1);
    pushLog(book, "event-update", actor, event.name);
    return { ok: true, message: `Updated ${event.name}.`, event };
  }

  function createSession(book, input, actor) {
    const event = findEvent(book, input.eventId);
    if (!event) return { ok: false, message: "Pick an event first." };
    const date = cleanText(input.date, 20);
    const start = cleanText(input.start, 10) || "18:00";
    const end = cleanText(input.end, 10) || "21:00";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Use a valid date." };
    if (hourSlots(start, end).length < 1) return { ok: false, message: "Session must cover at least one hour." };
    const session = {
      id: newId("sess"),
      eventId: event.id,
      date,
      start,
      end,
      notes: cleanText(input.notes, 300),
      status: "open",
      createdAt: nowIso(),
    };
    book.sessions.push(session);
    book.sessions.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
    pushLog(book, "session-create", actor, `${event.name} ${date} ${start}-${end}`);
    return { ok: true, message: "Session added.", session };
  }

  function deleteSession(book, sessionId, actor) {
    const session = findSession(book, sessionId);
    if (!session) return { ok: false, message: "Session not found." };
    const busy = (book.bookings || []).some(
      (b) => b.sessionId === sessionId && (b.status === "pending" || b.status === "approved")
    );
    if (busy) return { ok: false, message: "Cancel or reject bookings on this session first." };
    book.sessions = book.sessions.filter((s) => s.id !== sessionId);
    book.bookings = book.bookings.filter((b) => b.sessionId !== sessionId);
    pushLog(book, "session-delete", actor, sessionId);
    return { ok: true, message: "Session removed." };
  }

  function createGroup(book, input, actor) {
    const event = findEvent(book, input.eventId);
    if (!event) return { ok: false, message: "Pick an event." };
    const name = cleanText(input.name, 120);
    if (!name) return { ok: false, message: "Group name required." };
    const coordinatorUsername = cleanUsername(input.coordinatorUsername || actor);
    const group = {
      id: newId("grp"),
      eventId: event.id,
      name,
      type: cleanText(input.type, 60) || "cultural",
      coordinatorUsername,
      contactName: cleanText(input.contactName, 80),
      contactPhone: cleanText(input.contactPhone, 40),
      contactEmail: cleanText(input.contactEmail, 120),
      participantEstimate: Math.max(0, Number(input.participantEstimate) || 0),
      ageGroups: cleanText(input.ageGroups, 80),
      specialRequirements: cleanText(input.specialRequirements, 500),
      status: "active",
      createdAt: nowIso(),
    };
    book.groups.push(group);
    pushLog(book, "group-create", actor, `${name} for ${event.name}`);
    return { ok: true, message: `Created group ${name}.`, group };
  }

  function updateGroup(book, groupId, input, actor) {
    const group = findGroup(book, groupId);
    if (!group) return { ok: false, message: "Group not found." };
    if (input.name != null) group.name = cleanText(input.name, 120) || group.name;
    if (input.type != null) group.type = cleanText(input.type, 60);
    if (input.coordinatorUsername != null) group.coordinatorUsername = cleanUsername(input.coordinatorUsername);
    if (input.contactName != null) group.contactName = cleanText(input.contactName, 80);
    if (input.contactPhone != null) group.contactPhone = cleanText(input.contactPhone, 40);
    if (input.contactEmail != null) group.contactEmail = cleanText(input.contactEmail, 120);
    if (input.participantEstimate != null) group.participantEstimate = Math.max(0, Number(input.participantEstimate) || 0);
    if (input.ageGroups != null) group.ageGroups = cleanText(input.ageGroups, 80);
    if (input.specialRequirements != null) group.specialRequirements = cleanText(input.specialRequirements, 500);
    if (input.status) group.status = input.status === "archived" ? "archived" : "active";
    pushLog(book, "group-update", actor, group.name);
    return { ok: true, message: "Group saved.", group };
  }

  function deleteGroup(book, groupId, actor) {
    const group = findGroup(book, groupId);
    if (!group) return { ok: false, message: "Group not found." };
    const busy = activeBookingsForGroup(book, groupId).length;
    if (busy) return { ok: false, message: "Cancel active bookings before deleting the group." };
    book.groups = book.groups.filter((g) => g.id !== groupId);
    book.bookings = book.bookings.filter((b) => b.groupId !== groupId);
    pushLog(book, "group-delete", actor, group.name);
    return { ok: true, message: "Group deleted." };
  }

  function createBooking(book, input, actor) {
    const group = findGroup(book, input.groupId);
    if (!group || group.status !== "active") return { ok: false, message: "Group not found." };
    const event = findEvent(book, group.eventId);
    if (!event || event.status !== "open") return { ok: false, message: "Event is not open for booking." };
    const session = findSession(book, input.sessionId);
    if (!session || session.eventId !== event.id || session.status !== "open") {
      return { ok: false, message: "Session not available." };
    }
    const slotStart = cleanText(input.slotStart, 10);
    const slots = hourSlots(session.start, session.end);
    const slot = slots.find((s) => s.start === slotStart);
    if (!slot) return { ok: false, message: "Pick a valid hour slot." };
    if (slotTaken(book, session.id, slotStart)) return { ok: false, message: "That slot is already requested or approved." };
    const max = event.maxSlotsPerGroup || book.settings.defaultMaxSlotsPerGroup || 4;
    if (activeBookingsForGroup(book, group.id).length >= max) {
      return { ok: false, message: `This group already has ${max} active slot(s).` };
    }
    const booking = {
      id: newId("bk"),
      eventId: event.id,
      groupId: group.id,
      sessionId: session.id,
      slotStart: slot.start,
      slotEnd: slot.end,
      kidsCount: Math.max(0, Number(input.kidsCount) || group.participantEstimate || 0),
      pointOfContact: cleanText(input.pointOfContact, 80) || group.contactName || group.coordinatorUsername,
      specialRequirements: cleanText(input.specialRequirements, 500) || group.specialRequirements || "",
      comments: [],
      status: "pending",
      requestedBy: cleanUsername(actor),
      requestedAt: nowIso(),
      reviewedBy: "",
      reviewedAt: "",
    };
    book.bookings.push(booking);
    pushLog(book, "booking-create", actor, `${group.name} ${session.date} ${slot.start}`);
    return { ok: true, message: "Booking submitted for approval.", booking };
  }

  function setBookingStatus(book, bookingId, status, actor, note) {
    const booking = findBooking(book, bookingId);
    if (!booking) return { ok: false, message: "Booking not found." };
    if (!BOOKING_STATUSES.includes(status)) return { ok: false, message: "Bad status." };
    if (status === "approved" && slotTaken(book, booking.sessionId, booking.slotStart, booking.id)) {
      return { ok: false, message: "Another booking already holds this slot." };
    }
    booking.status = status;
    booking.reviewedBy = cleanUsername(actor);
    booking.reviewedAt = nowIso();
    if (note) {
      booking.comments.push({
        id: newId("cmt"),
        at: nowIso(),
        by: cleanUsername(actor),
        text: cleanText(note, 500),
      });
    }
    pushLog(book, "booking-status", actor, `${bookingId} → ${status}`);
    return { ok: true, message: `Booking ${status}.`, booking };
  }

  function addBookingComment(book, bookingId, text, actor) {
    const booking = findBooking(book, bookingId);
    if (!booking) return { ok: false, message: "Booking not found." };
    const body = cleanText(text, 500);
    if (!body) return { ok: false, message: "Comment required." };
    booking.comments.push({
      id: newId("cmt"),
      at: nowIso(),
      by: cleanUsername(actor),
      text: body,
    });
    pushLog(book, "booking-comment", actor, bookingId);
    return { ok: true, message: "Comment added.", booking };
  }

  function deleteBooking(book, bookingId, actor) {
    const before = book.bookings.length;
    book.bookings = book.bookings.filter((b) => b.id !== bookingId);
    if (book.bookings.length === before) return { ok: false, message: "Booking not found." };
    pushLog(book, "booking-delete", actor, bookingId);
    return { ok: true, message: "Booking deleted." };
  }

  function stats(book, days) {
    const cutoff = Date.now() - (Number(days) || 30) * 24 * 60 * 60 * 1000;
    const recentSessions = (book.sessions || []).filter((s) => {
      const t = Date.parse(`${s.date}T12:00:00`);
      return !Number.isNaN(t) && t >= cutoff;
    });
    const recentIds = new Set(recentSessions.map((s) => s.id));
    const bookings = (book.bookings || []).filter((b) => recentIds.has(b.sessionId) || Date.parse(b.requestedAt || 0) >= cutoff);
    const byStatus = {};
    BOOKING_STATUSES.forEach((s) => { byStatus[s] = 0; });
    bookings.forEach((b) => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
    const byCoordinator = {};
    bookings.forEach((b) => {
      const g = findGroup(book, b.groupId);
      const key = (g && g.coordinatorUsername) || b.requestedBy || "unknown";
      if (!byCoordinator[key]) byCoordinator[key] = { total: 0, approved: 0, pending: 0, rejected: 0, cancelled: 0 };
      byCoordinator[key].total += 1;
      byCoordinator[key][b.status] = (byCoordinator[key][b.status] || 0) + 1;
    });
    const usedSlots = bookings.filter((b) => b.status === "approved").length;
    const availableSlots = recentSessions.reduce((sum, s) => sum + hourSlots(s.start, s.end).length, 0);
    return {
      days: Number(days) || 30,
      sessionsBooked: recentSessions.length,
      availableSlots,
      usedSlots,
      unusedSlots: Math.max(0, availableSlots - usedSlots),
      utilization: availableSlots ? Math.round((usedSlots / availableSlots) * 100) : 0,
      byStatus,
      byCoordinator,
      bookingCount: bookings.length,
    };
  }

  function normalizeBook(raw) {
    const base = emptyBook();
    if (!raw || typeof raw !== "object") return base;
    return {
      ...base,
      ...raw,
      facility: { ...base.facility, ...(raw.facility || {}) },
      settings: { ...base.settings, ...(raw.settings || {}) },
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      events: Array.isArray(raw.events) ? raw.events : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      bookings: Array.isArray(raw.bookings) ? raw.bookings : [],
      log: Array.isArray(raw.log) ? raw.log : [],
      schemaVersion: 1,
    };
  }

  root.CulturalStore = {
    ROLES,
    BOOKING_STATUSES,
    emptyBook,
    seedBook,
    normalizeBook,
    newId,
    hourSlots,
    findAccount,
    findEvent,
    findGroup,
    findSession,
    findBooking,
    activeBookingsForGroup,
    slotTaken,
    registerAccount,
    setAccountStatus,
    upsertAccount,
    deleteAccount,
    createEvent,
    updateEvent,
    createSession,
    deleteSession,
    createGroup,
    updateGroup,
    deleteGroup,
    createBooking,
    setBookingStatus,
    addBookingComment,
    deleteBooking,
    stats,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
