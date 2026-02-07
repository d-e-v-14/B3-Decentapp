/**
 * Cross-Device Identity Recovery — Client Module
 *
 * Implements Shamir's Secret Sharing for splitting/reconstructing Ed25519 keys,
 * and orchestrates the recovery request / guardian approval flow.
 *
 * Cryptographic flow:
 *   SETUP:  secretKey → SSS split → N shares → NaCl box each to guardian's X25519 key → POST to server
 *   RECOVER: ephemeral keypair → request session → guardians decrypt + re-encrypt → collect K shares → SSS combine → secretKey
 *
 * Dependency: `secrets.js-grempe` (pure JS Shamir SSS over GF(256))
 *   - Install: `npx expo install secrets.js-grempe`
 *   - The share format is hex strings
 */
import nacl from 'tweetnacl';
import { getStoredKeypair, storeKeypair, getStoredUsername, storeUsername } from './keychain';
import {
    signMessage,
    uint8ToBase64,
    base64ToUint8,
    uint8ToBase58,
    base58ToUint8,
    uint8ToHex,
    hexToUint8,
    getEncryptionKeypair,
    encryptMessage,
    decryptMessage,
    KeyPair,
} from './crypto';
import { lookupUser } from './api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

// ─── Types ───

export interface RecoverySetupResult {
    guardianCount: number;
    threshold: number;
}

export interface RecoverySessionInfo {
    sessionId: string;
    status: 'pending' | 'ready' | 'expired';
    approvalsReceived: number;
    thresholdRequired: number;
    ownerPubkey: string;
}

export interface GuardianInfo {
    configured: boolean;
    guardians: string[];
    threshold: number;
    createdAt?: string;
}

// ─── Shamir SSS wrapper ───
// We lazy-import secrets.js-grempe to avoid bundling issues on platforms
// that don't support it. The library works in pure JS.

let _secrets: any = null;

async function getSecrets() {
    if (!_secrets) {
        // Dynamic import — secrets.js-grempe exports a default object
        const mod = await import('secrets.js-grempe');
        _secrets = mod.default || mod;
    }
    return _secrets;
}

/**
 * Split a secret (Uint8Array) into N shares with threshold K.
 * Returns hex-encoded share strings.
 */
async function splitSecret(secret: Uint8Array, numShares: number, threshold: number): Promise<string[]> {
    const secrets = await getSecrets();
    const hex = uint8ToHex(secret);
    return secrets.share(hex, numShares, threshold);
}

/**
 * Combine K hex-encoded shares back into the original secret.
 */
async function combineShares(shares: string[]): Promise<Uint8Array> {
    const secrets = await getSecrets();
    const hex = secrets.combine(shares);
    return hexToUint8(hex);
}

// ─── Helpers ───

function sign(message: string, secretKey: Uint8Array): string {
    return uint8ToBase64(signMessage(new TextEncoder().encode(message), secretKey));
}

// ─── Setup: Distribute shares to guardians ───

/**
 * Split the current identity's secret key and distribute encrypted shares to guardians.
 *
 * @param guardianUsernames  - Array of guardian usernames (must have registered encryption keys)
 * @param threshold          - Minimum number of guardians needed to recover (K-of-N)
 */
export async function setupRecovery(
    guardianUsernames: string[],
    threshold: number,
): Promise<RecoverySetupResult> {
    if (threshold < 2) throw new Error('Threshold must be at least 2');
    if (guardianUsernames.length < threshold) {
        throw new Error('Need at least as many guardians as the threshold');
    }

    const keypair = await getStoredKeypair();
    if (!keypair) throw new Error('No identity keypair found');

    const senderPubkey = uint8ToBase58(keypair.publicKey);
    const senderEncKp = getEncryptionKeypair(keypair);

    // 1. Split the 64-byte secret key into shares
    const shares = await splitSecret(keypair.secretKey, guardianUsernames.length, threshold);

    // 2. For each guardian: look up their encryption key + encrypt the share
    const guardians: { pubkey: string; encryptedShare: string; shareIndex: number }[] = [];

    for (let i = 0; i < guardianUsernames.length; i++) {
        const user = await lookupUser(guardianUsernames[i]);
        if (!user || !user.encryptionKey) {
            throw new Error(`Guardian @${guardianUsernames[i]} not found or has no encryption key`);
        }

        const guardianEncPubKey = base64ToUint8(user.encryptionKey);

        // Encrypt the hex share string to the guardian's X25519 key
        const encryptedShare = encryptMessage(shares[i], guardianEncPubKey, senderEncKp.secretKey);

        guardians.push({
            pubkey: user.publicKey, // guardian's Ed25519 pubkey (base58)
            encryptedShare,
            shareIndex: i,
        });
    }

    // 3. Sign and submit to server
    const timestamp = Date.now();
    const signature = sign(`recovery:distribute:${timestamp}`, keypair.secretKey);

    const response = await fetch(`${API_BASE_URL}/api/recovery/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            senderPubkey,
            threshold,
            guardians,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to distribute shares');
    }

    return response.json();
}

// ─── Recovery: Initiate from a new device ───

/**
 * Start a recovery session. Called from a device that does NOT have the keypair.
 *
 * @param ownerPubkey        - The base58 pubkey of the identity to recover (user must know this)
 * @param requestedGuardians - Array of guardian pubkeys to contact
 * @returns Session info including sessionId
 */
export async function requestRecovery(
    ownerPubkey: string,
    requestedGuardians: string[],
): Promise<{ sessionId: string; threshold: number; ephemeralKeypair: KeyPair }> {
    // Generate an ephemeral X25519 keypair for this recovery session
    const ephemeralSignKp = nacl.sign.keyPair();
    const ephemeralEncKp = nacl.box.keyPair();
    const ephemeralPubkey = uint8ToBase58(ephemeralEncKp.publicKey);

    const response = await fetch(`${API_BASE_URL}/api/recovery/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ownerPubkey,
            ephemeralPubkey,
            requestedGuardians,
        }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to request recovery');
    }

    const data = await response.json();

    // Return the ephemeral keypair so the caller can store it temporarily
    // (needed to decrypt the released shares later)
    return {
        sessionId: data.sessionId,
        threshold: data.threshold,
        ephemeralKeypair: {
            publicKey: ephemeralEncKp.publicKey,
            secretKey: ephemeralEncKp.secretKey,
        },
    };
}

/**
 * Poll session status.
 */
export async function getSessionStatus(sessionId: string): Promise<RecoverySessionInfo> {
    const response = await fetch(`${API_BASE_URL}/api/recovery/session/${sessionId}/status`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get session status');
    }
    return response.json();
}

/**
 * Fetch released shares and reconstruct the identity.
 * Call this when session status is 'ready'.
 *
 * @param sessionId         - The recovery session ID
 * @param ephemeralSecretKey - The ephemeral X25519 secret key from requestRecovery()
 * @param ownerPubkey        - The identity's Ed25519 pubkey to verify reconstruction
 */
export async function reconstructIdentity(
    sessionId: string,
    ephemeralSecretKey: Uint8Array,
    ownerPubkey: string,
): Promise<{ success: boolean; username?: string }> {
    // 1. Fetch released shares (encrypted to our ephemeral key)
    const response = await fetch(`${API_BASE_URL}/api/recovery/session/${sessionId}/shares`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch shares');
    }

    const { shares } = await response.json() as {
        shares: { guardianPubkey: string; reEncryptedShare: string }[];
    };

    if (shares.length === 0) {
        throw new Error('No shares available');
    }

    // 2. Decrypt each re-encrypted share with ephemeral secret key
    const rawShares: string[] = [];
    for (const s of shares) {
        // Each share was re-encrypted to our ephemeral key by the guardian
        // using NaCl box with the guardian's X25519 secret key as sender
        const guardianEncPubKey = base64ToUint8(
            // We need the guardian's encryption key to decrypt
            // The re-encrypted share format includes the guardian's enc pubkey
            s.reEncryptedShare.split(':')[0] || '',
        );

        // The re-encrypted share is a NaCl box ciphertext (base64)
        // Guardian encrypted: box(share, nonce, ephemeralPubkey, guardianSecretKey)
        // We decrypt with: box.open(ciphertext, nonce, guardianEncPubKey, ephemeralSecretKey)
        const decrypted = decryptMessage(
            s.reEncryptedShare,
            guardianEncPubKey,
            ephemeralSecretKey,
        );

        if (!decrypted) {
            console.warn(`Failed to decrypt share from guardian ${s.guardianPubkey}`);
            continue;
        }

        rawShares.push(decrypted);
    }

    // 3. Reconstruct secret key via Shamir SSS
    const secretKey = await combineShares(rawShares);

    // 4. Verify it matches the expected public key
    const reconstructedKp = nacl.sign.keyPair.fromSecretKey(secretKey);
    const reconstructedPubkey = uint8ToBase58(reconstructedKp.publicKey);

    if (reconstructedPubkey !== ownerPubkey) {
        throw new Error('Reconstructed key does not match expected identity');
    }

    // 5. Store recovered keypair in keychain
    await storeKeypair({
        publicKey: reconstructedKp.publicKey,
        secretKey: reconstructedKp.secretKey,
    });

    // 6. Recover username from API (on-chain lookup by owner pubkey)
    let username: string | undefined;
    try {
        const res = await fetch(`${API_BASE_URL}/api/username/owner/${ownerPubkey}`);
        if (res.ok) {
            const data = await res.json();
            username = data.username;
            if (username) {
                await storeUsername(username);
            }
        }
    } catch {
        console.warn('Username recovery failed — can be retried');
    }

    return { success: true, username };
}

// ─── Guardian side: approve a recovery request ───

/**
 * Approve a recovery session — decrypt own share and re-encrypt to the session's ephemeral key.
 *
 * @param sessionId      - The recovery session to approve
 * @param ownerPubkey    - The identity being recovered
 * @param ephemeralPubkeyBase58 - The session's ephemeral public key (from session status)
 */
export async function approveRecovery(
    sessionId: string,
    ownerPubkey: string,
    ephemeralPubkeyBase58: string,
): Promise<{ approved: boolean; approvalsReceived: number; thresholdRequired: number }> {
    const keypair = await getStoredKeypair();
    if (!keypair) throw new Error('No identity keypair found');

    const guardianPubkey = uint8ToBase58(keypair.publicKey);
    const guardianEncKp = getEncryptionKeypair(keypair);

    // 1. Fetch our encrypted share from the server
    // The share was encrypted by the owner TO our X25519 key
    // We need the owner's encryption key to decrypt
    const ownerUser = await lookupUser(''); // We need to look up by pubkey, not username
    // Alternative: fetch the share directly from server
    const shareRes = await fetch(`${API_BASE_URL}/api/recovery/guardianships/${guardianPubkey}`);
    if (!shareRes.ok) throw new Error('Failed to fetch guardianships');

    // For now, the share is stored server-side. We need an endpoint to fetch it.
    // The guardian's encrypted share can be retrieved during the approval flow.
    // In the current design, the guardian already has the encrypted share stored on the server.

    // 2. Look up owner's encryption public key (needed to decrypt the share)
    const ownerEncPubKey = await getOwnerEncryptionKey(ownerPubkey);
    if (!ownerEncPubKey) throw new Error('Could not find owner encryption key');

    // 3. Fetch our specific encrypted share
    // This would require an additional API endpoint:  GET /api/recovery/share/:ownerPubkey
    // For now, we'll include it in the approval flow on the server side
    // The guardian decrypts locally and re-encrypts to ephemeral key

    // 4. Re-encrypt the share to the ephemeral key
    const ephemeralPubKey = base58ToUint8(ephemeralPubkeyBase58);

    // Sign approval
    const timestamp = Date.now();
    const signature = sign(`recovery:approve:${sessionId}:${timestamp}`, keypair.secretKey);

    // In a full implementation, the guardian would:
    // a) fetch their encrypted share from GET /api/recovery/share/:ownerPubkey
    // b) decrypt it with nacl.box.open(ciphertext, nonce, ownerEncPubKey, guardianEncSecretKey)
    // c) re-encrypt to ephemeral key: nacl.box(share, nonce, ephemeralPubKey, guardianEncSecretKey)
    // d) submit the re-encrypted share

    // Placeholder — submit re-encrypted share
    const reEncryptedShare = ''; // Will be filled in the complete flow

    const response = await fetch(`${API_BASE_URL}/api/recovery/session/${sessionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            guardianPubkey,
            reEncryptedShare,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Approval failed');
    }

    return response.json();
}

/**
 * Get recovery configuration for an identity (public info: guardians + threshold).
 */
export async function getGuardianConfig(pubkey: string): Promise<GuardianInfo> {
    const response = await fetch(`${API_BASE_URL}/api/recovery/guardians/${pubkey}`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get guardian config');
    }
    return response.json();
}

/**
 * Revoke all recovery shares (e.g. when changing guardians).
 */
export async function revokeRecovery(): Promise<void> {
    const keypair = await getStoredKeypair();
    if (!keypair) throw new Error('No identity keypair found');

    const senderPubkey = uint8ToBase58(keypair.publicKey);
    const timestamp = Date.now();
    const signature = sign(`recovery:revoke:${timestamp}`, keypair.secretKey);

    const response = await fetch(`${API_BASE_URL}/api/recovery/revoke`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderPubkey, signature, timestamp }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to revoke recovery');
    }
}

// ─── Internal helpers ───

async function getOwnerEncryptionKey(ownerPubkey: string): Promise<Uint8Array | null> {
    try {
        // Look up owner by pubkey → get their username → get encryption key
        const res = await fetch(`${API_BASE_URL}/api/username/owner/${ownerPubkey}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.encryptionKey) {
            return base64ToUint8(data.encryptionKey);
        }
        // If we got a username, look it up
        if (data.username) {
            const user = await lookupUser(data.username);
            if (user?.encryptionKey) {
                return base64ToUint8(user.encryptionKey);
            }
        }
        return null;
    } catch {
        return null;
    }
}
