export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** De regels voor een nieuw wachtwoord, zodat het formulier en de tests dezelfde regels gebruiken. */
export class PasswordPolicy {
  /** Geeft de eerste reden waarom het wachtwoord niet kan, of null als alles klopt. */
  static check(current: string, next: string, confirm: string): string | null {
    if (current.length === 0) return 'Enter your current password.';
    if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (next.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
    if (next === current) return 'The new password must be different from the current one.';
    if (next !== confirm) return 'The two new passwords do not match.';
    return null;
  }
}
