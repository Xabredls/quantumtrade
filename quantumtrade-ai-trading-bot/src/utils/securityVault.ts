/**
 * Industrial-standard Web Cryptography API implementation
 * Uses AES-GCM (256-bit) with PBKDF2 (100,000 iterations, SHA-256)
 * for military-grade client-side key storage and encrypted JSON backups.
 */

// Helper to convert buffer to base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert base64 to buffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an AES-GCM key from a master passphrase using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an arbitrary object or string with AES-GCM using a user master password
 */
export async function encryptPayload(data: any, masterPassword: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);
  
  const enc = new TextEncoder();
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const encodedData = enc.encode(plaintext);

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    encodedData
  );

  const payload = {
    v: 1,
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    data: bufferToBase64(ciphertextBuffer),
    timestamp: Date.now(),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypts AES-GCM ciphertext payload using the master password
 */
export async function decryptPayload<T = any>(encryptedJson: string, masterPassword: string): Promise<T> {
  const parsed = JSON.parse(encryptedJson);
  if (!parsed.salt || !parsed.iv || !parsed.data) {
    throw new Error('Invalid encrypted backup payload structure');
  }

  const salt = new Uint8Array(base64ToBuffer(parsed.salt));
  const iv = new Uint8Array(base64ToBuffer(parsed.iv));
  const ciphertext = base64ToBuffer(parsed.data);

  const key = await deriveKey(masterPassword, salt);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  const plaintext = dec.decode(decryptedBuffer);

  try {
    return JSON.parse(plaintext);
  } catch {
    return plaintext as unknown as T;
  }
}

/**
 * Generates downloadable backup file trigger
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
