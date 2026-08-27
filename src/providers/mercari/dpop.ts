import { webcrypto } from 'node:crypto';

const encoder = new TextEncoder();

function base64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Use the node:crypto webcrypto CryptoKey type rather than the DOM lib's, which
// diverge under @types/node and would otherwise fail assignability.
type DpopCryptoKey = webcrypto.CryptoKey;

export interface DpopKeyPair {
  privateKey: DpopCryptoKey;
  publicKey: DpopCryptoKey;
}

let keyPairPromise: Promise<DpopKeyPair> | undefined;

function getKeyPair(): Promise<DpopKeyPair> {
  if (keyPairPromise === undefined) {
    keyPairPromise = webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    ).then(keyPair => ({
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey
    }));
  }
  return keyPairPromise;
}

export async function generateDpopJwt(
  method: string,
  fullUrl: string,
  deviceId = crypto.randomUUID()
): Promise<string> {
  const { privateKey, publicKey } = await getKeyPair();
  const jwk = await webcrypto.subtle.exportKey('jwk', publicKey);
  delete jwk.key_ops;
  delete jwk.ext;

  const header = base64urlEncode(JSON.stringify({
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk
  }));
  const payloadObject = {
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
    htu: fullUrl,
    htm: method.toUpperCase(),
    uuid: deviceId
  };
  const payload = base64urlEncode(JSON.stringify(payloadObject));
  const signingInput = `${header}.${payload}`;
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}
