import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    Alert,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { getStoredKeypair } from '@/lib/keychain';
import { uint8ToBase58 } from '@/lib/crypto';
import { approveRecovery, getGuardianConfig } from '@/lib/recovery';

interface PendingRecovery {
    ownerPubkey: string;
    // In a full implementation, this would come from push notifications or polling
}

export default function RecoveryApproveScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [guardianships, setGuardianships] = useState<string[]>([]);
    const [myPubkey, setMyPubkey] = useState<string>('');

    // Manual approve form
    const [sessionIdInput, setSessionIdInput] = useState('');
    const [ownerPubkeyInput, setOwnerPubkeyInput] = useState('');
    const [approving, setApproving] = useState(false);

    useEffect(() => {
        loadGuardianships();
    }, []);

    const loadGuardianships = async () => {
        try {
            const keypair = await getStoredKeypair();
            if (!keypair) return;
            const pubkey = uint8ToBase58(keypair.publicKey);
            setMyPubkey(pubkey);

            // Fetch identities this user is a guardian for
            const response = await fetch(
                `${process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app'}/api/recovery/guardianships/${pubkey}`,
            );
            if (response.ok) {
                const data = await response.json();
                setGuardianships(data.guardianships || []);
            }
        } catch (err) {
            console.warn('Failed to load guardianships:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleApprove = async (sessionId: string, ownerPubkey: string) => {
        if (!sessionId.trim() || !ownerPubkey.trim()) {
            Alert.alert('Error', 'Session ID and owner public key are required');
            return;
        }

        Alert.alert(
            'Approve Recovery',
            `Approve recovery for identity ${ownerPubkey.slice(0, 12)}...?\n\nThis will release your share of their secret key.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    onPress: async () => {
                        setApproving(true);
                        try {
                            // Get session status to find ephemeral pubkey
                            const statusRes = await fetch(
                                `${process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app'}/api/recovery/session/${sessionId}/status`,
                            );
                            if (!statusRes.ok) {
                                throw new Error('Session not found');
                            }
                            // In a complete implementation, we'd:
                            // 1. Fetch our encrypted share
                            // 2. Decrypt it
                            // 3. Re-encrypt to ephemeral key
                            // 4. Submit
                            // For now, use the approveRecovery function
                            const statusData = await statusRes.json();

                            const result = await approveRecovery(
                                sessionId.trim(),
                                ownerPubkey.trim(),
                                '', // ephemeral pubkey from session
                            );

                            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert(
                                'Approved',
                                `Recovery approved. ${result.approvalsReceived}/${result.thresholdRequired} approvals received.`,
                            );
                        } catch (err: any) {
                            Alert.alert('Error', err.message);
                        } finally {
                            setApproving(false);
                        }
                    },
                },
            ],
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0a0a0a', '#050505']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={Colors.text} />
                </Pressable>
                <Text style={styles.title}>Guardian Approvals</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGuardianships(); }} tintColor={Colors.primary} />}
            >
                {/* Guardianships */}
                {guardianships.length > 0 ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>You are a guardian for</Text>
                        {guardianships.map((owner, i) => (
                            <View key={i} style={styles.guardianCard}>
                                <Ionicons name="shield-outline" size={20} color={Colors.secondary} />
                                <View style={styles.guardianInfo}>
                                    <Text style={styles.guardianPubkey} numberOfLines={1}>
                                        {owner}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="shield-outline" size={48} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No Guardianships</Text>
                        <Text style={styles.emptySubtitle}>
                            You aren't a guardian for anyone yet. Others can add you as a guardian in their recovery setup.
                        </Text>
                    </View>
                )}

                {/* Manual Approve */}
                <View style={styles.manualCard}>
                    <Text style={styles.manualTitle}>Approve a Recovery Request</Text>
                    <Text style={styles.manualSubtitle}>
                        If someone asked you to approve their recovery, enter their session ID and public key below.
                    </Text>

                    <Text style={styles.inputLabel}>Session ID</Text>
                    <View style={styles.inputWrapper}>
                        <Ionicons name="key-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 12 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="Recovery session ID"
                            placeholderTextColor={Colors.textMuted}
                            value={sessionIdInput}
                            onChangeText={setSessionIdInput}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                    <Text style={styles.inputLabel}>Owner Public Key</Text>
                    <View style={styles.inputWrapper}>
                        <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 12 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="Owner's Solana public key"
                            placeholderTextColor={Colors.textMuted}
                            value={ownerPubkeyInput}
                            onChangeText={setOwnerPubkeyInput}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <Pressable
                        style={[styles.approveButton, approving && styles.approveDisabled]}
                        onPress={() => handleApprove(sessionIdInput, ownerPubkeyInput)}
                        disabled={approving}
                    >
                        {approving ? (
                            <ActivityIndicator color="#050505" />
                        ) : (
                            <>
                                <Ionicons name="checkmark-circle-outline" size={20} color="#050505" />
                                <Text style={styles.approveText}>Approve Recovery</Text>
                            </>
                        )}
                    </Pressable>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { justifyContent: 'center', alignItems: 'center' },
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

    // Section
    section: { marginBottom: 24 },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    // Guardian cards
    guardianCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    guardianInfo: { flex: 1 },
    guardianPubkey: { fontSize: 13, color: Colors.text, fontFamily: 'monospace' },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 40, marginBottom: 24 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textSecondary, marginTop: 12 },
    emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 32, lineHeight: 19 },

    // Manual approve
    manualCard: {
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    manualTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
    manualSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 19 },
    inputLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    input: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: Colors.text,
        fontSize: 14,
        fontFamily: 'monospace',
    },
    approveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: Colors.accent,
    },
    approveDisabled: { opacity: 0.6 },
    approveText: { fontSize: 15, fontWeight: '700', color: '#050505' },
});
