export const DEFAULT_ALERT_EMAIL_TO = "apswsttss@gmail.com";
export const DEFAULT_ALERT_EMAIL_FROM = "badyrminton@gmail.com";

export async function sendEmail(env, { to = DEFAULT_ALERT_EMAIL_TO, subject, text, html }) {
  const webhookUrl = String(env.MAIL_WEBHOOK_URL || "").trim();
  const webhookSecret = String(env.MAIL_WEBHOOK_SECRET || "").trim();
  const recipient = String(to || DEFAULT_ALERT_EMAIL_TO).trim();

  if (!webhookUrl) throw new Error("MAIL_WEBHOOK_URL is not configured");
  if (!webhookSecret) throw new Error("MAIL_WEBHOOK_SECRET is not configured");
  if (!recipient) throw new Error("Email recipient is not configured");

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: webhookSecret,
        to: recipient,
        subject,
        text,
        html
      }),
      redirect: "follow"
    });
  } catch (error) {
    throw new Error(`Google mail relay request failed: ${error?.message || error}`);
  }

  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`Google mail relay returned non-JSON response (HTTP ${response.status}): ${preview || "empty response"}`);
  }

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Google mail relay failed (HTTP ${response.status})`);
  }

  return {
    to: result.to || recipient,
    from: result.from || DEFAULT_ALERT_EMAIL_FROM
  };
}
