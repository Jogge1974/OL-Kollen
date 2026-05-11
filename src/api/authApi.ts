import { loginViaWeb } from '@/src/services/eventorWebSession';
import { AuthenticatedUser, EventorLoginInput } from '@/src/types/user';

export async function authenticateEventorPerson(input: EventorLoginInput) {
  const loginResult = await loginViaWeb(input.username, input.password);

  if (!loginResult.success) {
    throw new Error('Inloggningen misslyckades. Kontrollera användarnamn och lösenord.');
  }

  return loginResult.user satisfies AuthenticatedUser;
}
