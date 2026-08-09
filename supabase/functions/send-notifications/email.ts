/**
 * Turning one outbox row into one email.
 *
 * Kept apart from index.ts, which talks to the network, so it can be exercised
 * with plain Node — see email.test.ts.
 *
 * The tone is the same as the app's: say what happened, say what it means, and
 * never say the number. "Your opponent has reported" must not become "your
 * opponent shot 103.7" — the blind reveal is enforced in the database, and an
 * email that leaked the score around it would be the one hole in it.
 */

export interface EmailNotification {
  id: string;
  email: string;
  display_name: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface BuiltEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The deep link in the payload is an app route ("/match/abc"). An email is read
 * in a browser, so it needs an address — and if none is configured, no link at
 * all is better than a broken one.
 */
export function absoluteUrl(route: unknown, siteUrl?: string): string | null {
  if (typeof route !== 'string' || !route.startsWith('/')) return null;
  if (!siteUrl) return null;
  return `${siteUrl.replace(/\/+$/, '')}${route}`;
}

/** First name where there is one, so the greeting is not shouted. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || 'there';
}

export function buildEmail(
  notification: EmailNotification,
  siteUrl?: string,
  leagueName = 'World Shooting League',
): BuiltEmail {
  const link = absoluteUrl(notification.data?.route, siteUrl);
  const name = firstName(notification.display_name);

  const lines = [
    `Hello ${name},`,
    '',
    notification.body,
  ];
  if (link) {
    lines.push('', link);
  }
  lines.push(
    '',
    '—',
    `${leagueName}. You can turn these emails off in your profile.`,
  );

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#F7F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B0D13">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:18px;padding:28px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#838B9E">${esc(leagueName)}</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.4px">${esc(notification.title)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:23px;color:#5B6377">${esc(notification.body)}</p>
    ${
      link
        ? `<p style="margin:0 0 8px"><a href="${esc(link)}" style="display:inline-block;background:#4B4DE0;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:14px 22px;border-radius:15px">Open the match</a></p>`
        : ''
    }
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:18px;color:#838B9E">
    You are getting this because you are shooting in the ${esc(leagueName)}.
    You can turn these emails off in your profile.
  </p>
</body>
</html>`;

  return {
    to: notification.email,
    // The title is already a sentence; a prefix would only push it out of the
    // width a phone shows in the inbox list.
    subject: notification.title,
    text: lines.join('\n'),
    html,
  };
}
