import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createNotification } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';

export default function AssignTenantScreen() {
    const router = useRouter();
    const { propertyId } = useLocalSearchParams<{ propertyId: string }>();

    const [session, setSession] = useState<any>(null);
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Approved bookings
    const [approvedBookings, setApprovedBookings] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<any>(null);

    // Form fields
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [contractMonths, setContractMonths] = useState('12');
    const [endDate, setEndDate] = useState('');
    const [lateFee, setLateFee] = useState('');
    const [wifiDueDay, setWifiDueDay] = useState('');
    const [contractPdf, setContractPdf] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        calculateEndDate();
    }, [startDate, contractMonths]);

    const calculateEndDate = () => {
        if (!startDate || !contractMonths) {
            setEndDate('');
            return;
        }
        const months = parseInt(contractMonths);
        if (isNaN(months) || months < 3) {
            setEndDate('');
            return;
        }
        const start = new Date(startDate);
        start.setMonth(start.getMonth() + months);
        setEndDate(start.toISOString().split('T')[0]);
    };

    const loadData = async () => {
        try {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (!s) return router.replace('/');
            setSession(s);

            if (!propertyId) {
                Alert.alert('Error', 'No property selected');
                router.back();
                return;
            }

            // Load property
            const { data: prop } = await supabase
                .from('properties')
                .select('*')
                .eq('id', propertyId)
                .single();

            if (!prop) {
                Alert.alert('Error', 'Property not found');
                router.back();
                return;
            }
            setProperty(prop);

            // Load approved bookings for this property
            const { data: bookings } = await supabase
                .from('bookings')
                .select('*')
                .eq('property_id', propertyId)
                .eq('status', 'approved');

            if (bookings && bookings.length > 0) {
                const tenantIds = bookings.map((b: any) => b.tenant);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', tenantIds);

                const profileMap = (profiles || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});
                const candidates = bookings.map((b: any) => ({
                    ...b,
                    tenant_profile: profileMap[b.tenant]
                }));
                setApprovedBookings(candidates);
            } else {
                setApprovedBookings([]);
            }
        } catch (err: any) {
            console.error('Error loading data:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const pickContractPdf = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true
            });

            if (!result.canceled && result.assets?.[0]) {
                setContractPdf(result.assets[0]);
            }
        } catch (err) {
            console.error('Error picking document:', err);
        }
    };

    const handleAssign = async () => {
        if (!selectedTenant) return Alert.alert('Error', 'Please select a tenant');
        if (!startDate) return Alert.alert('Error', 'Please enter a start date');
        const months = parseInt(contractMonths);
        if (isNaN(months) || months < 3) return Alert.alert('Error', 'Contract must be at least 3 months');
        if (!endDate) return Alert.alert('Error', 'End date could not be calculated');
        if (!lateFee) return Alert.alert('Error', 'Please enter late payment fee');

        setSubmitting(true);
        try {
            const rentAmount = property.price || 0;
            const securityDeposit = rentAmount;

            // Upload contract PDF if selected
            let contractUrl = null;
            if (contractPdf) {
                const fileExt = contractPdf.name.split('.').pop();
                const fileName = `contract_${propertyId}_${Date.now()}.${fileExt}`;

                const formData = new FormData();
                formData.append('file', {
                    uri: contractPdf.uri,
                    name: fileName,
                    type: 'application/pdf'
                } as any);

                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('contracts')
                    .upload(fileName, formData);

                if (!uploadErr && uploadData) {
                    const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(fileName);
                    contractUrl = urlData.publicUrl;
                }
            }

            // 1. Create Occupancy
            const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
                property_id: property.id,
                tenant_id: selectedTenant.tenant,
                landlord_id: session.user.id,
                status: 'active',
                start_date: new Date(startDate).toISOString(),
                contract_end_date: endDate,
                security_deposit: securityDeposit,
                security_deposit_used: 0,
                wifi_due_day: wifiDueDay ? parseInt(wifiDueDay) : null,
                late_payment_fee: parseFloat(lateFee) || 0,
                contract_pdf: contractUrl
            }).select().single();

            if (error) throw error;

            // 2. Update Property status
            await supabase.from('properties').update({ status: 'occupied' }).eq('id', property.id);

            // 3. Create Move-In Bill
            await supabase.from('payment_requests').insert({
                landlord: session.user.id,
                tenant: selectedTenant.tenant,
                property_id: property.id,
                occupancy_id: newOccupancy.id,
                rent_amount: rentAmount,
                security_deposit_amount: securityDeposit,
                advance_amount: rentAmount,
                bills_description: 'Move-in Payment (Rent + Advance + Security Deposit)',
                due_date: new Date(startDate).toISOString(),
                status: 'pending',
                is_move_in_payment: true
            });

            // 4. Notify tenant
            const message = `You have been assigned to "${property.title}" from ${startDate}. Move-in bill sent.`;
            await createNotification(selectedTenant.tenant, 'occupancy_assigned', message, { actor: session.user.id });

            Alert.alert('Success', 'Tenant assigned & Move-in bill created!', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to assign tenant');
        } finally {
            setSubmitting(false);
        }
    };

    const rentAmount = property?.price || 0;
    const advanceAmount = rentAmount;
    const securityDeposit = rentAmount;
    const totalMoveIn = rentAmount + advanceAmount + securityDeposit;

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <ActivityIndicator size="large" color="#111" style={{ marginTop: 100 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#111" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Assign Tenant</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>{property?.title || 'Property'}</Text>
                </View>
                {/* <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                    <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity> */}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Select Tenant Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="people" size={18} color="#111" />
                        <Text style={styles.sectionTitle}>Select Tenant to Assign</Text>
                    </View>

                    {approvedBookings.length === 0 ? (
                        <View style={styles.emptyTenants}>
                            <Ionicons name="alert-circle-outline" size={24} color="#f59e0b" />
                            <Text style={styles.emptyTenantsText}>No approved bookings found.</Text>
                        </View>
                    ) : (
                        approvedBookings.map((item) => {
                            const isSelected = selectedTenant?.id === item.id;
                            const name = `${item.tenant_profile?.first_name || ''} ${item.tenant_profile?.last_name || ''}`.trim();
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[styles.tenantCard, isSelected && styles.tenantCardSelected]}
                                    onPress={() => setSelectedTenant(item)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.tenantAvatar, isSelected && { backgroundColor: '#111' }]}>
                                        <Text style={[styles.tenantAvatarText, isSelected && { color: 'white' }]}>
                                            {(item.tenant_profile?.first_name || '?')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.tenantName, isSelected && { color: 'white' }]}>{name || 'Unknown'}</Text>
                                        <Text style={[styles.tenantPhone, isSelected && { color: 'rgba(255,255,255,0.7)' }]}>
                                            {item.tenant_profile?.phone || 'No phone'}
                                        </Text>
                                    </View>
                                    <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                                        {isSelected && <View style={styles.radioInner} />}
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>

                {/* Contract Details */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="document-text" size={18} color="#111" />
                        <Text style={styles.sectionTitle}>Contract Details</Text>
                    </View>

                    <Text style={styles.label}>Start Date *</Text>
                    <TextInput
                        style={styles.input}
                        value={startDate}
                        onChangeText={setStartDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#c4c4c4"
                    />

                    <Text style={styles.label}>Contract Duration (Months) *</Text>
                    <TextInput
                        style={styles.input}
                        value={contractMonths}
                        onChangeText={setContractMonths}
                        keyboardType="numeric"
                        placeholder="12"
                        placeholderTextColor="#c4c4c4"
                    />
                    <Text style={styles.hint}>Minimum 3 months. Enter how many months the contract will last.</Text>

                    <Text style={styles.label}>End Date (Auto-calculated)</Text>
                    <View style={styles.readonlyInput}>
                        <Text style={styles.readonlyText}>{endDate ? formatDate(endDate) : 'Enter valid start date and duration'}</Text>
                    </View>
                    <Text style={styles.hint}>Automatically calculated based on start date and contract duration</Text>
                </View>

                {/* Move-in Payment Summary */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="wallet" size={18} color="#111" />
                        <Text style={styles.sectionTitle}>Move-in Payment Summary</Text>
                    </View>

                    <View style={styles.summaryCard}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Rent (1 Month):</Text>
                            <Text style={styles.summaryValue}>₱{rentAmount.toLocaleString()}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Advance (1 Month):</Text>
                            <Text style={styles.summaryValue}>₱{advanceAmount.toLocaleString()}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Security Deposit:</Text>
                            <Text style={styles.summaryValue}>₱{securityDeposit.toLocaleString()}</Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryTotalLabel}>Total Move-in:</Text>
                            <Text style={styles.summaryTotalValue}>₱{totalMoveIn.toLocaleString()}</Text>
                        </View>
                    </View>
                </View>

                {/* Contract PDF */}
                <View style={styles.section}>
                    <Text style={styles.label}>Contract PDF *</Text>
                    <TouchableOpacity style={styles.uploadBtn} onPress={pickContractPdf} activeOpacity={0.8}>
                        <Ionicons name={contractPdf ? "document-attach" : "cloud-upload-outline"} size={22} color={contractPdf ? "#059669" : "#9ca3af"} />
                        <Text style={[styles.uploadBtnText, contractPdf && { color: '#059669' }]}>
                            {contractPdf ? contractPdf.name : 'Click to upload contract PDF'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Fees & Utilities */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="cash" size={18} color="#111" />
                        <Text style={styles.sectionTitle}>Fees & Utilities</Text>
                    </View>

                    <Text style={styles.label}>Late Payment Fee (₱) *</Text>
                    <TextInput
                        style={styles.input}
                        value={lateFee}
                        onChangeText={setLateFee}
                        keyboardType="numeric"
                        placeholder="e.g. 500"
                        placeholderTextColor="#c4c4c4"
                    />

                    <View style={styles.infoBox}>
                        <Ionicons name="information-circle" size={16} color="#6366f1" />
                        <Text style={styles.infoText}>
                            Utility Reminders: Tenants will receive SMS & email reminders 3 days before due dates (no payment bills created).
                        </Text>
                    </View>

                    <Text style={styles.label}>Wifi Due Day *</Text>
                    <TextInput
                        style={styles.input}
                        value={wifiDueDay}
                        onChangeText={setWifiDueDay}
                        keyboardType="numeric"
                        placeholder="e.g. 10"
                        placeholderTextColor="#c4c4c4"
                    />

                    <View style={styles.infoBox}>
                        <Ionicons name="flash" size={16} color="#f59e0b" />
                        <Text style={styles.infoText}>
                            Note: Electricity reminders are sent automatically (due date is always 1st week of the month).
                        </Text>
                    </View>
                </View>

                {/* Spacer for bottom button */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Fixed Bottom Button */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={[styles.assignBtn, (!selectedTenant || submitting) && { opacity: 0.5 }]}
                    onPress={handleAssign}
                    disabled={!selectedTenant || submitting}
                    activeOpacity={0.8}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" size="small" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={20} color="white" />
                            <Text style={styles.assignBtnText}>Assign Tenant</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center'
    },
    closeBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center'
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
    headerSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

    scrollContent: { padding: 20 },

    section: {
        backgroundColor: 'white', borderRadius: 16, padding: 16,
        marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6'
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },

    // Tenant Cards
    emptyTenants: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 16, backgroundColor: '#fffbeb', borderRadius: 12
    },
    emptyTenantsText: { fontSize: 13, color: '#92400e', fontWeight: '600' },

    tenantCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#e5e7eb',
        backgroundColor: 'white', marginBottom: 8
    },
    tenantCardSelected: {
        backgroundColor: '#111', borderColor: '#111'
    },
    tenantAvatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center'
    },
    tenantAvatarText: { fontSize: 18, fontWeight: '800', color: '#666' },
    tenantName: { fontSize: 15, fontWeight: '700', color: '#111' },
    tenantPhone: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

    radioOuter: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center'
    },
    radioOuterSelected: { borderColor: 'white' },
    radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'white' },

    // Form
    label: {
        fontSize: 12, fontWeight: '700', color: '#374151',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14
    },
    input: {
        backgroundColor: '#f9fafb', borderWidth: 1.5, borderColor: '#e5e7eb',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: '#111', fontWeight: '500'
    },
    readonlyInput: {
        backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14
    },
    readonlyText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
    hint: { fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 16 },

    // Summary
    summaryCard: {
        backgroundColor: '#f9fafb', borderRadius: 14, padding: 16,
        borderWidth: 1, borderColor: '#e5e7eb'
    },
    summaryRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingVertical: 8
    },
    summaryLabel: { fontSize: 14, color: '#6b7280' },
    summaryValue: { fontSize: 14, fontWeight: '600', color: '#111' },
    summaryDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
    summaryTotalLabel: { fontSize: 15, fontWeight: '800', color: '#111' },
    summaryTotalValue: { fontSize: 18, fontWeight: '900', color: '#059669' },

    // Upload
    uploadBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 16, borderRadius: 12, borderWidth: 1.5,
        borderColor: '#e5e7eb', borderStyle: 'dashed', backgroundColor: '#fafafa'
    },
    uploadBtnText: { fontSize: 14, color: '#9ca3af', fontWeight: '600' },

    // Info
    infoBox: {
        flexDirection: 'row', gap: 8, marginTop: 10,
        padding: 12, backgroundColor: '#f0f0ff', borderRadius: 10
    },
    infoText: { fontSize: 11, color: '#4b5563', lineHeight: 16, flex: 1 },

    // Bottom
    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 20, paddingBottom: 34,
        backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#f3f4f6'
    },
    assignBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#111', paddingVertical: 16, borderRadius: 14
    },
    assignBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },
});
