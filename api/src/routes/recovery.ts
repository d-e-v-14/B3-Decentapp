/**
 * Cross-Device Identity Recovery API Routes
 *
 * POST   /api/recovery/distribute               — Store encrypted SSS shares for guardians
 * GET    /api/recovery/guardians/:pubkey         — List guardians for an identity
 * GET    /api/recovery/guardianships/:pubkey     — List identities a guardian protects
 * POST   /api/recovery/request                   — Initiate a recovery session (no auth — new device)
 * GET    /api/recovery/session/:sessionId/status — Check session progress
 * POST   /api/recovery/session/:sessionId/approve — Guardian approves + submits re-encrypted share
 * GET    /api/recovery/session/:sessionId/shares  — Fetch released shares when threshold met
 * DELETE /api/recovery/revoke                     — Revoke all shares (changing guardians)
 */
import { Router, Request, Response } from 'express';
import { verifySignature } from '../middleware/auth.js';
import {
    distributeShares,
    getRecoveryConfig,
    getShareForGuardian,
    getGuardianships,
    revokeShares,
    createSession,
    getSession,
    approveSession,
    getReleasedShares,
} from '../services/recoveryService.js';

const router = Router();

// ─── POST /distribute ───
router.post('/distribute', async (req: Request, res: Response) => {
    try {
        const {
            senderPubkey,
            threshold,
            guardians,
            signature,
            timestamp,
        } = req.body as {
            senderPubkey: string;
            threshold: number;
            guardians: { pubkey: string; encryptedShare: string; shareIndex: number }[];
            signature: string;
            timestamp: number;
        };

        if (!senderPubkey || !threshold || !guardians || !Array.isArray(guardians)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (threshold < 2) {
            return res.status(400).json({ error: 'Threshold must be at least 2' });
        }

        if (guardians.length < threshold) {
            return res.status(400).json({ error: 'Need at least as many guardians as the threshold' });
        }

        if (guardians.length > 10) {
            return res.status(400).json({ error: 'Maximum 10 guardians allowed' });
        }

        // Auth
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `recovery:distribute:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Revoke existing shares first (idempotent — allows re-distribution)
        await revokeShares(senderPubkey);

        // Store new shares
        await distributeShares(senderPubkey, threshold, guardians);

        console.log(`🔐 Recovery distributed: ${senderPubkey.slice(0, 8)}... → ${guardians.length} guardians, threshold=${threshold}`);

        return res.json({
            success: true,
            guardianCount: guardians.length,
            threshold,
        });
    } catch (error) {
        console.error('Recovery distribute error:', error);
        return res.status(500).json({ error: 'Failed to distribute shares' });
    }
});

// ─── GET /guardians/:pubkey ───
router.get('/guardians/:pubkey', async (req: Request, res: Response) => {
    try {
        const pubkey = req.params.pubkey as string;
        const cfg = await getRecoveryConfig(pubkey);

        if (!cfg) {
            return res.json({ configured: false, guardians: [], threshold: 0 });
        }

        const guardianPubkeys: string[] = JSON.parse(cfg.guardianPubkeys);

        return res.json({
            configured: true,
            guardians: guardianPubkeys,
            threshold: Number(cfg.threshold),
            createdAt: cfg.createdAt,
        });
    } catch (error) {
        console.error('Recovery guardians error:', error);
        return res.status(500).json({ error: 'Failed to get guardians' });
    }
});

// ─── GET /guardianships/:pubkey ───
router.get('/guardianships/:pubkey', async (req: Request, res: Response) => {
    try {
        const pubkey = req.params.pubkey as string;
        const owners = await getGuardianships(pubkey);

        return res.json({ guardianships: owners });
    } catch (error) {
        console.error('Guardianships error:', error);
        return res.status(500).json({ error: 'Failed to get guardianships' });
    }
});

// ─── POST /request ───
// No auth required — the requester has lost their keys (that's the whole point)
router.post('/request', async (req: Request, res: Response) => {
    try {
        const { ownerPubkey, ephemeralPubkey, requestedGuardians } = req.body as {
            ownerPubkey: string;
            ephemeralPubkey: string;
            requestedGuardians: string[];
        };

        if (!ownerPubkey || !ephemeralPubkey || !requestedGuardians || !Array.isArray(requestedGuardians)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (requestedGuardians.length === 0) {
            return res.status(400).json({ error: 'Must request at least one guardian' });
        }

        const session = await createSession(ownerPubkey, ephemeralPubkey, requestedGuardians);

        console.log(`🔓 Recovery requested: session=${session.sessionId}, owner=${ownerPubkey.slice(0, 8)}..., guardians=${requestedGuardians.length}`);

        return res.json({
            success: true,
            sessionId: session.sessionId,
            threshold: session.threshold,
            expiresIn: '24h',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Recovery request error:', message);

        if (message.includes('No recovery config')) {
            return res.status(404).json({ error: 'No recovery setup found for this identity' });
        }
        if (message.includes('not a guardian')) {
            return res.status(400).json({ error: message });
        }

        return res.status(500).json({ error: 'Failed to create recovery session' });
    }
});

// ─── GET /session/:sessionId/status ───
router.get('/session/:sessionId/status', async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId as string;
        const session = await getSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }

        return res.json({
            sessionId: session.sessionId,
            status: session.status,
            approvalsReceived: session.approvals,
            thresholdRequired: session.threshold,
            ownerPubkey: session.ownerPubkey,
            createdAt: session.createdAt,
        });
    } catch (error) {
        console.error('Session status error:', error);
        return res.status(500).json({ error: 'Failed to get session status' });
    }
});

// ─── POST /session/:sessionId/approve ───
router.post('/session/:sessionId/approve', async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId as string;
        const { guardianPubkey, reEncryptedShare, signature, timestamp } = req.body as {
            guardianPubkey: string;
            reEncryptedShare: string;
            signature: string;
            timestamp: number;
        };

        if (!guardianPubkey || !reEncryptedShare || !signature || !timestamp) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Auth — guardian must prove identity
        const expectedMessage = `recovery:approve:${sessionId}:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, guardianPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const result = await approveSession(sessionId, guardianPubkey, reEncryptedShare);

        console.log(`✅ Recovery approved: session=${sessionId}, guardian=${guardianPubkey.slice(0, 8)}..., ${result.approvalsReceived}/${result.thresholdRequired}`);

        return res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Recovery approve error:', message);

        if (message.includes('not found') || message.includes('expired')) {
            return res.status(404).json({ error: message });
        }
        if (message.includes('already approved')) {
            return res.status(409).json({ error: message });
        }
        if (message.includes('not a valid guardian')) {
            return res.status(403).json({ error: message });
        }

        return res.status(500).json({ error: 'Failed to approve recovery' });
    }
});

// ─── GET /session/:sessionId/shares ───
// No auth — shares are encrypted to the ephemeral key; only the session requester can decrypt
router.get('/session/:sessionId/shares', async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId as string;
        const shares = await getReleasedShares(sessionId);

        return res.json({ shares });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Recovery shares error:', message);

        if (message.includes('not found') || message.includes('expired')) {
            return res.status(404).json({ error: message });
        }
        if (message.includes('not ready')) {
            return res.status(403).json({ error: 'Not enough guardians have approved yet' });
        }

        return res.status(500).json({ error: 'Failed to get shares' });
    }
});

// ─── DELETE /revoke ───
router.delete('/revoke', async (req: Request, res: Response) => {
    try {
        const { senderPubkey, signature, timestamp } = req.body as {
            senderPubkey: string;
            signature: string;
            timestamp: number;
        };

        if (!senderPubkey || !signature || !timestamp) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expectedMessage = `recovery:revoke:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        await revokeShares(senderPubkey);

        console.log(`🗑️  Recovery revoked: ${senderPubkey.slice(0, 8)}...`);

        return res.json({ success: true });
    } catch (error) {
        console.error('Recovery revoke error:', error);
        return res.status(500).json({ error: 'Failed to revoke shares' });
    }
});

export default router;
