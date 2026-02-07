/**
 * Cross-Device Identity Recovery Service
 *
 * Manages SSS share storage and recovery sessions in Redis.
 * Key patterns:
 *   recovery:config:{ownerPubkey}                          — Hash (threshold, guardians JSON, createdAt)
 *   recovery:share:{guardianPubkey}:{ownerPubkey}          — Hash (encryptedShare, shareIndex, createdAt)
 *   recovery:session:{sessionId}                           — Hash (ownerPubkey, ephemeralPubkey, status, approvals, threshold, createdAt)
 *   recovery:session:{sessionId}:share:{guardianPubkey}    — String (re-encrypted share)
 */
import crypto from 'crypto';
import {
    redis,
    setHash,
    getHash,
    getString,
    setStringWithExpiry,
    setExpiry,
    deleteKey,
    findKeys,
} from './redis.js';

// ─── Types ───

export interface RecoveryConfig {
    ownerPubkey: string;
    threshold: number;
    guardianPubkeys: string;     // JSON stringified string[]
    createdAt: string;
}

export interface GuardianShare {
    encryptedShare: string;      // base64 NaCl box ciphertext
    ownerPubkey: string;
    shareIndex: number;
    createdAt: string;
}

export interface RecoverySession {
    sessionId: string;
    ownerPubkey: string;
    ephemeralPubkey: string;     // base58 X25519 public key from requester's temp keypair
    status: 'pending' | 'ready' | 'expired';
    approvals: number;
    threshold: number;
    guardianPubkeys: string;    // JSON stringified string[] (valid guardians for this identity)
    createdAt: string;
}

// ─── Key builders ───

function configKey(owner: string): string {
    return `recovery:config:${owner}`;
}

function shareKey(guardian: string, owner: string): string {
    return `recovery:share:${guardian}:${owner}`;
}

function sessionKey(sessionId: string): string {
    return `recovery:session:${sessionId}`;
}

function sessionShareKey(sessionId: string, guardian: string): string {
    return `recovery:session:${sessionId}:share:${guardian}`;
}

const SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds

// ─── Recovery Config (share distribution) ───

/**
 * Store recovery configuration and encrypted shares for each guardian.
 */
export async function distributeShares(
    ownerPubkey: string,
    threshold: number,
    guardians: { pubkey: string; encryptedShare: string; shareIndex: number }[],
): Promise<void> {
    // Store config
    const cfg: RecoveryConfig = {
        ownerPubkey,
        threshold,
        guardianPubkeys: JSON.stringify(guardians.map(g => g.pubkey)),
        createdAt: new Date().toISOString(),
    };
    await setHash(configKey(ownerPubkey), cfg as unknown as Record<string, any>);

    // Store each share
    for (const g of guardians) {
        const share: GuardianShare = {
            encryptedShare: g.encryptedShare,
            ownerPubkey,
            shareIndex: g.shareIndex,
            createdAt: new Date().toISOString(),
        };
        await setHash(shareKey(g.pubkey, ownerPubkey), share as unknown as Record<string, any>);
    }
}

/**
 * Get recovery config for an identity
 */
export async function getRecoveryConfig(ownerPubkey: string): Promise<RecoveryConfig | null> {
    const data = await getHash(configKey(ownerPubkey));
    if (!data || !data.ownerPubkey) return null;
    return data as unknown as RecoveryConfig;
}

/**
 * Get the encrypted share that a specific guardian holds for a specific owner
 */
export async function getShareForGuardian(guardianPubkey: string, ownerPubkey: string): Promise<GuardianShare | null> {
    const data = await getHash(shareKey(guardianPubkey, ownerPubkey));
    if (!data || !data.encryptedShare) return null;
    return data as unknown as GuardianShare;
}

/**
 * List all identities a guardian is protecting (all owner pubkeys)
 */
export async function getGuardianships(guardianPubkey: string): Promise<string[]> {
    const keys = await findKeys(`recovery:share:${guardianPubkey}:*`);
    // Extract owner pubkey from key pattern "recovery:share:{guardian}:{owner}"
    return keys.map(k => {
        const parts = k.split(':');
        return parts[parts.length - 1];
    });
}

/**
 * Revoke all recovery shares for an identity (e.g. when changing guardians)
 */
export async function revokeShares(ownerPubkey: string): Promise<void> {
    const cfg = await getRecoveryConfig(ownerPubkey);
    if (cfg) {
        const guardians: string[] = JSON.parse(cfg.guardianPubkeys);
        for (const g of guardians) {
            await deleteKey(shareKey(g, ownerPubkey));
        }
    }
    await deleteKey(configKey(ownerPubkey));
}

// ─── Recovery Sessions ───

/**
 * Create a new recovery session (initiated from a new device)
 */
export async function createSession(
    ownerPubkey: string,
    ephemeralPubkey: string,
    requestedGuardians: string[],
): Promise<RecoverySession> {
    const cfg = await getRecoveryConfig(ownerPubkey);
    if (!cfg) throw new Error('No recovery config found for this identity');

    const validGuardians: string[] = JSON.parse(cfg.guardianPubkeys);

    // Validate requested guardians are actually guardians
    for (const g of requestedGuardians) {
        if (!validGuardians.includes(g)) {
            throw new Error(`${g} is not a guardian for this identity`);
        }
    }

    const sessionId = crypto.randomUUID();
    const session: RecoverySession = {
        sessionId,
        ownerPubkey,
        ephemeralPubkey,
        status: 'pending',
        approvals: 0,
        threshold: Number(cfg.threshold),
        guardianPubkeys: JSON.stringify(requestedGuardians),
        createdAt: new Date().toISOString(),
    };

    await setHash(sessionKey(sessionId), session as unknown as Record<string, any>);
    await setExpiry(sessionKey(sessionId), SESSION_TTL);

    return session;
}

/**
 * Get a recovery session by ID
 */
export async function getSession(sessionId: string): Promise<RecoverySession | null> {
    const data = await getHash(sessionKey(sessionId));
    if (!data || !data.sessionId) return null;
    return {
        ...data,
        approvals: Number(data.approvals),
        threshold: Number(data.threshold),
    } as unknown as RecoverySession;
}

/**
 * Guardian approves recovery — stores their re-encrypted share and increments approval count
 */
export async function approveSession(
    sessionId: string,
    guardianPubkey: string,
    reEncryptedShare: string,
): Promise<{ approved: boolean; approvalsReceived: number; thresholdRequired: number }> {
    const session = await getSession(sessionId);
    if (!session) throw new Error('Session not found or expired');
    if (session.status !== 'pending') throw new Error(`Session is ${session.status}`);

    const guardians: string[] = JSON.parse(session.guardianPubkeys);
    if (!guardians.includes(guardianPubkey)) {
        throw new Error('Not a valid guardian for this session');
    }

    // Check if already approved
    const existing = await getString(sessionShareKey(sessionId, guardianPubkey));
    if (existing) throw new Error('Guardian already approved this session');

    // Store the re-encrypted share with same TTL as session
    await setStringWithExpiry(sessionShareKey(sessionId, guardianPubkey), reEncryptedShare, SESSION_TTL);

    // Increment approvals
    const newCount = session.approvals + 1;
    const updates: Record<string, any> = { approvals: newCount };
    if (newCount >= session.threshold) {
        updates.status = 'ready';
    }
    await setHash(sessionKey(sessionId), updates);

    return {
        approved: true,
        approvalsReceived: newCount,
        thresholdRequired: session.threshold,
    };
}

/**
 * Get all released shares for a ready session (only when threshold met)
 */
export async function getReleasedShares(
    sessionId: string,
): Promise<{ guardianPubkey: string; reEncryptedShare: string }[]> {
    const session = await getSession(sessionId);
    if (!session) throw new Error('Session not found or expired');
    if (session.status !== 'ready') throw new Error('Session not ready — more approvals needed');

    const guardians: string[] = JSON.parse(session.guardianPubkeys);
    const shares: { guardianPubkey: string; reEncryptedShare: string }[] = [];

    for (const g of guardians) {
        const share = await getString(sessionShareKey(sessionId, g));
        if (share) {
            shares.push({ guardianPubkey: g, reEncryptedShare: share });
        }
    }

    return shares;
}
