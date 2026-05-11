async function test() {
  // First GET to capture any tokens
  const getResp = await fetch('https://eventor.orientering.se/Login', {
    headers: { 'User-Agent': 'Mozilla/5.0 Test' }
  });
  const html = await getResp.text();
  
  const tokenMatch = html.match(/__RequestVerificationToken.*?value=["']([^"']+)/);
  console.log('Has CSRF token:', !!tokenMatch);
  
  const hiddenFields = html.match(/<input[^>]+type=["']hidden["'][^>]+>/gi);
  console.log('Hidden fields:', hiddenFields ? hiddenFields.length : 0);
  if (hiddenFields) hiddenFields.forEach(f => console.log(' ', f.substring(0, 150)));

  // Check for form action
  const formAction = html.match(/<form[^>]+action=["']([^"']+)/i);
  console.log('Form action:', formAction ? formAction[1] : 'not found');
}
test();
