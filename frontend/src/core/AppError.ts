const FRIENDLY: Record<string, string> = {
  rate_limited: 'You are sending messages too fast. Wait a moment.',
  forbidden: 'You are not allowed to do that.',
  not_authenticated: 'Please sign in again.',
  cannot_demote_self: 'You cannot remove your own admin role.',
  use_leave_team: 'Use "Leave team" to remove yourself.',
  invalid_block: 'That block position is not valid.',
  'Invalid login credentials': 'Wrong email or password.',
  'duplicate key value violates unique constraint "teams_name_idx"': 'A team with that name already exists.',
};

/** Fout met een stabiele code (de Postgres-melding) en een leesbare tekst voor de gebruiker. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly friendly: string,
  ) {
    super(code);
  }

  static from(error: unknown): AppError {
    if (error instanceof AppError) return error;
    const code = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
    return new AppError(code, FRIENDLY[code] ?? code);
  }
}

export function messageOf(error: unknown): string {
  return AppError.from(error).friendly;
}
