(function (root) {
  const ROLES = [
    ["coordinator", "Coordinator"],
    ["cultural", "Cultural team"],
    ["admin", "Admin"],
  ];

  const BOOKING_STATUSES = ["pending", "approved", "rejected", "cancelled"];
  const WINDOW_START = "18:00";
  const WINDOW_END = "21:00";
  const STEP_MINUTES = 15;

  function emptyBook() {
    return {
      schemaVersion: 2,
      facility: {
        name: "Samantha Smith Elementary",
        address: "23305 NE 14th St, Sammamish, WA 98074",
        mapsUrl: "https://share.google/C8C33ynszqGr7fR40",
        sessionHours: 3,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        stepMinutes: STEP_MINUTES,
      },
      settings: {
        defaultMaxSlotsPerGroup: 6,
        recommendAdultPerKids: 10,
        cancelNoticeHours: 72,
        requestLeadDays: 14,
        minDemandToBook: 1,
        maxSessionsPerYear: 28,
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
    return cleanText(value, 80).toLowerCase().replace(/[^a-z0-9._@+-]/g, "");
  }

  function toMinutes(hhmm) {
    const [h, m] = String(hhmm || "").split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
    return h * 60 + m;
  }

  function fromMinutes(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
    if (book.log.length > 2000) book.log.length = 2000;
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

  function windowBounds(session) {
    const start = (session && session.start) || WINDOW_START;
    const end = (session && session.end) || WINDOW_END;
    return { start, end, startMin: toMinutes(start), endMin: toMinutes(end) };
  }

  /** 15-minute start times that fit inside the 6–9 PM window for a given duration. */
  function startOptions(session, durationMinutes) {
    const dur = Number(durationMinutes) || STEP_MINUTES;
    const { startMin, endMin } = windowBounds(session);
    const options = [];
    for (let t = startMin; t + dur <= endMin; t += STEP_MINUTES) {
      options.push(fromMinutes(t));
    }
    return options;
  }

  function durationOptions(session, start) {
    const { endMin } = windowBounds(session);
    const startMin = toMinutes(start);
    if (Number.isNaN(startMin)) return [];
    const options = [];
    for (let dur = STEP_MINUTES; startMin + dur <= endMin; dur += STEP_MINUTES) {
      options.push(dur);
    }
    return options;
  }

  function hourSlots(start, end) {
    return startOptions({ start, end }, 60).map((s) => ({
      start: s,
      end: fromMinutes(toMinutes(s) + 60),
    }));
  }

  function demandByDate(book, eventId) {
    const map = {};
    (book.bookings || []).forEach((b) => {
      if (eventId && b.eventId !== eventId) return;
      if (b.status !== "pending" && b.status !== "approved") return;
      const key = b.date || "";
      if (!key) return;
      if (!map[key]) map[key] = { date: key, pending: 0, approved: 0, total: 0, bookings: [] };
      map[key][b.status] += 1;
      map[key].total += 1;
      map[key].bookings.push(b);
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
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
        maxSlotsPerGroup: 6,
        createdAt: nowIso(),
      },
    ];
    const sampleDates = ["2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22", "2027-03-29", "2027-04-05"];
    book.sessions = sampleDates.map((date, index) => ({
      id: `sess-${eventId}-${index + 1}`,
      eventId,
      date,
      start: WINDOW_START,
      end: WINDOW_END,
      notes: "Candidate evening · 6–9 PM · preferences in 15-minute steps",
      status: "open",
      facilityBooked: false,
      createdAt: nowIso(),
    }));
    pushLog(book, "seed", "system", "Seeded Boishakhi 2027 preference evenings");
    return book;
  }

  function registerAccount(book, input, actor) {
    const username = cleanUsername(input.username);
    if (!username || username.length < 3) return { ok: false, message: "Use your email or a username (at least 3 characters)." };
    if (findAccount(book, username)) return { ok: false, message: "That login is already taken." };
    if (!input.hash) return { ok: false, message: "Password is required." };
    const name = cleanText(input.name, 80);
    if (!name) return { ok: false, message: "Name is required." };
    const email = cleanText(input.email, 120) || (username.includes("@") ? username : "");
    const account = {
      username,
      hash: String(input.hash),
      role: "coordinator",
      name,
      email,
      phone: cleanText(input.phone, 40),
      status: "pending",
      createdAt: nowIso(),
      policyAckAt: input.policyAck ? nowIso() : "",
    };
    book.accounts.push(account);
    pushLog(book, "register", actor || username, `Registered ${username}`);
    return {
      ok: true,
      message: "Account created. You cannot book until cultural team approves your login.",
      account,
    };
  }

  function setAccountStatus(book, username, status, actor, options) {
    const account = findAccount(book, username);
    if (!account) return { ok: false, message: "Account not found." };
    if (!["active", "pending", "disabled"].includes(status)) return { ok: false, message: "Bad status." };
    const actorRole = options && options.actorRole;
    if (actorRole === "cultural" && account.role !== "coordinator") {
      return { ok: false, message: "Cultural login can only approve, disable, or reinstate coordinators — not cultural or admin accounts." };
    }
    if (status === "disabled" && account.role === "admin" && actorRole !== "admin") {
      return { ok: false, message: "Only admin can disable an admin account." };
    }
    const previous = account.status;
    account.status = status;
    const verb = status === "active" && previous === "disabled" ? "reinstated" : status === "active" ? "approved" : status;
    pushLog(book, "account-status", actor, `${username} (${account.role}) ${previous} → ${status}`);
    return { ok: true, message: `${username} ${verb}.`, account };
  }

  function upsertAccount(book, input, actor, options) {
    const username = cleanUsername(input.username);
    if (!username) return { ok: false, message: "Username required." };
    let account = findAccount(book, username);
    const role = ["coordinator", "cultural", "admin"].includes(input.role) ? input.role : "coordinator";
    const actorRole = options && options.actorRole;
    if (actorRole === "cultural" && role !== "coordinator") {
      return { ok: false, message: "Cultural login can only create or edit coordinator accounts." };
    }
    if (actorRole === "cultural" && account && account.role !== "coordinator") {
      return { ok: false, message: "Cultural login cannot edit cultural or admin accounts." };
    }
    if (!account) {
      if (!input.hash) return { ok: false, message: "Password required for new account." };
      account = {
        username,
        hash: String(input.hash),
        role,
        name: cleanText(input.name, 80) || username,
        email: cleanText(input.email, 120) || (username.includes("@") ? username : ""),
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
    if (input.role && actorRole === "admin") account.role = role;
    if (input.status) {
      if (actorRole === "cultural" && account.role !== "coordinator") {
        return { ok: false, message: "Cultural login cannot change status of cultural or admin accounts." };
      }
      account.status = input.status;
    }
    pushLog(book, "account-update", actor, `Updated ${username} (${account.role}, ${account.status})`);
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
      maxSlotsPerGroup: Math.max(1, Number(input.maxSlotsPerGroup) || book.settings.defaultMaxSlotsPerGroup || 6),
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
    const start = cleanText(input.start, 10) || WINDOW_START;
    const end = cleanText(input.end, 10) || WINDOW_END;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Use a valid date." };
    if (!(toMinutes(end) - toMinutes(start) >= STEP_MINUTES)) {
      return { ok: false, message: "Evening window must be at least 15 minutes." };
    }
    const session = {
      id: newId("sess"),
      eventId: event.id,
      date,
      start,
      end,
      notes: cleanText(input.notes, 300),
      status: "open",
      facilityBooked: false,
      createdAt: nowIso(),
    };
    book.sessions.push(session);
    book.sessions.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
    pushLog(book, "session-create", actor, `${event.name} ${date} ${start}-${end}`);
    return { ok: true, message: "Preference evening added.", session };
  }

  function yearFromDate(date) {
    const y = Number(String(date || "").slice(0, 4));
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }

  function maxSessionsPerYear(book) {
    return Math.max(1, Number(book.settings && book.settings.maxSessionsPerYear) || 28);
  }

  /** Count facility evenings already used in a calendar year (internal yearly cap). */
  function yearSessionUsage(book, year) {
    const y = Number(year) || new Date().getFullYear();
    const max = maxSessionsPerYear(book);
    const usedSessions = (book.sessions || []).filter((s) => {
      if (yearFromDate(s.date) !== y) return false;
      return s.facilityBooked || s.status === "booked";
    });
    const used = usedSessions.length;
    return {
      year: y,
      used,
      max,
      remaining: Math.max(0, max - used),
      atLimit: used >= max,
      label: `${used} / ${max} facility sessions in ${y}`,
    };
  }

  function bookFacilitySession(book, sessionId, actor, note) {
    const session = findSession(book, sessionId);
    if (!session) return { ok: false, message: "Evening not found." };
    if (session.facilityBooked || session.status === "booked") {
      const usage = yearSessionUsage(book, yearFromDate(session.date));
      return { ok: true, message: `Already booked. ${usage.label} (${usage.remaining} left).`, session, usage };
    }
    const usageBefore = yearSessionUsage(book, yearFromDate(session.date));
    if (usageBefore.atLimit) {
      return {
        ok: false,
        message: `Yearly facility limit reached (${usageBefore.label}). Cannot book another evening.`,
        usage: usageBefore,
      };
    }
    session.facilityBooked = true;
    session.status = "booked";
    if (note) session.notes = cleanText(note, 300);
    pushLog(book, "facility-book", actor, `${session.date} ${session.start}-${session.end}`);
    const usage = yearSessionUsage(book, yearFromDate(session.date));
    return {
      ok: true,
      message: `Facility booked for ${session.date}. Counter: ${usage.label} (${usage.remaining} left this year).`,
      session,
      usage,
    };
  }

  function deleteSession(book, sessionId, actor) {
    const session = findSession(book, sessionId);
    if (!session) return { ok: false, message: "Session not found." };
    const busy = (book.bookings || []).some(
      (b) => (b.sessionId === sessionId || b.date === session.date) && (b.status === "pending" || b.status === "approved")
    );
    if (busy) return { ok: false, message: "Cancel or reject preferences on this evening first." };
    book.sessions = book.sessions.filter((s) => s.id !== sessionId);
    book.bookings = book.bookings.filter((b) => b.sessionId !== sessionId);
    pushLog(book, "session-delete", actor, sessionId);
    return { ok: true, message: "Evening removed." };
  }

  function createGroup(book, input, actor) {
    const event = findEvent(book, input.eventId);
    if (!event) return { ok: false, message: "Pick an event." };
    const name = cleanText(input.name, 120);
    if (!name) return { ok: false, message: "Group name required." };
    const programComment = cleanText(input.programComment, 500);
    if (!programComment) {
      return { ok: false, message: "Add a short comment: which event/program this team is for." };
    }
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
      programComment,
      specialRequirements: cleanText(input.specialRequirements, 500),
      status: "active",
      createdAt: nowIso(),
    };
    book.groups.push(group);
    pushLog(book, "group-create", actor, `${name} for ${event.name}: ${programComment}`);
    return { ok: true, message: `Team created for ${event.name}. You can now submit date preferences.`, group };
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
    if (input.programComment != null) group.programComment = cleanText(input.programComment, 500);
    if (input.specialRequirements != null) group.specialRequirements = cleanText(input.specialRequirements, 500);
    if (input.status) group.status = input.status === "archived" ? "archived" : "active";
    pushLog(book, "group-update", actor, group.name);
    return { ok: true, message: "Group saved.", group };
  }

  function deleteGroup(book, groupId, actor) {
    const group = findGroup(book, groupId);
    if (!group) return { ok: false, message: "Group not found." };
    const busy = activeBookingsForGroup(book, groupId).length;
    if (busy) return { ok: false, message: "Cancel active preferences before deleting the group." };
    book.groups = book.groups.filter((g) => g.id !== groupId);
    book.bookings = book.bookings.filter((b) => b.groupId !== groupId);
    pushLog(book, "group-delete", actor, group.name);
    return { ok: true, message: "Group deleted." };
  }

  function migrateBooking(booking, book) {
    if (!booking) return booking;
    if (booking.date && booking.start && booking.end) {
      booking.durationMinutes = booking.durationMinutes || (toMinutes(booking.end) - toMinutes(booking.start));
      return booking;
    }
    const session = findSession(book, booking.sessionId);
    booking.date = booking.date || (session && session.date) || "";
    booking.start = booking.start || booking.slotStart || "";
    booking.end = booking.end || booking.slotEnd || "";
    if (booking.start && booking.end) {
      booking.durationMinutes = toMinutes(booking.end) - toMinutes(booking.start);
    }
    booking.kind = booking.kind || "preference";
    return booking;
  }

  function createPreferences(book, input, actor) {
    const group = findGroup(book, input.groupId);
    if (!group || group.status !== "active") return { ok: false, message: "Create your team first." };
    const event = findEvent(book, group.eventId);
    if (!event || event.status !== "open") return { ok: false, message: "Event is not open." };
    const prefs = Array.isArray(input.preferences) ? input.preferences : [input];
    if (!prefs.length) return { ok: false, message: "Add at least one preferred date and time." };

    const max = event.maxSlotsPerGroup || book.settings.defaultMaxSlotsPerGroup || 6;
    const already = activeBookingsForGroup(book, group.id).length;
    if (already + prefs.length > max) {
      return { ok: false, message: `This team may hold at most ${max} active preferences (you have ${already}).` };
    }

    const created = [];
    for (const pref of prefs) {
      const session = findSession(book, pref.sessionId);
      if (!session || session.eventId !== event.id || (session.status !== "open" && session.status !== "booked")) {
        return { ok: false, message: "Pick a valid preference evening." };
      }
      const durationMinutes = Number(pref.durationMinutes) || 60;
      if (durationMinutes % STEP_MINUTES !== 0 || durationMinutes < STEP_MINUTES) {
        return { ok: false, message: "Duration must be in 15-minute steps." };
      }
      const start = cleanText(pref.start, 10);
      const allowed = startOptions(session, durationMinutes);
      if (!allowed.includes(start)) {
        return { ok: false, message: `Start time must fit in ${session.start}–${session.end} for that duration.` };
      }
      const end = fromMinutes(toMinutes(start) + durationMinutes);
      const duplicate = (book.bookings || []).some(
        (b) =>
          b.groupId === group.id &&
          b.date === session.date &&
          b.start === start &&
          b.end === end &&
          (b.status === "pending" || b.status === "approved")
      );
      if (duplicate) return { ok: false, message: `You already requested ${session.date} ${start}–${end}.` };

      const booking = {
        id: newId("bk"),
        kind: "preference",
        eventId: event.id,
        groupId: group.id,
        sessionId: session.id,
        date: session.date,
        start,
        end,
        durationMinutes,
        slotStart: start,
        slotEnd: end,
        kidsCount: Math.max(0, Number(input.kidsCount != null ? input.kidsCount : pref.kidsCount) || group.participantEstimate || 0),
        pointOfContact: cleanText(input.pointOfContact || pref.pointOfContact, 80) || group.contactName || group.coordinatorUsername,
        specialRequirements: cleanText(input.specialRequirements || pref.specialRequirements, 500) || group.specialRequirements || "",
        comments: [],
        status: "pending",
        requestedBy: cleanUsername(actor),
        requestedAt: nowIso(),
        reviewedBy: "",
        reviewedAt: "",
      };
      book.bookings.push(booking);
      created.push(booking);
      pushLog(book, "preference-create", actor, `${group.name} ${session.date} ${start}–${end}`);
    }

    return {
      ok: true,
      message: `Submitted ${created.length} day preference(s). Cultural team will book the gym when demand is enough.`,
      bookings: created,
    };
  }

  function createBooking(book, input, actor) {
    return createPreferences(book, input, actor);
  }

  function setBookingStatus(book, bookingId, status, actor, note) {
    const booking = findBooking(book, bookingId);
    if (!booking) return { ok: false, message: "Preference not found." };
    migrateBooking(booking, book);
    if (!BOOKING_STATUSES.includes(status)) return { ok: false, message: "Bad status." };

    let usage = yearSessionUsage(book, yearFromDate(booking.date));
    if (status === "approved") {
      const sess = findSession(book, booking.sessionId) || (book.sessions || []).find((s) => s.date === booking.date && s.eventId === booking.eventId);
      if (sess && !(sess.facilityBooked || sess.status === "booked")) {
        const booked = bookFacilitySession(book, sess.id, actor, "Auto-booked when preference approved");
        if (!booked.ok) return booked;
        usage = booked.usage || yearSessionUsage(book, yearFromDate(booking.date));
      } else {
        usage = yearSessionUsage(book, yearFromDate(booking.date));
      }
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
    if (status === "approved") {
      return {
        ok: true,
        message: `Approved — calendar lights up. Counter: ${usage.label} (${usage.remaining} left this year).`,
        booking,
        usage,
      };
    }
    return { ok: true, message: `Preference ${status}.`, booking, usage };
  }

  function addBookingComment(book, bookingId, text, actor) {
    const booking = findBooking(book, bookingId);
    if (!booking) return { ok: false, message: "Preference not found." };
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
    if (book.bookings.length === before) return { ok: false, message: "Preference not found." };
    pushLog(book, "booking-delete", actor, bookingId);
    return { ok: true, message: "Preference deleted." };
  }

  function stats(book, days) {
    const cutoff = Date.now() - (Number(days) || 30) * 24 * 60 * 60 * 1000;
    const recentSessions = (book.sessions || []).filter((s) => {
      const t = Date.parse(`${s.date}T12:00:00`);
      return !Number.isNaN(t) && t >= cutoff;
    });
    const bookings = (book.bookings || []).filter((b) => Date.parse(b.requestedAt || 0) >= cutoff || recentSessions.some((s) => s.id === b.sessionId || s.date === b.date));
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
    const facilityBooked = recentSessions.filter((s) => s.facilityBooked || s.status === "booked").length;
    return {
      days: Number(days) || 30,
      sessionsBooked: recentSessions.length,
      facilityBooked,
      availableSlots: recentSessions.length,
      usedSlots,
      unusedSlots: Math.max(0, recentSessions.length - facilityBooked),
      utilization: recentSessions.length ? Math.round((facilityBooked / recentSessions.length) * 100) : 0,
      byStatus,
      byCoordinator,
      bookingCount: bookings.length,
    };
  }

  function normalizeBook(raw) {
    const base = emptyBook();
    if (!raw || typeof raw !== "object") return base;
    const book = {
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
      schemaVersion: 2,
    };
    book.sessions.forEach((s) => {
      if (s.facilityBooked == null) s.facilityBooked = s.status === "booked";
    });
    book.groups.forEach((g) => {
      if (g.programComment == null) g.programComment = g.specialRequirements || "";
    });
    book.bookings.forEach((b) => migrateBooking(b, book));
    return book;
  }

  root.CulturalStore = {
    ROLES,
    BOOKING_STATUSES,
    WINDOW_START,
    WINDOW_END,
    STEP_MINUTES,
    emptyBook,
    seedBook,
    normalizeBook,
    newId,
    pushLog,
    hourSlots,
    startOptions,
    durationOptions,
    toMinutes,
    fromMinutes,
    demandByDate,
    findAccount,
    findEvent,
    findGroup,
    findSession,
    findBooking,
    activeBookingsForGroup,
    registerAccount,
    setAccountStatus,
    upsertAccount,
    deleteAccount,
    createEvent,
    updateEvent,
    createSession,
    bookFacilitySession,
    yearSessionUsage,
    maxSessionsPerYear,
    yearFromDate,
    deleteSession,
    createGroup,
    updateGroup,
    deleteGroup,
    createBooking,
    createPreferences,
    setBookingStatus,
    addBookingComment,
    deleteBooking,
    stats,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
