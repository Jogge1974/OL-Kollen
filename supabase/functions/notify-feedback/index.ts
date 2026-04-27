import { corsHeaders } from '../_shared/cors.ts';

type FeedbackRow = {
  id: string;
  created_at: string;
  name: string;
  message: string;
  person_id: string | null;
  person_name: string | null;
  organisation: string | null;
};

type WebhookPayload = {
  type: 'INSERT';
  table: string;
  record: FeedbackRow;
  schema: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    const payload = (await request.json()) as WebhookPayload;
    const row = payload.record;

    if (!row || !row.message) {
      return new Response(JSON.stringify({ error: 'No feedback record found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const timestamp = row.created_at
      ? new Date(row.created_at).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })
      : 'Okänt datum';

    const personInfo = [
      row.person_name ? `Löpare: ${row.person_name}` : null,
      row.person_id ? `PersonId: ${row.person_id}` : null,
      row.organisation ? `Klubb: ${row.organisation}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const emailBody = [
      `Ny synpunkt från OL-Kollen`,
      ``,
      `Namn: ${row.name}`,
      personInfo,
      `Datum: ${timestamp}`,
      ``,
      `Meddelande:`,
      row.message,
    ].join('\n');

    const htmlBody = [
      `<h2>Ny synpunkt fr&aring;n OL-Kollen</h2>`,
      `<p><strong>Namn:</strong> ${escapeHtml(row.name)}</p>`,
      row.person_name ? `<p><strong>L&ouml;pare:</strong> ${escapeHtml(row.person_name)}</p>` : '',
      row.person_id ? `<p><strong>PersonId:</strong> ${escapeHtml(row.person_id)}</p>` : '',
      row.organisation ? `<p><strong>Klubb:</strong> ${escapeHtml(row.organisation)}</p>` : '',
      `<p><strong>Datum:</strong> ${escapeHtml(timestamp)}</p>`,
      `<hr>`,
      `<p>${escapeHtml(row.message).replace(/\n/g, '<br>')}</p>`,
    ].join('\n');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OL-Kollen <noreply@liveidrott.se>',
        to: ['developer@liveidrott.se'],
        subject: `Synpunkt från ${row.name}`,
        text: emailBody,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(`Resend API error ${resendResponse.status}: ${errorText}`);
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({ success: true, emailId: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[notify-feedback] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
