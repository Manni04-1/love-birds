import type { AuthError } from '@supabase/supabase-js';

import { friendlyError, sideClient, supabase } from './supabase';

export const PASSWORD_MIN = 8;

/** What's wrong with a new password, or an empty string. */
export function newPasswordProblem(next: string, again: string): string {
  if (next.length < PASSWORD_MIN) return `Use a password with at least ${PASSWORD_MIN} characters.`;
  if (next !== again) return "The two new passwords don't match.";
  return '';
}

function sendError(error: AuthError): string {
  const wait = /after (\d+) seconds/i.exec(error.message);
  if (wait) return `Wait ${wait[1]} seconds, then ask for another code.`;
  if (error.code === 'over_email_send_rate_limit') return 'Too many codes asked for. Wait a little, then try again.';
  if (error.code === 'email_address_not_authorized') {
    return "Love Birds can't send emails yet. Whoever set up the app needs to finish its email setup in Supabase.";
  }
  if (/error sending/i.test(error.message)) return "The email couldn't be sent. Try again in a few minutes.";
  return friendlyError(error);
}

/**
 * Emails a code for setting a new password. Supabase answers the same whether or not the email
 * has an account, so nobody can use this to find out who has one.
 */
export async function sendResetCode(email: string): Promise<string> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? sendError(error) : '';
}

/**
 * Sets a new password with the emailed code, then signs in with it. Returns an error to show, or
 * an empty string once you're signed in.
 */
export async function resetPassword(email: string, code: string, next: string): Promise<string> {
  const side = sideClient();
  const { error: bad } = await side.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
  if (bad) {
    if (bad.code === 'otp_expired' || /expired|invalid/i.test(bad.message)) {
      return 'That code is wrong or has expired. Check the newest email, or send a new code.';
    }
    return friendlyError(bad);
  }
  const { error } = await side.auth.updateUser({ password: next });
  // Choosing the password you already had is fine: it just signs you in.
  if (error && error.code !== 'same_password') return friendlyError(error);
  await side.auth.signOut({ scope: 'local' }).catch(() => {});
  const { error: signIn } = await supabase.auth.signInWithPassword({ email: email.trim(), password: next });
  return signIn ? friendlyError(signIn) : '';
}

/** Changes your password once your current one checks out. Returns an error to show, or an empty string. */
export async function changePassword(email: string, current: string, next: string): Promise<string> {
  if (!current) return 'Type your current password.';
  if (next === current) return 'Pick a password different from your current one.';
  // Checked on a side client, so a wrong guess doesn't touch your sign-in.
  const side = sideClient();
  const { error: wrong } = await side.auth.signInWithPassword({ email, password: current });
  if (wrong) return wrong.code === 'invalid_credentials' || /invalid login credentials/i.test(wrong.message) ? "That isn't your current password." : friendlyError(wrong);
  await side.auth.signOut({ scope: 'local' }).catch(() => {});
  const { error } = await supabase.auth.updateUser({ password: next });
  return error ? friendlyError(error) : '';
}
