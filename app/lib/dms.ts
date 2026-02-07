/**
 * Dead Man's Switch — Client Module
 *
 * Creates, checks in, lists, and cancels dead-letter switches via the API.
 * Encrypted message payloads are prepared client-side before submission.
 */
import { getStoredKeypair, getStoredUsername } from './keychain';
import {
    signMessage,
    uint8ToBase64,
    uint8ToBase58,
    encryptMessage,
    getEncryptionKeypair,
} from './crypto';
import { lookupUser } from './api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

// ─── Types ───

export interface DMSSwitchInfo {
    switchId: string;
    recipientUsername: string;
    intervalHours: number;
    nextDeadline: string;
    status: 'active' | 'triggered' | 'cancelled';
    createdAt: string;
    triggeredAt?: string;
}

// ─── Helpers ───

async function getKeypairOrThrow() {
    const keypair = await getStoredKeypair();
    if (!keypair) throw new Error('No identity keypair found');
    return keypair;
}

function sign(message: string, secretKey: Uint8Array): string {
    return uint8ToBase64(signMessage(new TextEncoder().encode(message), secretKey));
}

// ─── API Calls ───

/**
 * Create a dead letter switch.
 * Encrypts the plaintext message to the recipient's X25519 public key
 * before sending to the server.
 */
export async function createDeadLetter(
    recipientUsername: string,
    plaintext: string,
    checkInIntervalHours: number,
): Promise<{ switchId: string; nextDeadline: string }> {
    const keypair = await getKeypairOrThrow();
    const senderPubkey = uint8ToBase58(keypair.publicKey);

    // Look up recipient's encryption key
    const recipient = await lookupUser(recipientUsername);
    if (!recipient || !recipient.encryptionKey) {
        throw new Error(`Recipient @${recipientUsername} not found or has no encryption key`);
    }

    // Encrypt message to recipient
    const senderEncKp = getEncryptionKeypair(keypair);
    const recipientEncPubKey = Uint8Array.from(
        atob(recipient.encryptionKey)
            .split('')
            .map(c => c.charCodeAt(0)),
    );
    const encryptedMessage = encryptMessage(plaintext, recipientEncPubKey, senderEncKp.secretKey);

    // Sign request
    const timestamp = Date.now();
    const messageToSign = `dms:create:${recipientUsername}:${timestamp}`;
    const signature = sign(messageToSign, keypair.secretKey);

    const response = await fetch(`${API_BASE_URL}/api/dms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recipientUsername,
            encryptedMessage,
            checkInIntervalHours,
            senderPubkey,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create dead letter');
    }

    return response.json();
}

/**
 * Check in / heartbeat — extends all active switch deadlines.
 */
export async function checkIn(): Promise<{
    checkedIn: boolean;
    switchCount: number;
    nextDeadline: string | null;
}> {
    const keypair = await getKeypairOrThrow();
    const senderPubkey = uint8ToBase58(keypair.publicKey);

    const timestamp = Date.now();
    const messageToSign = `dms:checkin:${timestamp}`;
    const signature = sign(messageToSign, keypair.secretKey);

    const response = await fetch(`${API_BASE_URL}/api/dms/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderPubkey, signature, timestamp }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Check-in failed');
    }

    return response.json();
}

/**
 * List all switches belonging to the current user.
 */
export async function listSwitches(): Promise<DMSSwitchInfo[]> {
    const keypair = await getKeypairOrThrow();
    const pubkey = uint8ToBase58(keypair.publicKey);

    const response = await fetch(`${API_BASE_URL}/api/dms/list/${pubkey}`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to list switches');
    }

    const data = await response.json();
    return data.switches;
}

/**
 * Cancel / delete a switch.
 */
export async function cancelDeadLetter(switchId: string): Promise<void> {
    const keypair = await getKeypairOrThrow();
    const senderPubkey = uint8ToBase58(keypair.publicKey);

    const timestamp = Date.now();
    const messageToSign = `dms:cancel:${switchId}:${timestamp}`;
    const signature = sign(messageToSign, keypair.secretKey);

    const response = await fetch(`${API_BASE_URL}/api/dms/${switchId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderPubkey, signature, timestamp }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to cancel switch');
    }
}

/**
 * Calculate time remaining until next check-in deadline.
 */
export function getTimeRemaining(deadline: string): {
    hours: number;
    minutes: number;
    isOverdue: boolean;
    label: string;
} {
    const diff = new Date(deadline).getTime() - Date.now();
    const isOverdue = diff < 0;
    const absDiff = Math.abs(diff);
    const hours = Math.floor(absDiff / (60 * 60 * 1000));
    const minutes = Math.floor((absDiff % (60 * 60 * 1000)) / (60 * 1000));

    let label: string;
    if (isOverdue) {
        label = `Overdue by ${hours}h ${minutes}m`;
    } else if (hours > 24) {
        const days = Math.floor(hours / 24);
        label = `${days}d ${hours % 24}h remaining`;
    } else {
        label = `${hours}h ${minutes}m remaining`;
    }

    return { hours, minutes, isOverdue, label };
}
