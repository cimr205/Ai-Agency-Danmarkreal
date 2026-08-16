const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)] as string;
}

export function generateInviteCode() {
  return `${randomChar()}${randomChar()}${randomChar()}${randomChar()}-${randomChar()}${randomChar()}${randomChar()}${randomChar()}`;
}
