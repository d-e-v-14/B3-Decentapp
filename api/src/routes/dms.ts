/**
 * Dead Man's Switch API Routes
 *
 * POST   /api/dms/create    — Create a dead letter switch
 * POST   /api/dms/checkin   — Heartbeat / extend deadlines
 * GET    /api/dms/list/:pubkey — List user's switches
 * DELETE /api/dms/:switchId — Cancel a switch
 * POST   /api/dms/process   — Cron endpoint: deliver overdue messages
 */
import { Router, Request, Response } from 'express';
import { verifySignature } from '../middleware/auth.js';
import { config } from '../config.js';
import { uploadToArweave } from '../services/arweaveService.js';
import { getUserAccount } from '../services/solana.js';
import {
    createSwitch,
    getSwitch,
    getUserSwitches,
    refreshDeadlines,
    cancelSwitch,
    getOverdueSwitches,
    markTriggered,
} from '../services/dmsService.js';

const router = Router();

// ─── POST /create ───
router.post('/create', async (req: Request, res: Response) => {
    try {
        const {
            recipientUsername,
            encryptedMessage,
            checkInIntervalHours,
            senderPubkey,
            signature,
            timestamp,
        } = req.body as {
            recipientUsername: string;
            encryptedMessage: string;
            checkInIntervalHours: number;
            senderPubkey: string;
            signature: string;
            timestamp: number;
        };

        // Validate required fields
        if (!recipientUsername || !encryptedMessage || !checkInIntervalHours || !senderPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (checkInIntervalHours < 1 || checkInIntervalHours > 8760) { // max 1 year
            return res.status(400).json({ error: 'Interval must be between 1 and 8760 hours' });
        }

        // Auth — Ed25519 signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `dms:create:${recipientUsername}:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Verify recipient exists on-chain
        const recipientAccount = await getUserAccount(recipientUsername);
        if (!recipientAccount || typeof recipientAccount === 'string') {
            return res.status(404).json({ error: 'Recipient username not found on-chain' });
        }

        // Upload encrypted payload to Arweave for permanent storage
        let arweaveTxId: string;
        try {
            arweaveTxId = await uploadToArweave(encryptedMessage);
        } catch (err) {
            console.error('Arweave upload failed, storing in Redis fallback:', err);
            // Fallback: use a pseudo arweave ID and store in Redis via message blob
            const { storeMessageBlob } = await import('../services/redis.js');
            const fallbackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await storeMessageBlob(`dms:${fallbackId}`, encryptedMessage, 365 * 24 * 60 * 60); // 1 year TTL
            arweaveTxId = `local:${fallbackId}`;
        }

        // Create the switch record
        const sw = await createSwitch({
            senderPubkey,
            recipientUsername,
            arweaveTxId,
            intervalHours: checkInIntervalHours,
        });

        console.log(`💀 DMS created: ${sw.switchId} by ${senderPubkey.slice(0, 8)}... → @${recipientUsername}, interval=${checkInIntervalHours}h`);

        return res.json({
            success: true,
            switchId: sw.switchId,
            nextDeadline: sw.nextDeadline,
        });
    } catch (error) {
        console.error('DMS create error:', error);
        return res.status(500).json({ error: 'Failed to create dead man\'s switch' });
    }
});

// ─── POST /checkin ───
router.post('/checkin', async (req: Request, res: Response) => {
    try {
        const { senderPubkey, signature, timestamp } = req.body as {
            senderPubkey: string;
            signature: string;
            timestamp: number;
        };

        if (!senderPubkey || !signature || !timestamp) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expectedMessage = `dms:checkin:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const result = await refreshDeadlines(senderPubkey);

        console.log(`💓 DMS check-in: ${senderPubkey.slice(0, 8)}... refreshed ${result.count} switches`);

        return res.json({
            success: true,
            checkedIn: true,
            switchCount: result.count,
            nextDeadline: result.nextDeadline,
        });
    } catch (error) {
        console.error('DMS check-in error:', error);
        return res.status(500).json({ error: 'Failed to check in' });
    }
});

// ─── GET /list/:pubkey ───
router.get('/list/:pubkey', async (req: Request, res: Response) => {
    try {
        const pubkey = req.params.pubkey as string;
        const switches = await getUserSwitches(pubkey);

        // Return metadata only — never expose encrypted payloads
        const list = switches.map(sw => ({
            switchId: sw.switchId,
            recipientUsername: sw.recipientUsername,
            intervalHours: sw.intervalHours,
            nextDeadline: sw.nextDeadline,
            status: sw.status,
            createdAt: sw.createdAt,
            triggeredAt: sw.triggeredAt,
        }));

        return res.json({ switches: list });
    } catch (error) {
        console.error('DMS list error:', error);
        return res.status(500).json({ error: 'Failed to list switches' });
    }
});

// ─── DELETE /:switchId ───
router.delete('/:switchId', async (req: Request, res: Response) => {
    try {
        const switchId = req.params.switchId as string;
        const { senderPubkey, signature, timestamp } = req.body as {
            senderPubkey: string;
            signature: string;
            timestamp: number;
        };

        if (!senderPubkey || !signature || !timestamp) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expectedMessage = `dms:cancel:${switchId}:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const cancelled = await cancelSwitch(switchId, senderPubkey);
        if (!cancelled) {
            return res.status(404).json({ error: 'Switch not found or not owned by you' });
        }

        console.log(`🗑️  DMS cancelled: ${switchId} by ${senderPubkey.slice(0, 8)}...`);

        return res.json({ success: true });
    } catch (error) {
        console.error('DMS cancel error:', error);
        return res.status(500).json({ error: 'Failed to cancel switch' });
    }
});

// ─── POST /process (cron endpoint) ───
router.post('/process', async (req: Request, res: Response) => {
    try {
        // Authenticate cron caller via secret token
        const cronSecret = req.headers['x-cron-secret'] as string;
        if (!cronSecret || cronSecret !== config.dmsCronSecret) {
            return res.status(401).json({ error: 'Invalid cron secret' });
        }

        const overdue = await getOverdueSwitches();

        if (overdue.length === 0) {
            return res.json({ processed: 0, message: 'No overdue switches' });
        }

        let processed = 0;
        const errors: string[] = [];

        for (const sw of overdue) {
            try {
                // Resolve recipient pubkey from username
                const recipientAccount = await getUserAccount(sw.recipientUsername);
                if (!recipientAccount || typeof recipientAccount === 'string') {
                    errors.push(`${sw.switchId}: recipient @${sw.recipientUsername} not found`);
                    continue;
                }

                // Fetch encrypted payload
                let encryptedPayload: string | null = null;

                if (sw.arweaveTxId.startsWith('local:')) {
                    // Redis fallback
                    const { getMessageContent } = await import('../services/redis.js');
                    const localId = sw.arweaveTxId.replace('local:', '');
                    encryptedPayload = await getMessageContent(`dms:${localId}`);
                } else {
                    // Fetch from Arweave
                    try {
                        const arweaveUrl = `https://devnet.irys.xyz/${sw.arweaveTxId}`;
                        const response = await fetch(arweaveUrl);
                        if (response.ok) {
                            encryptedPayload = await response.text();
                        }
                    } catch (fetchErr) {
                        console.error(`Failed to fetch Arweave data for ${sw.switchId}:`, fetchErr);
                    }
                }

                if (!encryptedPayload) {
                    errors.push(`${sw.switchId}: could not retrieve encrypted payload`);
                    continue;
                }

                // Store the released message in Redis so recipient can fetch it
                const { storeMessageBlob } = await import('../services/redis.js');
                const releaseId = `dms:release:${sw.switchId}`;
                await storeMessageBlob(releaseId, JSON.stringify({
                    type: 'dms_release',
                    switchId: sw.switchId,
                    senderPubkey: sw.senderPubkey,
                    recipientUsername: sw.recipientUsername,
                    encryptedMessage: encryptedPayload,
                    triggeredAt: new Date().toISOString(),
                }), 90 * 24 * 60 * 60); // 90-day TTL for released messages

                await markTriggered(sw.switchId);
                processed++;

                console.log(`💀 DMS triggered: ${sw.switchId} → @${sw.recipientUsername}`);
            } catch (err) {
                errors.push(`${sw.switchId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        return res.json({
            processed,
            total: overdue.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('DMS process error:', error);
        return res.status(500).json({ error: 'Failed to process switches' });
    }
});

export default router;
