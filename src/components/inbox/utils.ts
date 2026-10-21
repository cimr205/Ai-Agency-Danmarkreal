export function getInitials(name: string | null | undefined, email: string | undefined) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

export function displayName(name: string | null | undefined, email: string | undefined, fallback: string) {
  return name?.trim() || email || fallback;
}
