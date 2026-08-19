# YR Badminton Gmail Relay

This replaces Cloudflare Email Sending with a small Google Apps Script web app deployed from `badyrminton@gmail.com`.

## 1. Create the Apps Script project

1. Sign in to Google as `badyrminton@gmail.com`.
2. Open Google Apps Script and create a new project named `YR Badminton Mailer`.
3. Replace the default `Code.gs` with the contents of this repository's `google-apps-script/Code.gs`.

## 2. Add the webhook secret

In the Apps Script project:

1. Open **Project Settings**.
2. Under **Script properties**, add:
   - Property: `WEBHOOK_SECRET`
   - Value: a long random secret string.
3. Save it.

Do not commit this secret to GitHub.

## 3. Deploy the Web App

1. Select **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Deploy and approve the Gmail/Mail permission prompts while signed in as `badyrminton@gmail.com`.
6. Copy the deployed `/exec` URL.

## 4. Configure the Cloudflare Worker

In Cloudflare, open the `yrbadminton` Worker and go to the runtime **Variables and Secrets** section (not Build variables).

Add:

- `MAIL_WEBHOOK_URL` = the Google Apps Script `/exec` URL
- `MAIL_WEBHOOK_SECRET` = exactly the same value as `WEBHOOK_SECRET` in Apps Script

Use **Secret** for `MAIL_WEBHOOK_SECRET`. The URL may also be stored as a Secret if preferred.

Deploy the Worker after saving.

## 5. Test

Open `/admin`, sign in, then press:

`寄送測試電郵 / Send Test Email`

Expected delivery:

- From: `YR Badminton <badyrminton@gmail.com>`
- To: `apswsttss@gmail.com`

If the relay is not configured, the Admin page will show the exact error returned by the Worker or Apps Script.

## Scheduled reminder

The Worker keeps the Thursday 22:00 Brisbane reminder. If the currently open session has fewer than 20 registered players, the Worker sends the reminder through this Gmail relay.
