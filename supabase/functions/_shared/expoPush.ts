type ExpoPushMessage = {
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  title: string;
  to: string;
};

export async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  if (messages.length === 0) {
    return;
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

  return await response.json();
}
