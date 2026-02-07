import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Alert,
    ScrollView,
    TextInput,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import {
    createDeadLetter,
    checkIn,
    listSwitches,
    cancelDeadLetter,
    getTimeRemaining,
    type DMSSwitchInfo,
} from '@/lib/dms';

export default function DMSScreen() {
    const router = useRouter();
    const [switches, setSwitches] = useState<DMSSwitchInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Create form state
    const [recipient, setRecipient] = useState('');
    const [message, setMessage] = useState('');
    const [intervalHours, setIntervalHours] = useState('72');
    const [creating, setCreating] = useState(false);

    const loadSwitches = useCallback(async () => {
        try {
            const list = await listSwitches();
            setSwitches(list);
        } catch (err) {
            console.warn('Failed to load switches:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadSwitches();
    }, [loadSwitches]);

    const handleCheckIn = async () => {
        setCheckingIn(true);
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await checkIn();
            Alert.alert(
                '💓 Checked In',
                `${result.switchCount} switch(es) refreshed.\n\nNext deadline: ${result.nextDeadline ? new Date(result.nextDeadline).toLocaleString() : 'N/A'}`,
            );
            loadSwitches();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setCheckingIn(false);
        }
    };

    const handleCreate = async () => {
        if (!recipient.trim() || !message.trim()) {
            Alert.alert('Error', 'Recipient and message are required');
            return;
        }

        const hours = parseInt(intervalHours, 10);
        if (isNaN(hours) || hours < 1) {
            Alert.alert('Error', 'Interval must be at least 1 hour');
            return;
        }

        setCreating(true);
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const result = await createDeadLetter(recipient.trim(), message.trim(), hours);
            Alert.alert(
                '💀 Dead Letter Created',
                `Switch ID: ${result.switchId.slice(0, 8)}...\nDeadline: ${new Date(result.nextDeadline).toLocaleString()}`,
            );
            setShowCreateForm(false);
            setRecipient('');
            setMessage('');
            setIntervalHours('72');
            loadSwitches();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleCancel = (sw: DMSSwitchInfo) => {
        Alert.alert(
            'Cancel Switch',
            `Are you sure you want to cancel the dead letter to @${sw.recipientUsername}? This cannot be undone.`,
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await cancelDeadLetter(sw.switchId);
                            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            loadSwitches();
                        } catch (err: any) {
                            Alert.alert('Error', err.message);
                        }
                    },
                },
            ],
        );
    };

    const activeSwitches = switches.filter(s => s.status === 'active');
    const pastSwitches = switches.filter(s => s.status !== 'active');

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0a0a0a', '#050505']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={Colors.text} />
                </Pressable>
                <Text style={styles.title}>Dead Man's Switch</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSwitches(); }} tintColor={Colors.primary} />}
            >
                {/* Check-In Button */}
                {activeSwitches.length > 0 && (
                    <Pressable style={styles.checkInButton} onPress={handleCheckIn} disabled={checkingIn}>
                        <LinearGradient colors={['#34D399', '#059669']} style={styles.checkInGradient}>
                            {checkingIn ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="heart" size={24} color="#fff" />
                                    <Text style={styles.checkInText}>Check In Now</Text>
                                </>
                            )}
                        </LinearGradient>
                    </Pressable>
                )}

                {/* Active Switches */}
                {activeSwitches.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Active Switches ({activeSwitches.length})</Text>
                        {activeSwitches.map(sw => {
                            const time = getTimeRemaining(sw.nextDeadline);
                            return (
                                <View key={sw.switchId} style={[styles.card, time.isOverdue && styles.cardOverdue]}>
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardRecipient}>→ @{sw.recipientUsername}</Text>
                                        <Pressable onPress={() => handleCancel(sw)}>
                                            <Ionicons name="close-circle-outline" size={22} color={Colors.error} />
                                        </Pressable>
                                    </View>
                                    <Text style={[styles.cardTime, time.isOverdue && { color: Colors.error }]}>
                                        {time.label}
                                    </Text>
                                    <Text style={styles.cardInterval}>
                                        Interval: {sw.intervalHours}h · Created: {new Date(sw.createdAt).toLocaleDateString()}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Empty State */}
                {!loading && activeSwitches.length === 0 && !showCreateForm && (
                    <View style={styles.emptyState}>
                        <Ionicons name="skull-outline" size={64} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No Active Switches</Text>
                        <Text style={styles.emptySubtitle}>
                            Create a dead letter that will be delivered to a trusted contact if you fail to check in.
                        </Text>
                    </View>
                )}

                {/* Create Form */}
                {showCreateForm ? (
                    <View style={styles.formCard}>
                        <Text style={styles.formTitle}>Create Dead Letter</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Recipient username"
                            placeholderTextColor={Colors.textMuted}
                            value={recipient}
                            onChangeText={setRecipient}
                            autoCapitalize="none"
                        />
                        <TextInput
                            style={[styles.input, styles.messageInput]}
                            placeholder="Your message..."
                            placeholderTextColor={Colors.textMuted}
                            value={message}
                            onChangeText={setMessage}
                            multiline
                            numberOfLines={4}
                        />
                        <View style={styles.intervalRow}>
                            <Text style={styles.intervalLabel}>Check-in every</Text>
                            <TextInput
                                style={[styles.input, styles.intervalInput]}
                                placeholder="72"
                                placeholderTextColor={Colors.textMuted}
                                value={intervalHours}
                                onChangeText={setIntervalHours}
                                keyboardType="number-pad"
                            />
                            <Text style={styles.intervalLabel}>hours</Text>
                        </View>
                        <View style={styles.formButtons}>
                            <Pressable style={styles.cancelButton} onPress={() => setShowCreateForm(false)}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={styles.createButton} onPress={handleCreate} disabled={creating}>
                                {creating ? (
                                    <ActivityIndicator color="#050505" />
                                ) : (
                                    <Text style={styles.createButtonText}>Create</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                ) : (
                    <Pressable style={styles.addButton} onPress={() => { setShowCreateForm(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                        <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                        <Text style={styles.addButtonText}>Create Dead Letter</Text>
                    </Pressable>
                )}

                {/* Past Switches */}
                {pastSwitches.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>History</Text>
                        {pastSwitches.map(sw => (
                            <View key={sw.switchId} style={[styles.card, styles.cardPast]}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardRecipient}>→ @{sw.recipientUsername}</Text>
                                    <Text style={[styles.statusBadge, sw.status === 'triggered' ? styles.statusTriggered : styles.statusCancelled]}>
                                        {sw.status}
                                    </Text>
                                </View>
                                <Text style={styles.cardInterval}>
                                    {sw.status === 'triggered' && sw.triggeredAt
                                        ? `Triggered: ${new Date(sw.triggeredAt).toLocaleString()}`
                                        : `Created: ${new Date(sw.createdAt).toLocaleDateString()}`
                                    }
                                </Text>
                            </View>
                        ))}
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

    // Check-in
    checkInButton: { marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
    checkInGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 18,
    },
    checkInText: { fontSize: 18, fontWeight: '700', color: '#fff' },

    // Sections
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },

    // Cards
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    cardOverdue: { borderColor: Colors.error },
    cardPast: { opacity: 0.6 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardRecipient: { fontSize: 16, fontWeight: '600', color: Colors.text },
    cardTime: { fontSize: 14, color: Colors.accent, marginBottom: 4 },
    cardInterval: { fontSize: 12, color: Colors.textMuted },

    // Status badges
    statusBadge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', textTransform: 'uppercase' },
    statusTriggered: { backgroundColor: 'rgba(255, 107, 107, 0.2)', color: Colors.error },
    statusCancelled: { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: Colors.textMuted },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: Colors.textSecondary, marginTop: 16 },
    emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 32, lineHeight: 20 },

    // Create form
    formCard: {
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    formTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 16 },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: Colors.text,
        fontSize: 15,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    messageInput: { height: 100, textAlignVertical: 'top' },
    intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    intervalLabel: { fontSize: 14, color: Colors.textSecondary },
    intervalInput: { width: 70, textAlign: 'center', marginBottom: 0 },
    formButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    cancelButtonText: { color: Colors.textSecondary, fontWeight: '600' },
    createButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: Colors.primary,
    },
    createButtonText: { color: '#050505', fontWeight: '700' },

    // Add button
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.primaryMuted,
        borderStyle: 'dashed',
        marginBottom: 24,
    },
    addButtonText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
});
