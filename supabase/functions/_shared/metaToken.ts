function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('META_TOKEN_ENCRYPTION_KEY')
  if (!secret || secret.length < 32) throw new Error('META_TOKEN_ENCRYPTION_KEY must be at least 32 characters')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptMetaToken(token: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(token),
  )
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) }
}

export async function decryptMetaToken(ciphertext: string, encodedIv: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(encodedIv) }, await encryptionKey(), fromBase64(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}
