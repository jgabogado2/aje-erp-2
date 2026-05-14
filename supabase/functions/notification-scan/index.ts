import { createClient } from 'npm:@supabase/supabase-js@2';

type ScanKind = 'overdue' | 'upcoming';

interface ScanEntry {
  id: string;
  period_label: string;
  due_date: string;
  status: string;
  task_list?: {
    id: string;
    name: string;
    assigned_to: string | null;
    assignee?: { id: string; email: string; name: string | null } | null;
    site_tracker?: {
      id: string;
      year: number;
      site?: { id: string; name: string; organization_id: string } | null;
    } | null;
  } | null;
}

interface InsertedNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  user?: { id: string; email: string; name: string | null } | null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dateInManila(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '01';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function getServiceKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!secretKeys) return null;

  const parsed = JSON.parse(secretKeys);
  return parsed.default ?? Object.values(parsed)[0] ?? null;
}

function normalizeTaskList(taskList: unknown): ScanEntry['task_list'] {
  if (Array.isArray(taskList)) return taskList[0] ?? null;
  return taskList as ScanEntry['task_list'];
}

function buildNotification(entry: ScanEntry, kind: ScanKind, runDate: string) {
  const taskList = normalizeTaskList(entry.task_list);
  const assigneeId = taskList?.assigned_to;
  const site = taskList?.site_tracker?.site;
  if (!assigneeId || !site || !taskList?.site_tracker) return null;

  const isOverdue = kind === 'overdue';
  const title = isOverdue
    ? `${taskList.name} is overdue`
    : `${taskList.name} is due tomorrow`;
  const body = `${entry.period_label} at ${site.name} is due ${entry.due_date}.`;

  return {
    user_id: assigneeId,
    organization_id: site.organization_id,
    site_id: site.id,
    kind,
    title,
    body,
    payload: {
      entry_id: entry.id,
      task_list_id: taskList.id,
      task_list_name: taskList.name,
      site_tracker_id: taskList.site_tracker.id,
      site_id: site.id,
      period_label: entry.period_label,
      due_date: entry.due_date,
      status: entry.status,
    },
    dedupe_key: `${kind}:${assigneeId}:${entry.id}:${isOverdue ? runDate : entry.due_date}`,
  };
}

function renderDigestHtml(items: InsertedNotification[]) {
  const rows = items
    .map((item) => {
      const body = item.body ? `<p>${escapeHtml(item.body)}</p>` : '';
      return `<li><strong>${escapeHtml(item.title)}</strong>${body}</li>`;
    })
    .join('');
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 20px;">Hakbang daily tracker digest</h1>
      <p>Here are the tracker items that need your attention.</p>
      <ul>${rows}</ul>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function sendDigest(email: string, items: InsertedNotification[]) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from || items.length === 0) {
    return { skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Hakbang daily tracker digest',
      html: renderDigestHtml(items),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend failed (${response.status}): ${text}`);
  }

  return { skipped: false };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'missing_supabase_env' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const today = dateInManila();
  const tomorrow = dateInManila(1);
  const baseSelect = `
    id,
    period_label,
    due_date,
    status,
    task_list:task_lists!inner(
      id,
      name,
      assigned_to,
      assignee:users!task_lists_assigned_to_fkey(id, email, name),
      site_tracker:site_trackers!inner(
        id,
        year,
        site:sites!inner(id, name, organization_id)
      )
    )
  `;

  const [overdueResult, upcomingResult] = await Promise.all([
    supabase
      .from('task_entries')
      .select(baseSelect)
      .in('status', ['NOT_DONE', 'ONGOING'])
      .lt('due_date', today)
      .limit(1000),
    supabase
      .from('task_entries')
      .select(baseSelect)
      .in('status', ['NOT_DONE', 'ONGOING'])
      .eq('due_date', tomorrow)
      .limit(1000),
  ]);

  if (overdueResult.error) throw overdueResult.error;
  if (upcomingResult.error) throw upcomingResult.error;

  const notifications = [
    ...(overdueResult.data ?? [])
      .map((entry) => buildNotification(entry as ScanEntry, 'overdue', today))
      .filter(Boolean),
    ...(upcomingResult.data ?? [])
      .map((entry) => buildNotification(entry as ScanEntry, 'upcoming', today))
      .filter(Boolean),
  ];

  if (notifications.length === 0) {
    return json({ inserted: 0, emailed: 0, skipped_email: true, today, tomorrow });
  }

  const insertResult = await supabase
    .from('notifications')
    .upsert(notifications, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    })
    .select('*, user:users!notifications_user_id_fkey(id, email, name)');
  if (insertResult.error) throw insertResult.error;

  const inserted = (insertResult.data ?? []) as InsertedNotification[];
  const byUser = new Map<string, InsertedNotification[]>();
  for (const notification of inserted) {
    if (!notification.user?.email) continue;
    if (!byUser.has(notification.user.email)) byUser.set(notification.user.email, []);
    byUser.get(notification.user.email)!.push(notification);
  }

  let emailed = 0;
  let skippedEmail = false;
  for (const [email, items] of byUser.entries()) {
    const result = await sendDigest(email, items);
    if (result.skipped) {
      skippedEmail = true;
      continue;
    }
    emailed += 1;
    await supabase
      .from('notifications')
      .update({ emailed_at: new Date().toISOString() })
      .in('id', items.map((item) => item.id));
  }

  return json({
    inserted: inserted.length,
    emailed,
    skipped_email: skippedEmail,
    today,
    tomorrow,
  });
});
