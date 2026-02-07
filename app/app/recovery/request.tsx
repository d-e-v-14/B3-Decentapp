import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Alert,
    ScrollView,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import {
    requestRecovery,
    getSessionStatus,
    reconstructIdentity,
    getGuardianConfig,
    type RecoverySessionInfo,
    type KeyPair,
} from '@/lib/recovery';

type Step = 'input' | 'waiting' | 'reconstructing' | 'done';

export default function RecoveryRequestScreen() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('input');

    // Input step
    const [ownerPubkey, setOwnerPubkey] = useState('');
    const [guardianPubkeys, setGuardianPubkeys] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Waiting step
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [ephemeralKp, setEphemeralKp] = useState<KeyPair | null>(null);
    const [sessionInfo, setSessionInfo] = useState<RecoverySessionInfo | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const handleRequestRecovery = async () => {
        if (!ownerPubkey.trim()) {
            Alert.alert('Error', 'Enter the public key of the identity to recover');
            return;
        }

        const guardians = guardianPubkeys
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (guardians.length === 0) {
            Alert.alert('Error', 'Enter at least one guardian public key');
            return;
        }

        setSubmitting(true);
        try {
            const result = await requestRecovery(ownerPubkey.trim(), guardians);
            setSessionId(result.sessionId);
            setEphemeralKp(result.ephemeralKeypair);
            setStep('waiting');

            // Start polling
            pollRef.current = setInterval(async () => {
                try {
                    const status = await getSessionStatus(result.sessionId);
                    setSessionInfo(status);

                    if (status.status === 'ready') {
                        if (pollRef.current) clearInterval(pollRef.current);
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        handleReconstruct(result.sessionId, result.ephemeralKeypair.secretKey);
                    }
                } catch (err) {
                    console.warn('Poll error:', err);
                }
            }, 5000); // poll every 5 seconds

        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReconstruct = async (sid: string, ephemeralSecret: Uint8Array) => {
        setStep('reconstructing');
        try {
            const result = await reconstructIdentity(sid, ephemeralSecret, ownerPubkey.trim());

            if (result.success) {
                setStep('done');
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
                throw new Error('Reconstruction failed');
            }
        } catch (err: any) {
            Alert.alert('Reconstruction Failed', err.message);
            setStep('waiting');
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0a0a0a', '#050505']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={Colors.text} />
                </Pressable>
                <Text style={styles.title}>Recover Identity</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {step === 'input' && (
                    <>
                        <View style={styles.infoCard}>
                            <Ionicons name="key-outline" size={22} color={Colors.secondary} />
                            <Text style={styles.infoText}>
                                Lost your device? Enter your old public key and your guardians' public keys to start the recovery process. Your guardians will need to approve the request.
                            </Text>
                        </View>

                        <Text style={styles.label}>Your Public Key</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Base58 public key of your identity"
                            placeholderTextColor={Colors.textMuted}
                            value={ownerPubkey}
                            onChangeText={setOwnerPubkey}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <Text style={styles.label}>Guardian Public Keys</Text>
                        <TextInput
                            style={[styles.input, styles.multiInput]}
                            placeholder="Comma-separated guardian pubkeys"
                            placeholderTextColor={Colors.textMuted}
                            value={guardianPubkeys}
                            onChangeText={setGuardianPubkeys}
                            autoCapitalize="none"
                            autoCorrect={false}
                            multiline
                        />

                        <Pressable
                            style={[styles.submitButton, submitting && styles.submitDisabled]}
                            onPress={handleRequestRecovery}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#050505" />
                            ) : (
                                <>
                                    <Ionicons name="send-outline" size={20} color="#050505" />
                                    <Text style={styles.submitText}>Request Recovery</Text>
                                </>
                            )}
                        </Pressable>
                    </>
                )}

                {step === 'waiting' && (
                    <View style={styles.waitingCard}>
                        <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: 20 }} />
                        <Text style={styles.waitingTitle}>Waiting for Guardians</Text>
                        <Text style={styles.waitingSubtitle}>
                            Your guardians need to approve this recovery request. Share the session ID with them.
                        </Text>

                        {sessionId && (
                            <View style={styles.sessionIdBox}>
                                <Text style={styles.sessionIdLabel}>Session ID</Text>
                                <Text style={styles.sessionIdValue} selectable>{sessionId}</Text>
                            </View>
                        )}

                        {sessionInfo && (
                            <View style={styles.progressBox}>
                                <Text style={styles.progressText}>
                                    Approvals: {sessionInfo.approvalsReceived} / {sessionInfo.thresholdRequired}
                                </Text>
                                <View style={styles.progressBar}>
                                    <View
                                        style={[
                                            styles.progressFill,
                                            {
                                                width: `${Math.min(100, (sessionInfo.approvalsReceived / sessionInfo.thresholdRequired) * 100)}%`,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {step === 'reconstructing' && (
                    <View style={styles.waitingCard}>
                        <ActivityIndicator size="large" color={Colors.accent} style={{ marginBottom: 20 }} />
                        <Text style={styles.waitingTitle}>Reconstructing Identity</Text>
                        <Text style={styles.waitingSubtitle}>
                            Combining guardian shares to recover your secret key...
                        </Text>
                    </View>
                )}

                {step === 'done' && (
                    <View style={styles.doneCard}>
                        <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
                        <Text style={styles.doneTitle}>Identity Recovered!</Text>
                        <Text style={styles.doneSubtitle}>
                            Your keypair has been restored. You can now use the app as before.
                        </Text>
                        <Pressable style={styles.doneButton} onPress={() => router.replace('/')}>
                            <Text style={styles.doneButtonText}>Go to Home</Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    title: { fontSize: 20, fontWeight: '700', color: Colors.text },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },

    // Info
    infoCard: {
        flexDirection: 'row',
        backgroundColor: 'rgba(79, 195, 247, 0.1)',
        borderRadius: 12,
        padding: 14,
        gap: 10,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(79, 195, 247, 0.2)',
    },
    infoText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    // Form
    label: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: Colors.text,
        fontSize: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        fontFamily: 'monospace',
    },
    multiInput: { height: 80, textAlignVertical: 'top' },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: Colors.primary,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { fontSize: 16, fontWeight: '700', color: '#050505' },

    // Waiting
    waitingCard: {
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 30,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    waitingTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
    waitingSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    // Session ID
    sessionIdBox: {
        marginTop: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
        padding: 14,
        width: '100%',
    },
    sessionIdLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    sessionIdValue: { fontSize: 12, color: Colors.text, fontFamily: 'monospace' },

    // Progress
    progressBox: { marginTop: 20, width: '100%' },
    progressText: { fontSize: 14, color: Colors.textSecondary, marginBottom: 8, textAlign: 'center' },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.accent,
        borderRadius: 3,
    },

    // Done
    doneCard: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    doneTitle: { fontSize: 24, fontWeight: '700', color: Colors.success, marginTop: 16 },
    doneSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    doneButton: {
        marginTop: 32,
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 14,
        backgroundColor: Colors.primary,
    },
    doneButtonText: { fontSize: 16, fontWeight: '700', color: '#050505' },
});
