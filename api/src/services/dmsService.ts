/**
 * Dead Man's Switch Service
 *
 * Manages DMS metadata in Redis and encrypted payloads on Arweave.
 * Key patterns:
 *   dms:switch:{switchId}   — Hash  (sender, recipient, arweaveTxId, interval, deadline, status, etc.)
 *   dms:user:{pubkey}       — Set   (all switchIds belonging to a user)
 *   dms:active              — Set   (global index of active switchIds for cron scanning)
 */
import crypto from 'crypto';
import {
    redis,
    setHash,
    getHash,
    getHashField,
    findKeys,
} from './redis.js';

// ─── Types ───

export interface DMSSwitch {
    switchId: string;
    senderPubkey: string;
    recipientUsername: string;
    arweaveTxId: string;
    intervalHours: number;
    nextDeadline: string;         // ISO-8601
    status: 'active' | 'triggered' | 'cancelled';
    createdAt: string;            // ISO-8601
    triggeredAt?: string;
}

export interface DMSSwitchInput {
    senderPubkey: string;
    recipientUsername: string;
    arweaveTxId: string;
    intervalHours: number;
}

// ─── Helpers ───

function switchKey(switchId: string): string {
    return `dms:switch:${switchId}`;
}

function userSwitchesKey(pubkey: string): string {
    return `dms:user:${pubkey}`;
}

const ACTIVE_SET = 'dms:active';

function generateSwitchId(): string {
    return crypto.randomUUID();
}

// ─── CRUD ───

/**
 * Create a new DMS switch entry
 */
export async function createSwitch(input: DMSSwitchInput): Promise<DMSSwitch> {
    const switchId = generateSwitchId();
    const now = new Date();
    const deadline = new Date(now.getTime() + input.intervalHours * 60 * 60 * 1000);

    const record: DMSSwitch = {
        switchId,
        senderPubkey: input.senderPubkey,
        recipientUsername: input.recipientUsername,
        arweaveTxId: input.arweaveTxId,
        intervalHours: input.intervalHours,
        nextDeadline: deadline.toISOString(),
        status: 'active',
        createdAt: now.toISOString(),
    };

    // Store the switch hash
    await setHash(switchKey(switchId), record as unknown as Record<string, any>);

    // Add to user's switch set
    await redis.sadd(userSwitchesKey(input.senderPubkey), switchId);

    // Add to global active index
    await redis.sadd(ACTIVE_SET, switchId);

    return record;
}

/**
 * Get a single switch by ID
 */
export async function getSwitch(switchId: string): Promise<DMSSwitch | null> {
    const data = await getHash(switchKey(switchId));
    if (!data || !data.switchId) return null;
    return data as unknown as DMSSwitch;
}

/**
 * List all switches for a user
 */
export async function getUserSwitches(pubkey: string): Promise<DMSSwitch[]> {
    const ids = await redis.smembers(userSwitchesKey(pubkey)) as string[];
    if (!ids || ids.length === 0) return [];

    const switches: DMSSwitch[] = [];
    for (const id of ids) {
        const sw = await getSwitch(id);
        if (sw) switches.push(sw);
    }
    return switches;
}

/**
 * Refresh the deadline for ALL active switches of a user (heartbeat / check-in)
 */
export async function refreshDeadlines(pubkey: string): Promise<{ count: number; nextDeadline: string | null }> {
    const switches = await getUserSwitches(pubkey);
    const active = switches.filter(s => s.status === 'active');
    let latestDeadline: string | null = null;

    for (const sw of active) {
        const deadline = new Date(Date.now() + Number(sw.intervalHours) * 60 * 60 * 1000);
        const iso = deadline.toISOString();
        await setHash(switchKey(sw.switchId), { nextDeadline: iso });
        if (!latestDeadline || iso > latestDeadline) latestDeadline = iso;
    }

    return { count: active.length, nextDeadline: latestDeadline };
}

/**
 * Cancel a switch — marks as cancelled and removes from active index
 */
export async function cancelSwitch(switchId: string, requesterPubkey: string): Promise<boolean> {
    const sw = await getSwitch(switchId);
    if (!sw) return false;
    if (sw.senderPubkey !== requesterPubkey) return false;

    await setHash(switchKey(switchId), { status: 'cancelled' });
    await redis.srem(ACTIVE_SET, switchId);
    await redis.srem(userSwitchesKey(requesterPubkey), switchId);

    return true;
}

/**
 * Get all overdue active switches (nextDeadline < now)
 */
export async function getOverdueSwitches(): Promise<DMSSwitch[]> {
    const activeIds = await redis.smembers(ACTIVE_SET) as string[];
    if (!activeIds || activeIds.length === 0) return [];

    const now = new Date();
    const overdue: DMSSwitch[] = [];

    for (const id of activeIds) {
        const sw = await getSwitch(id);
        if (!sw) {
            // Orphaned entry — clean up
            await redis.srem(ACTIVE_SET, id);
            continue;
        }
        if (sw.status !== 'active') {
            await redis.srem(ACTIVE_SET, id);
            continue;
        }
        if (new Date(sw.nextDeadline) < now) {
            overdue.push(sw);
        }
    }

    return overdue;
}

/**
 * Mark a switch as triggered
 */
export async function markTriggered(switchId: string): Promise<void> {
    await setHash(switchKey(switchId), {
        status: 'triggered',
        triggeredAt: new Date().toISOString(),
    });
    await redis.srem(ACTIVE_SET, switchId);
}
