/**
 * Drains public.notifications into the two channels that can reach a shooter.
 *
 * The database decides what is worth telling someone; this only moves it. That
 * split is why the triggers are testable without a network and why a delivery
 * outage loses nothing — unsent rows simply stay unsent.
 *
 * Two passes, tracked separately:
 *
 *   push   to every device that claimed the account, marked in sent_at
 *   email  to the address on the account, marked in emailed_at
 *
 * They are independent because a shooter with no device token would otherwise
 * leave a row nothing ever settles, and because a push that failed should not
 * stop the email that would have worked. Email is the channel that matters for
 * this beta: it ships as a web app, and on iOS a web app can only be pushed to
 * after somebody adds it to their home screen.
 *
 * Invoke on a schedule (pg_cron via pg_net, or an external scheduler):
 *   curl -X POST "$SUPABASE_URL/functions/v1/send-notifications" \
 *        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
 *
 * Environment, beyond the two Supabase variables:
 *   RESEND_API_KEY   set to send email at all; unset means push only
 *   NOTIFY_FROM      "World Shooting League <league@example.org>"
 *   PUBLIC_SITE_URL  where the web app lives, for the link in the email
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { buildEmail, type EmailNotification } from './email.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const RESEND_URL = 'https://api.resend.com/emails';
/** Expo accepts at most 100 messages per request. */
const CHUNK = 100;
const MAX_PER_RUN = 500;
/** Resend has no batch endpoint worth the complexity; these go one at a time. */
const MAX_EMAILS_PER_RUN = 200;

interface PendingRow {
  id: string;
  shooter_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  device_tokens: { id: string; token: string }[];
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * The email pass. Returns how many were sent; a row is only marked once the
 * provider has accepted it, so a failed send is simply retried next run.
 */
async function sendEmails(
  supabase: ReturnType<typeof createClient>,
): Promise<{ emailed: number; skipped: string | null }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM');
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? undefined;

  if (!apiKey || !from) {
    return { emailed: 0, skipped: 'RESEND_API_KEY or NOTIFY_FROM not set' };
  }

  const { data, error } = await supabase.rpc('pending_email_notifications', {
    p_limit: MAX_EMAILS_PER_RUN,
  });

  if (error) {
    console.error('could not read the email queue', error.message);
    return { emailed: 0, skipped: error.message };
  }

  const pending = (data ?? []) as unknown as EmailNotification[];
  const delivered: string[] = [];

  for (const row of pending) {
    const mail = buildEmail(row, siteUrl);

    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
      });

      if (res.ok) {
        delivered.push(row.id);
      } else {
        // 4xx is usually a bad address and 5xx is the provider having a bad
        // day. Neither is worth losing the row over: leaving emailed_at null
        // retries it, and the backlog metric shows if that never resolves.
        console.error(`resend responded ${res.status} for ${row.id}`);
      }
    } catch (e) {
      console.error('email request failed', e);
      break;
    }
  }

  if (delivered.length) {
    await supabase
      .from('notifications')
      .update({ emailed_at: new Date().toISOString() })
      .in('id', delivered);
  }

  return { emailed: delivered.length, skipped: null };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set', { status: 500 });
  }

  // Service role: this runs behind the API, not on behalf of a shooter, and has
  // to write sent_at — a column no client may touch.
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: pending, error } = await supabase
    .from('notifications')
    .select('id, shooter_id, title, body, data, device_tokens:device_tokens!inner(id, token)')
    .is('sent_at', null)
    .is('error', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)
    .returns<PendingRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Nothing to push is not nothing to do: most shooters in this beta have no
  // device token at all, and their notifications go out by email.
  if (!pending?.length) {
    const mail = await sendEmails(supabase);
    return Response.json({ sent: 0, failed: 0, tokens_disabled: 0, ...mail });
  }

  // One Expo message per (notification, device). A shooter with a phone and a
  // tablet gets both, and the notification row is settled once for all of them.
  const messages = pending.flatMap((row) =>
    row.device_tokens.map((device) => ({
      notificationId: row.id,
      deviceId: device.id,
      payload: {
        to: device.token,
        title: row.title,
        body: row.body,
        data: row.data,
        sound: 'default',
        channelId: 'default',
      },
    })),
  );

  const sent = new Set<string>();
  const failed = new Map<string, string>();
  const deadTokens = new Set<string>();

  for (const batch of chunk(messages, CHUNK)) {
    let tickets: ExpoTicket[] = [];

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(batch.map((m) => m.payload)),
      });

      if (!res.ok) {
        // A transport failure is not the notification's fault: leave the rows
        // pending so the next run retries them.
        console.error(`Expo responded ${res.status}`);
        continue;
      }

      tickets = (await res.json()).data ?? [];
    } catch (e) {
      console.error('push request failed', e);
      continue;
    }

    batch.forEach((message, i) => {
      const ticket = tickets[i];
      if (!ticket || ticket.status === 'ok') {
        sent.add(message.notificationId);
        return;
      }

      // A token for an app that was uninstalled will never work again.
      if (ticket.details?.error === 'DeviceNotRegistered') {
        deadTokens.add(message.deviceId);
        sent.add(message.notificationId);
        return;
      }

      failed.set(message.notificationId, ticket.message ?? 'unknown push error');
    });
  }

  // A notification that reached one device counts as delivered.
  for (const id of failed.keys()) {
    if (sent.has(id)) failed.delete(id);
  }

  if (sent.size) {
    await supabase
      .from('notifications')
      .update({ sent_at: new Date().toISOString() })
      .in('id', [...sent]);
  }

  for (const [id, message] of failed) {
    await supabase.from('notifications').update({ error: message }).eq('id', id);
  }

  if (deadTokens.size) {
    await supabase
      .from('device_tokens')
      .update({ disabled_at: new Date().toISOString() })
      .in('id', [...deadTokens]);
  }

  const mail = await sendEmails(supabase);

  return Response.json({
    sent: sent.size,
    failed: failed.size,
    tokens_disabled: deadTokens.size,
    ...mail,
  });
});
