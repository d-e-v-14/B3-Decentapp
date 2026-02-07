import React, { useState, useEffect } from 'react';
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
import { getStoredKeypair } from '@/lib/keychain';
import { uint8ToBase58 } from '@/lib/crypto';
import {
    setupRecovery,
    getGuardianConfig,
    revokeRecovery,
    type GuardianInfo,
} from '@/lib/recovery';

export default function RecoverySetupScreen() {
    const router = useRouter();
    const [existingConfig, setExistingConfig] = useState<GuardianInfo | null>(null);
    const [loading, setLoading] = useState(true);

    // Setup form
    const [guardianInputs, setGuardianInputs] = useState<string[]>(['', '', '']);
    const [threshold, setThreshold] = useState('2');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadExistingConfig();
    }, []);

    const loadExistingConfig = async () => {
        try {
            const keypair = await getStoredKeypair();
            if (!keypair) return;
            const pubkey = uint8ToBase58(keypair.publicKey);
            const cfg = await getGuardianConfig(pubkey);
            setExistingConfig(cfg);
        } catch {
            // No config exists — that's fine
        } finally {
            setLoading(false);
        }
    };

    const addGuardianSlot = () => {
        if (guardianInputs.length >= 10) {
            Alert.alert('Maximum', 'You can have at most 10 guardians');
            return;
        }
        setGuardianInputs([...guardianInputs, '']);
    };

    const removeGuardianSlot = (index: number) => {
        if (guardianInputs.length <= 2) return;
        setGuardianInputs(guardianInputs.filter((_, i) => i !== index));
    };

    const updateGuardian = (index: number, value: string) => {
        const updated = [...guardianInputs];
        updated[index] = value;
        setGuardianInputs(updated);
    };

    const handleSetup = async () => {
        const guardians = guardianInputs.map(g => g.trim()).filter(g => g.length > 0);
        const k = parseInt(threshold, 10);

        if (guardians.length < 2) {
            Alert.alert('Error', 'Need at least 2 guardians');
            return;
        }
        if (isNaN(k) || k < 2) {
            Alert.alert('Error', 'Threshold must be at least 2');
            return;
        }
        if (k > guardians.length) {
            Alert.alert('Error', 'Threshold cannot exceed number of guardians');
            return;
        }

        // Confirm
        Alert.alert(
            'Set Up Recovery',
            `Split your identity across ${guardians.length} guardians with a ${k}-of-${guardians.length} threshold.\n\nGuardians: ${guardians.map(g => `@${g}`).join(', ')}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                            const result = await setupRecovery(guardians, k);
                            Alert.alert(
                                '🔐 Recovery Set Up',
                                `${result.guardianCount} guardians configured with ${result.threshold}-of-${result.guardianCount} threshold.`,
                            );
                            loadExistingConfig();
                        } catch (err: any) {
                            Alert.alert('Error', err.message);
                        } finally {
                            setSubmitting(false);
                        }
                    },
                },
            ],
        );
    };

    const handleRevoke = () => {
        Alert.alert(
            'Revoke Recovery',
            'This will delete all guardian shares. You will need to set up recovery again.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await revokeRecovery();
                            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setExistingConfig(null);
                            Alert.alert('Revoked', 'All recovery shares have been deleted.');
                        } catch (err: any) {
                            Alert.alert('Error', err.message);
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
                <Text style={styles.title}>Recovery Setup</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {/* Existing config info */}
                {existingConfig?.configured ? (
                    <View style={styles.existingCard}>
                        <View style={styles.existingHeader}>
                            <Ionicons name="shield-checkmark" size={24} color={Colors.success} />
                            <Text style={styles.existingTitle}>Recovery Active</Text>
                        </View>
                        <Text style={styles.existingDetail}>
                            Threshold: {existingConfig.threshold}-of-{existingConfig.guardians.length}
                        </Text>
                        <Text style={styles.existingDetail}>
                            Guardians: {existingConfig.guardians.map(g => g.slice(0, 8) + '...').join(', ')}
                        </Text>
                        {existingConfig.createdAt && (
                            <Text style={styles.existingDate}>
                                Set up: {new Date(existingConfig.createdAt).toLocaleDateString()}
                            </Text>
                        )}
                        <Pressable style={styles.revokeButton} onPress={handleRevoke}>
                            <Text style={styles.revokeText}>Revoke & Reconfigure</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        {/* Info */}
                        <View style={styles.infoCard}>
                            <Ionicons name="information-circle-outline" size={22} color={Colors.secondary} />
                            <Text style={styles.infoText}>
                                Split your secret key across trusted guardians. If you lose access, any {threshold || 'K'} of them can help you recover your identity. No single guardian can access your key alone.
                            </Text>
                        </View>

                        {/* Guardian inputs */}
                        <Text style={styles.sectionTitle}>Guardians</Text>
                        {guardianInputs.map((val, i) => (
                            <View key={i} style={styles.guardianRow}>
                                <TextInput
                                    style={styles.guardianInput}
                                    placeholder={`Guardian ${i + 1} username`}
                                    placeholderTextColor={Colors.textMuted}
                                    value={val}
                                    onChangeText={v => updateGuardian(i, v)}
                                    autoCapitalize="none"
                                />
                                {guardianInputs.length > 2 && (
                                    <Pressable onPress={() => removeGuardianSlot(i)} style={styles.removeButton}>
                                        <Ionicons name="remove-circle" size={22} color={Colors.error} />
                                    </Pressable>
                                )}
                            </View>
                        ))}
                        <Pressable style={styles.addGuardian} onPress={addGuardianSlot}>
                            <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                            <Text style={styles.addGuardianText}>Add Guardian</Text>
                        </Pressable>

                        {/* Threshold */}
                        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Threshold</Text>
                        <View style={styles.thresholdRow}>
                            <Text style={styles.thresholdLabel}>Require</Text>
                            <TextInput
                                style={styles.thresholdInput}
                                value={threshold}
                                onChangeText={setThreshold}
                                keyboardType="number-pad"
                            />
                            <Text style={styles.thresholdLabel}>
                                of {guardianInputs.filter(g => g.trim()).length || '?'} guardians
                            </Text>
                        </View>

                        {/* Submit */}
                        <Pressable
                            style={[styles.submitButton, submitting && styles.submitDisabled]}
                            onPress={handleSetup}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#050505" />
                            ) : (
                                <>
                                    <Ionicons name="shield-checkmark-outline" size={20} color="#050505" />
                                    <Text style={styles.submitText}>Set Up Recovery</Text>
                                </>
                            )}
                        </Pressable>
                    </>
                )}
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

    // Existing config
    existingCard: {
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.3)',
    },
    existingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    existingTitle: { fontSize: 18, fontWeight: '700', color: Colors.success },
    existingDetail: { fontSize: 14, color: Colors.textSecondary, marginBottom: 4 },
    existingDate: { fontSize: 12, color: Colors.textMuted, marginTop: 8 },
    revokeButton: {
        marginTop: 16,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.error,
    },
    revokeText: { color: Colors.error, fontWeight: '600' },

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

    // Section
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    // Guardian inputs
    guardianRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    guardianInput: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: Colors.text,
        fontSize: 15,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    removeButton: { padding: 4 },
    addGuardian: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
    },
    addGuardianText: { fontSize: 14, color: Colors.primary, fontWeight: '500' },

    // Threshold
    thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    thresholdLabel: { fontSize: 14, color: Colors.textSecondary },
    thresholdInput: {
        width: 50,
        textAlign: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
        paddingVertical: 10,
        color: Colors.text,
        fontSize: 16,
        fontWeight: '700',
        borderWidth: 1,
        borderColor: Colors.border,
    },

    // Submit
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 32,
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: Colors.primary,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { fontSize: 16, fontWeight: '700', color: '#050505' },
});
