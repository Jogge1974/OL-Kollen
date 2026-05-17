type ExpoPushMessage = {
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  title: string;
  to: string;
};

type ExpoPushTicket =
  | { id: string; status: 'ok' }
  | { details?: { error?: string }; message: string; status: 'error' };

export async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  if (messages.length === 0) {
    return { invalidTokens: [] as string[] };
  }

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(messages),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Expo push send failed with ${response.status}.`);
  }

  const result = await response.json();
  const tickets: ExpoPushTicket[] = result?.data ?? [];

  // Collect tokens that Expo immediately rejects as invalid
  const invalidTokens: string[] = [];
  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i];
    if (
      ticket.status === 'error' &&
      ticket.details?.error === 'DeviceNotRegistered' &&
      i < messages.length
    ) {
      invalidTokens.push(messages[i].to);
    }
  }

  return { invalidTokens };
}

export async function deactivateInvalidTokens(
  supabase: { from: (table: string) => unknown } & Record<string, unknown>,
  invalidTokens: string[],
) {
  if (invalidTokens.length === 0) return;

  // deno-lint-ignore no-explicit-any
  const table = supabase.from('device_push_tokens') as any;
  await table
    .update({ is_active: false, push_token: null, updated_at: new Date().toISOString() })
    .in('push_token', invalidTokens);
}
