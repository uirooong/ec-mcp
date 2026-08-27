import { webcrypto } from 'node:crypto';

const encoder = new TextEncoder();
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function base64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let keyPairPromise: Promise<DpopKeyPair> | undefined;

export interface DpopKeyPair {
  privateKey: CryptoKey;
}

async function getKeyPair(): Promise<DpopKeyPair> {
  if (!keyPairPromise) {
    keyPairPromise = webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    ).then(privateKey => {
      if (privateKey instanceof CryptoKey) {
        return { privateKey };
      }
      const privateKeyPair = privateKey as { privateKey: CryptoKey };
      return { privateKey: privateKeyPair.privateKey };
    });
  }
  return keyPairPromise;
}

export async function generateDpopJwt(method: string, fullUrl: string): Promise<string> {
  const { privateKey } = await getKeyPair();
  const jwk = await webcrypto.subtle.exportKey('jwk', privateKey);
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
    uuid: ZERO_UUID
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
