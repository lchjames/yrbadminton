const AUTO_JAMES_NAME = "James";
const AUTO_JAMES_KEY = "james";
const AUTO_JAMES_NOTE = "__YR_AUTO_JAMES_HIDDEN_UNTIL_OPEN__";

function brisbaneToday() {
  const now = new Date(Date.now() + 10 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export async function ensureJamesReservations(env) {
  if (!env?.DB) return;

  const today = brisbaneToday();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO bookings(session_id, name, name_key, status, pax, note)
    SELECT s.id, ?, ?, 'YES', 1, ?
    FROM sessions s
    LEFT JOIN bookings b
      ON b.session_id = s.id AND b.name_key = ?
    WHERE s.event_date >= ?
      AND b.id IS NULL
  `).bind(
    AUTO_JAMES_NAME,
    AUTO_JAMES_KEY,
    AUTO_JAMES_NOTE,
    AUTO_JAMES_KEY,
    today
  ).run();
}

export async function hideReservedJamesFromClosedPublicList(response, url, env) {
  if (!env?.DB || !response?.ok) return response;
  if (url.pathname !== "/api/" || url.searchParams.get("action") !== "list") return response;

  const sessionId = String(url.searchParams.get("sessionId") || "").trim();
  if (!sessionId) return response;

  const session = await env.DB.prepare(`
    SELECT id, capacity, is_open
    FROM sessions
    WHERE public_id = ?
  `).bind(sessionId).first();

  if (!session || Number(session.is_open) === 1) return response;

  let data;
  try {
    data = await response.clone().json();
  } catch {
    return response;
  }

  if (!data?.ok || !Array.isArray(data.current) || !data.summary) return response;

  const hiddenIndex = data.current.findIndex(item =>
    String(item?.name || "").trim().toLowerCase() === AUTO_JAMES_KEY
    && String(item?.note || "") === AUTO_JAMES_NOTE
  );

  if (hiddenIndex < 0) return response;

  const [hidden] = data.current.splice(hiddenIndex, 1);
  const hiddenPax = Math.max(1, Number(hidden?.pax) || 1);

  if (hidden?.status === "YES" && hidden?.placement === "CONFIRMED") {
    data.summary.confirmedPax = Math.max(
      0,
      Number(data.summary.confirmedPax || 0) - hiddenPax
    );
  }

  const capacity = Math.max(0, Number(session.capacity) || Number(data.summary.cap) || 0);
  data.summary.remaining = Math.max(
    0,
    capacity - Number(data.summary.confirmedPax || 0)
  );

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.delete("content-length");

  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
