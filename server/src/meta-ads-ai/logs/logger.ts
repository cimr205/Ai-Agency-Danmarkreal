export function logMetaAutomation(
  companyId: string,
  actionType: 'pause' | 'scale' | 'duplicate',
  status: 'ok' | 'error',
  message: string
): void {
  const line = `[meta-automation] company=${companyId} action=${actionType} status=${status} — ${message}`;
  if (status === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}
