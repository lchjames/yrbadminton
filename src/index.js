import { sendEmail } from "./mail.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

let waitlistSchemaReady = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function cleanText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function normName(value) {
  return cleanText(value, 80).replace(/\s+/g, " ");
}

function nameKey(value) {
  return normName(value).toLocaleLowerCase("en-AU");
}

function validEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isHHMM(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function isSunday(date) {
  if (!isISODate(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function makePublicId(date, start, venue) {
  return `${date}-${start.replace(":", "")}-${slug(venue) || "court"}-${crypto.randomUUID().slice(0, 8)}`;
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

async function requireDB(env) {
  if (!env.DB) throw new Error("D1 binding DB is not configured");
  return env.DB;
}

async function ensureWaitlistSchema(db) {
  if (waitlistSchemaReady) return;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL,
        pax INTEGER NOT NULL DEFAULT 1 CHECK (pax >= 1),
        email TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'PROMOTED', 'CANCELLED')),
        promoted_at TEXT,
        notified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, name_key),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_waitlist_session_status
      ON waitlist(session_id, status, created_at, id)
    `)
  ]);
  waitlistSchemaReady = true;
}

function adminAuthorised(request, env) {
  const expected = String(env.ADMIN_KEY || "");
  if (!expected) return false;
  return (request.headers.get("x-admin-key") || "") === expected;
}

async function getSetting(db, key, fallback) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row?.value ?? fallback;
}

async function getSessionByPublicId(db, publicId) {
  return db.prepare(`
    SELECT id, public_id, title, event_date, start_time, end_time,
           venue, capacity, note, is_open, created_at, updated_at
    FROM sessions
    WHERE public_id = ?
  `).bind(publicId).first();
}

function publicSession(row) {
  return {
    sessionId: row.public_id,
    title: row.title,
    date: row.event_date,
    start: row.start_time,
    end: row.end_time,
    venue: row.venue,
    capacity: Number(row.capacity),
    note: row.note || "",
    isOpen: Number(row.is_open) === 1
  };
}

async function listSessions(db, includeClosed = true) {
  const sql = includeClosed
    ? `SELECT * FROM sessions ORDER BY event_date ASC, start_time ASC, id ASC`
    : `SELECT * FROM sessions WHERE is_open = 1 ORDER BY event_date ASC, start_time ASC, id ASC`;
  const { results = [] } = await db.prepare(sql).run();
  return results.map(publicSession);
}

async function confirmedPax(db, sessionId, excludingNameKey = "") {
  const row = excludingNameKey
    ? await db.prepare(`
        SELECT COALESCE(SUM(pax), 0) AS used
        FROM bookings
        WHERE session_id = ? AND status = 'YES' AND name_key <> ?
      `).bind(sessionId, excludingNameKey).first()
    : await db.prepare(`
        SELECT COALESCE(SUM(pax), 0) AS used
        FROM bookings
        WHERE session_id = ? AND status = 'YES'
      `).bind(sessionId).first();
  return Math.max(0, Number(row?.used) || 0);
}

async function currentBookings(db, sessionRow, includePrivate = false) {
  await ensureWaitlistSchema(db);

  const { results: bookingRows = [] } = await db.prepare(`
    SELECT name, status, pax, note, created_at, updated_at
    FROM bookings
    WHERE session_id = ?
    ORDER BY updated_at ASC, id ASC
  `).bind(sessionRow.id).run();

  let used = 0;
  const current = [];
  for (const r of bookingRows) {
    const pax = Math.max(1, Number(r.pax) || 1);
    let placement = "NO";
    if (r.status === "YES") {
      if (used + pax <= Number(sessionRow.capacity)) {
        used += pax;
        placement = "CONFIRMED";
      } else {
        placement = "OVERFLOW";
      }
    }
    current.push({
      name: r.name,
      status: r.status,
      pax,
      note: r.note || "",
      timestamp: r.updated_at,
      placement
    });
  }

  const { results: waitingRows = [] } = await db.prepare(`
    SELECT name, pax, email, note, created_at, updated_at
    FROM waitlist
    WHERE session_id = ? AND status = 'WAITING'
    ORDER BY created_at ASC, id ASC
  `).bind(sessionRow.id).run();

  waitingRows.forEach((r, index) => {
    const item = {
      name: r.name,
      status: "YES",
      pax: Math.max(1, Number(r.pax) || 1),
      note: r.note || "",
      timestamp: r.created_at,
      placement: "WAITLIST",
      waitlistPosition: index + 1
    };
    if (includePrivate) item.email = r.email;
    current.push(item);
  });

  return {
    current,
    summary: {
      cap: Number(sessionRow.capacity),
      confirmedPax: used,
      remaining: Math.max(0, Number(sessionRow.capacity) - used),
      waitlistCount: waitingRows.length,
      waitlistPax: waitingRows.reduce((sum, r) => sum + Math.max(1, Number(r.pax) || 1), 0)
    }
  };
}

async function sendPromotionNotification(env, db, row) {
  if (!row?.email || row.notified_at) return false;

  const subject = `YR Badminton — You are now confirmed (${row.event_date})`;
  const text = [
    `你好 ${row.name}，`,
    "候補名單已有空位，你已自動升級為正式出席。",
    "A space became available and you have been automatically moved from the waiting list to the confirmed attendance list.",
    "",
    `Date: ${row.event_date}`,
    `Time: ${row.start_time}–${row.end_time}`,
    `Venue: ${row.venue}`,
    `Players: ${row.pax}`,
    "",
    "You do not need to confirm again.",
    "如果未能出席，請到網站將狀態更新為 NO。",
    "",
    "https://yrbadminton.lchjames.com/"
  ].join("\n");

  const html = `
    <h2>YR Badminton — 已成功補位 / You are confirmed</h2>
    <p>你好 ${htmlEscape(row.name)}，</p>
    <p>候補名單已有空位，你已<strong>自動升級為正式出席</strong>。<br>
    A space became available and you have been <strong>automatically moved to the confirmed attendance list</strong>.</p>
    <p><strong>Date:</strong> ${htmlEscape(row.event_date)}<br>
    <strong>Time:</strong> ${htmlEscape(row.start_time)}–${htmlEscape(row.end_time)}<br>
    <strong>Venue:</strong> ${htmlEscape(row.venue)}<br>
    <strong>Players:</strong> ${Number(row.pax)}</p>
    <p>You do not need to confirm again. 如果未能出席，請到網站將狀態更新為 NO。</p>
    <p><a href="https://yrbadminton.lchjames.com/">Open YR Badminton RSVP</a></p>
  `;

  await sendEmail(env, { to: row.email, subject, text, html });
  await db.prepare(`
    UPDATE waitlist SET notified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(row.id).run();
  return true;
}

async function promoteWaitlist(env, db, sessionRow) {
  await ensureWaitlistSchema(db);
  const used = await confirmedPax(db, sessionRow.id);
  let remaining = Math.max(0, Number(sessionRow.capacity) - used);
  const promoted = [];

  const { results: waiting = [] } = await db.prepare(`
    SELECT id, name, name_key, pax, email, note, created_at
    FROM waitlist
    WHERE session_id = ? AND status = 'WAITING'
    ORDER BY created_at ASC, id ASC
  `).bind(sessionRow.id).run();

  for (const row of waiting) {
    const pax = Math.max(1, Number(row.pax) || 1);
    if (pax > remaining) break;

    await db.batch([
      db.prepare(`
        INSERT INTO bookings(session_id, name, name_key, status, pax, note)
        VALUES (?, ?, ?, 'YES', ?, ?)
        ON CONFLICT(session_id, name_key)
        DO UPDATE SET
          name = excluded.name,
          status = 'YES',
          pax = excluded.pax,
          note = excluded.note,
          updated_at = CURRENT_TIMESTAMP
      `).bind(sessionRow.id, row.name, row.name_key, pax, row.note || ""),
      db.prepare(`
        UPDATE waitlist
        SET status = 'PROMOTED', promoted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'WAITING'
      `).bind(row.id)
    ]);

    remaining -= pax;
    promoted.push({
      ...row,
      pax,
      event_date: sessionRow.event_date,
      start_time: sessionRow.start_time,
      end_time: sessionRow.end_time,
      venue: sessionRow.venue,
      notified_at: null
    });
  }

  for (const row of promoted) {
    try {
      await sendPromotionNotification(env, db, row);
    } catch (error) {
      console.error("Waitlist promotion email failed:", row.email, error?.message || error);
    }
  }

  return promoted;
}

export async function retryPendingWaitlistEmails(env) {
  const db = await requireDB(env);
  await ensureWaitlistSchema(db);
  const { results = [] } = await db.prepare(`
    SELECT w.id, w.name, w.pax, w.email, w.notified_at,
           s.event_date, s.start_time, s.end_time, s.venue
    FROM waitlist w
    JOIN sessions s ON s.id = w.session_id
    WHERE w.status = 'PROMOTED' AND w.notified_at IS NULL
    ORDER BY w.promoted_at ASC, w.id ASC
    LIMIT 50
  `).run();

  let sent = 0;
  for (const row of results) {
    try {
      if (await sendPromotionNotification(env, db, row)) sent++;
    } catch (error) {
      console.error("Pending waitlist email retry failed:", row.email, error?.message || error);
    }
  }
  return { pendingChecked: results.length, sent };
}

async function handlePublicGet(url, env) {
  const db = await requireDB(env);
  await ensureWaitlistSchema(db);
  const action = (url.searchParams.get("action") || "").toLowerCase();

  if (action === "health") {
    const row = await db.prepare("SELECT 1 AS ok").first();
    return json({ ok: row?.ok === 1, database: "connected" });
  }

  if (action === "sessions") {
    return json({ ok: true, sessions: await listSessions(db, true) });
  }

  if (action === "list") {
    const sessionId = cleanText(url.searchParams.get("sessionId"), 120);
    if (!sessionId) return json({ ok: false, error: "missing sessionId" }, 400);
    const session = await getSessionByPublicId(db, sessionId);
    if (!session) return json({ ok: false, error: "session not found" }, 404);
    const data = await currentBookings(db, session);
    return json({ ok: true, ...data });
  }

  return json({ ok: false, error: "unknown action" }, 404);
}

async function upsertWaiting(db, session, { name, key, pax, email, note }) {
  await db.prepare(`
    INSERT INTO waitlist(session_id, name, name_key, pax, email, note, status)
    VALUES (?, ?, ?, ?, ?, ?, 'WAITING')
    ON CONFLICT(session_id, name_key)
    DO UPDATE SET
      name = excluded.name,
      pax = excluded.pax,
      email = excluded.email,
      note = excluded.note,
      status = 'WAITING',
      promoted_at = NULL,
      notified_at = NULL,
      created_at = CASE WHEN waitlist.status = 'WAITING' THEN waitlist.created_at ELSE CURRENT_TIMESTAMP END,
      updated_at = CURRENT_TIMESTAMP
  `).bind(session.id, name, key, pax, email, note).run();

  const { results = [] } = await db.prepare(`
    SELECT name_key FROM waitlist
    WHERE session_id = ? AND status = 'WAITING'
    ORDER BY created_at ASC, id ASC
  `).bind(session.id).run();
  const position = results.findIndex(r => r.name_key === key) + 1;
  return Math.max(1, position);
}

async function upsertRSVP(db, payload, env) {
  await ensureWaitlistSchema(db);

  const sessionId = cleanText(payload.sessionId, 120);
  const name = normName(payload.name);
  const key = nameKey(name);
  const status = String(payload.status || "").toUpperCase();
  const pax = Math.max(1, Math.min(20, Number(payload.pax) || 1));
  const note = cleanText(payload.note, 300);
  const email = validEmail(payload.email);

  if (!sessionId || !name || !status) return { status: 400, body: { ok: false, error: "missing fields" } };
  if (status === "MAYBE") return { status: 400, body: { ok: false, error: "MAYBE is not stored" } };
  if (!["YES", "NO"].includes(status)) return { status: 400, body: { ok: false, error: "invalid status" } };

  const session = await getSessionByPublicId(db, sessionId);
  if (!session) return { status: 404, body: { ok: false, error: "session not found" } };
  if (Number(session.is_open) !== 1) return { status: 409, body: { ok: false, error: "session is closed" } };

  await promoteWaitlist(env, db, session);

  const existingBooking = await db.prepare(`
    SELECT id, status, pax FROM bookings WHERE session_id = ? AND name_key = ?
  `).bind(session.id, key).first();

  if (status === "NO") {
    await db.batch([
      db.prepare(`
        INSERT INTO bookings(session_id, name, name_key, status, pax, note)
        VALUES (?, ?, ?, 'NO', ?, ?)
        ON CONFLICT(session_id, name_key)
        DO UPDATE SET name = excluded.name, status = 'NO', pax = excluded.pax,
                      note = excluded.note, updated_at = CURRENT_TIMESTAMP
      `).bind(session.id, name, key, pax, note),
      db.prepare(`
        UPDATE waitlist
        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND name_key = ? AND status = 'WAITING'
      `).bind(session.id, key)
    ]);

    const promoted = await promoteWaitlist(env, db, session);
    return { status: 200, body: { ok: true, placement: "NO", promoted: promoted.length } };
  }

  const occupiedByOthers = await confirmedPax(db, session.id, key);
  const waitingAheadRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM waitlist
    WHERE session_id = ? AND status = 'WAITING' AND name_key <> ?
  `).bind(session.id, key).first();
  const waitingAhead = Number(waitingAheadRow?.count) || 0;
  const canFit = occupiedByOthers + pax <= Number(session.capacity);

  if (existingBooking?.status === "YES" && !canFit) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "not enough space for the updated player count",
        placement: "CONFIRMED"
      }
    };
  }

  if (canFit && (existingBooking?.status === "YES" || waitingAhead === 0)) {
    await db.batch([
      db.prepare(`
        INSERT INTO bookings(session_id, name, name_key, status, pax, note)
        VALUES (?, ?, ?, 'YES', ?, ?)
        ON CONFLICT(session_id, name_key)
        DO UPDATE SET name = excluded.name, status = 'YES', pax = excluded.pax,
                      note = excluded.note, updated_at = CURRENT_TIMESTAMP
      `).bind(session.id, name, key, pax, note),
      db.prepare(`
        UPDATE waitlist
        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND name_key = ? AND status = 'WAITING'
      `).bind(session.id, key)
    ]);

    const promoted = await promoteWaitlist(env, db, session);
    return { status: 200, body: { ok: true, placement: "CONFIRMED", promoted: promoted.length } };
  }

  if (!email) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "waitlist_email_required",
        placement: "WAITLIST"
      }
    };
  }

  const position = await upsertWaiting(db, session, { name, key, pax, email, note });
  return {
    status: 200,
    body: {
      ok: true,
      placement: "WAITLIST",
      waitlistPosition: position
    }
  };
}

async function handleAdmin(payload, request, env) {
  if (!adminAuthorised(request, env)) return json({ ok: false, error: "unauthorised" }, 401);

  const db = await requireDB(env);
  await ensureWaitlistSchema(db);
  const action = String(payload.action || "").toLowerCase();

  if (action === "admin_sessions") {
    return json({ ok: true, sessions: await listSessions(db, true) });
  }

  if (action === "admin_create_session") {
    const s = payload.session || {};
    const date = cleanText(s.date, 10);
    const start = cleanText(s.start || "17:00", 5);
    const end = cleanText(s.end || "19:00", 5);
    const venue = cleanText(s.venue || "Goodminton", 100);
    const title = cleanText(s.title || "YR Badminton", 100);
    const capacity = Math.max(1, Math.min(100, Number(s.capacity) || 26));
    const note = cleanText(s.note, 300);
    const isOpen = s.isOpen === true;

    if (!isISODate(date)) return json({ ok: false, error: "invalid date" }, 400);
    if (!isSunday(date)) return json({ ok: false, error: "Sunday only" }, 400);
    if (!isHHMM(start) || !isHHMM(end)) return json({ ok: false, error: "invalid time" }, 400);
    if (!venue) return json({ ok: false, error: "missing venue" }, 400);

    if (payload.openOnly === true && isOpen) {
      await db.prepare("UPDATE sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP").run();
    }

    const publicId = makePublicId(date, start, venue);
    try {
      await db.prepare(`
        INSERT INTO sessions(public_id, title, event_date, start_time, end_time, venue, capacity, note, is_open)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(publicId, title, date, start, end, venue, capacity, note, isOpen ? 1 : 0).run();
    } catch (err) {
      if (String(err?.message || err).includes("UNIQUE")) return json({ ok: false, error: "session already exists" }, 409);
      throw err;
    }
    return json({ ok: true, sessionId: publicId });
  }

  if (action === "admin_update_session") {
    const s = payload.session || {};
    const id = cleanText(s.sessionId, 120);
    const date = cleanText(s.date, 10);
    const start = cleanText(s.start, 5);
    const end = cleanText(s.end, 5);
    const venue = cleanText(s.venue, 100);
    const capacity = Math.max(1, Math.min(100, Number(s.capacity) || 26));
    const note = cleanText(s.note, 300);
    const isOpen = s.isOpen === true ? 1 : 0;

    if (!id) return json({ ok: false, error: "missing sessionId" }, 400);
    if (!isISODate(date) || !isSunday(date)) return json({ ok: false, error: "Sunday only" }, 400);
    if (!isHHMM(start) || !isHHMM(end)) return json({ ok: false, error: "invalid time" }, 400);

    const target = await getSessionByPublicId(db, id);
    if (!target) return json({ ok: false, error: "session not found" }, 404);
    const currentlyConfirmed = await confirmedPax(db, target.id);
    if (capacity < currentlyConfirmed) {
      return json({ ok: false, error: `capacity cannot be below ${currentlyConfirmed} confirmed players` }, 409);
    }

    await db.prepare(`
      UPDATE sessions
      SET event_date = ?, start_time = ?, end_time = ?, venue = ?, capacity = ?, note = ?, is_open = ?, updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
    `).bind(date, start, end, venue, capacity, note, isOpen, id).run();

    const updated = await getSessionByPublicId(db, id);
    const promoted = await promoteWaitlist(env, db, updated);
    return json({ ok: true, promoted: promoted.length });
  }

  if (action === "admin_set_only_open") {
    const id = cleanText(payload.sessionId, 120);
    const target = await getSessionByPublicId(db, id);
    if (!target) return json({ ok: false, error: "session not found" }, 404);

    await db.batch([
      db.prepare("UPDATE sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP"),
      db.prepare("UPDATE sessions SET is_open = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(target.id)
    ]);
    return json({ ok: true });
  }

  if (action === "admin_delete_session") {
    const id = cleanText(payload.sessionId, 120);
    const target = await getSessionByPublicId(db, id);
    if (!target) return json({ ok: false, error: "session not found" }, 404);
    await db.batch([
      db.prepare("DELETE FROM waitlist WHERE session_id = ?").bind(target.id),
      db.prepare("DELETE FROM sessions WHERE id = ?").bind(target.id)
    ]);
    return json({ ok: true });
  }

  if (action === "admin_list_bookings") {
    const id = cleanText(payload.sessionId, 120);
    const session = await getSessionByPublicId(db, id);
    if (!session) return json({ ok: false, error: "session not found" }, 404);
    const data = await currentBookings(db, session, true);
    return json({ ok: true, ...data });
  }

  if (action === "admin_generate_sundays") {
    const startDate = cleanText(payload.startDate, 10);
    const weeks = Math.max(1, Math.min(52, Number(payload.weeks) || 8));
    const venue = cleanText(payload.venue || "Goodminton", 100);
    const capacity = Math.max(1, Math.min(100, Number(payload.capacity) || 26));

    if (!isISODate(startDate) || !isSunday(startDate)) return json({ ok: false, error: "startDate must be a Sunday" }, 400);

    const [y, m, d] = startDate.split("-").map(Number);
    if (payload.openOnly === true) {
      await db.prepare("UPDATE sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP").run();
    }

    let created = 0;
    for (let i = 0; i < weeks; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i * 7));
      const date = dt.toISOString().slice(0, 10);
      const existing = await db.prepare(`
        SELECT id FROM sessions WHERE event_date = ? AND start_time = '17:00' AND venue = ?
      `).bind(date, venue).first();
      if (existing) continue;
      const publicId = makePublicId(date, "17:00", venue);
      await db.prepare(`
        INSERT INTO sessions(public_id, title, event_date, start_time, end_time, venue, capacity, note, is_open)
        VALUES (?, 'YR Badminton', ?, '17:00', '19:00', ?, ?, '', ?)
      `).bind(publicId, date, venue, capacity, i === 0 ? 1 : 0).run();
      created++;
    }

    return json({ ok: true, created });
  }

  if (action === "admin_run_monday_automation") {
    const result = await createOrOpenNextSunday(env);
    return json({ ok: true, ...result });
  }

  return json({ ok: false, error: "unknown admin action" }, 404);
}

async function handlePost(request, env) {
  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  const action = String(payload.action || "").toLowerCase();
  if (action === "rsvp") {
    const db = await requireDB(env);
    const result = await upsertRSVP(db, payload, env);
    return json(result.body, result.status);
  }
  if (action.startsWith("admin_")) return handleAdmin(payload, request, env);
  return json({ ok: false, error: "unknown action" }, 404);
}

function brisbaneToday() {
  const now = new Date(Date.now() + 10 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

async function closePastSessions(env) {
  const db = await requireDB(env);
  const today = brisbaneToday();
  await db.prepare(`
    UPDATE sessions
    SET is_open = 0, updated_at = CURRENT_TIMESTAMP
    WHERE event_date < ? AND is_open = 1
  `).bind(today).run();
}

function nextSundayFromBrisbaneNow() {
  const brisbaneNow = new Date(Date.now() + 10 * 60 * 60 * 1000);
  const day = brisbaneNow.getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  const target = new Date(brisbaneNow);
  target.setUTCDate(target.getUTCDate() + daysUntilSunday);
  return target.toISOString().slice(0, 10);
}

async function createOrOpenNextSunday(env) {
  const db = await requireDB(env);
  const date = nextSundayFromBrisbaneNow();
  const venue = await getSetting(db, "default_venue", "Goodminton");
  const capacity = Math.max(1, Number(await getSetting(db, "default_capacity", "26")) || 26);
  const start = await getSetting(db, "default_start", "17:00");
  const end = await getSetting(db, "default_end", "19:00");

  const existing = await db.prepare(`
    SELECT id, public_id
    FROM sessions
    WHERE event_date = ? AND start_time = ? AND venue = ?
  `).bind(date, start, venue).first();

  await db.prepare("UPDATE sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP WHERE is_open = 1").run();

  if (existing) {
    await db.prepare(`
      UPDATE sessions SET is_open = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(existing.id).run();
    return { action: "opened_existing", date, sessionId: existing.public_id };
  }

  const publicId = makePublicId(date, start, venue);
  await db.prepare(`
    INSERT INTO sessions(public_id, title, event_date, start_time, end_time, venue, capacity, note, is_open)
    VALUES (?, 'YR Badminton', ?, ?, ?, ?, ?, '', 1)
  `).bind(publicId, date, start, end, venue, capacity).run();

  return { action: "created_and_opened", date, sessionId: publicId };
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        if (request.method === "GET") return handlePublicGet(url, env);
        if (request.method === "POST") return handlePost(request, env);
        return json({ ok: false, error: "method not allowed" }, 405);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: err?.message || String(err) }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      await closePastSessions(env);
      await createOrOpenNextSunday(env);
      await retryPendingWaitlistEmails(env);
    })());
  }
};
