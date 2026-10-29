# Password recovery

Quest sends password-reset requests through Supabase Auth. The Resend API key
stored in Edge Function secrets for team notifications does not configure Auth
email delivery.

## Reset link opens localhost

Open the project's Authentication → URL Configuration page:
https://supabase.com/dashboard/project/hpliemyxlvgtodmfpgos/auth/url-configuration

Set Site URL to `https://team-dashoard-kvdd.vercel.app` and add this exact
Redirect URL: `https://team-dashoard-kvdd.vercel.app/?reset=1`.

Quest requests that return address from the deployed page. Supabase must allow
it; an unapproved return address can fall back to the project's Site URL. A
localhost Site URL therefore sends the recipient to their own device instead
of Quest. Updating these settings does not rewrite links already emailed.
Request a fresh reset email after saving them and use the newest link.

## No reset email arrives

Check Authentication logs and the exact email on Authentication → Users.
Avoid repeated requests while investigating rate limits. Supabase's default
mailer restricts recipients to the Supabase organization's team addresses;
Quest team membership is a separate application setting.

For the verified `aiquest.co.za` domain, configure custom SMTP in
Authentication → Email → SMTP Settings:

| Setting | Value |
| --- | --- |
| Sender email | `notifications@aiquest.co.za` |
| Sender name | `Quest` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | A private Resend API key with sending access for this domain |

Copy the key directly between Resend and Supabase. Keep it out of browser
configuration, the repository, screenshots and support messages. Check Resend's
email delivery log to distinguish rejected, bounced, delivered and spam-folder
cases. Supabase SMTP changes require project-admin access; this workspace does
not hold an Auth management credential.

If the old key was not retained, create a new key in Resend → API Keys, name it
Quest password resets, grant Sending access and restrict it to `aiquest.co.za`
where offered. Paste the new `re_` key into the SMTP Password field. Keep the
existing notification key active. This is an email-service credential, separate
from a team member's sign-in password.

An `email rate limit exceeded` response means Supabase rejected the send request;
it does not confirm delivery. The email quota can affect several team members.
Once custom SMTP is configured, review Authentication → Rate Limits:
https://supabase.com/dashboard/project/hpliemyxlvgtodmfpgos/auth/rate-limits
Existing cooldowns may still need to expire. Avoid repeated retries; request one
fresh link after the sending limit resets.

## Verification

Request a new link from the production Quest sign-in page. It must open Quest,
show Choose a new password, and stay on that screen until the change succeeds.
An expired link must offer a fresh request. A successful request only confirms
that Supabase accepted it; actual inbox delivery and the production allowlist
require a live check.

Local browser tests use mocked Auth responses. They do not send real emails.

Reference: https://supabase.com/docs/guides/auth/auth-smtp
