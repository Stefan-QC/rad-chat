import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordPolicy } from './PasswordPolicy';

const good = 'a-long-new-password';

describe('PasswordPolicy', () => {
  it('accepts a long enough new password that differs from the current one and is confirmed', () => {
    expect(PasswordPolicy.check('old-password-1', good, good)).toBeNull();
  });

  it('asks for the current password first', () => {
    expect(PasswordPolicy.check('', good, good)).toMatch(/current password/);
  });

  it('refuses a short new password', () => {
    expect(PasswordPolicy.check('old', 'x'.repeat(MIN_PASSWORD_LENGTH - 1), 'x'.repeat(MIN_PASSWORD_LENGTH - 1))).toContain(String(MIN_PASSWORD_LENGTH));
    expect(PasswordPolicy.check('old', 'x'.repeat(MIN_PASSWORD_LENGTH), 'x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it('refuses a password that is too long', () => {
    const long = 'x'.repeat(MAX_PASSWORD_LENGTH + 1);
    expect(PasswordPolicy.check('old', long, long)).toContain(String(MAX_PASSWORD_LENGTH));
  });

  it('refuses the same password again', () => {
    expect(PasswordPolicy.check(good, good, good)).toMatch(/different/);
  });

  it('refuses a confirmation that does not match', () => {
    expect(PasswordPolicy.check('old-password-1', good, good + 'x')).toMatch(/do not match/);
  });
});
