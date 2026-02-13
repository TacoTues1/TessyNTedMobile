import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import CalendarPicker from '../../../components/ui/CalendarPicker';
import { useRealtime } from '../../../hooks/useRealtime';
import { createNotification } from '../../../lib/notifications';
import { supabase } from '../../../lib/supabase';

const { width } = Dimensions.get('window');

export default function LandlordDashboard({ session, profile }: any) {
    const router = useRouter();

    // --- STATE MANAGEMENT ---
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Dashboard Data
    const [tasks, setTasks] = useState({ maintenance: [], payments: [] });
    const [pendingEndRequests, setPendingEndRequests] = useState<any[]>([]);
    const [pendingRenewalRequests, setPendingRenewalRequests] = useState<any[]>([]);
    const [occupancies, setOccupancies] = useState<any[]>([]);
    const [scheduledViewings, setScheduledViewings] = useState<any[]>([]);

    // Financials
    const [monthlyIncome, setMonthlyIncome] = useState({
        currentMonth: { total: 0, payments: [], byProperty: [] },
        yearTotal: 0
    });
    const [monthlyChartData, setMonthlyChartData] = useState<any>({
        labels: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'],
        datasets: [{ data: [0, 0, 0, 0, 0, 0] }]
    });
    const [selectedStatementYear, setSelectedStatementYear] = useState(new Date().getFullYear());
    const [billingSchedule, setBillingSchedule] = useState<any[]>([]);

    // --- MODAL STATES ---

    // 1. Assign Modal
    const [assignModalVisible, setAssignModalVisible] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<any>(null);
    const [acceptedApplications, setAcceptedApplications] = useState<any[]>([]);
    const [penaltyDetails, setPenaltyDetails] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [contractMonths, setContractMonths] = useState('12');
    const [endDate, setEndDate] = useState('');
    const [wifiDueDay, setWifiDueDay] = useState('');
    const [uploadingContract, setUploadingContract] = useState(false);

    // 2. End Contract Modal
    const [endContractModal, setEndContractModal] = useState({ isOpen: false, occupancy: null as any });
    const [endContractDate, setEndContractDate] = useState('');
    const [endContractReason, setEndContractReason] = useState('');

    // 3. Renewal Modal
    const [renewalModal, setRenewalModal] = useState({ isOpen: false, occupancy: null as any, action: null as any });
    const [renewalSigningDate, setRenewalSigningDate] = useState('');
    const [renewalEndDate, setRenewalEndDate] = useState('');

    // 4. Email Notification Modal
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [allTenants, setAllTenants] = useState<any[]>([]);
    const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [emailEnding, setEmailEnding] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [showTenantDropdown, setShowTenantDropdown] = useState(false);

    // 5. Advance Bill Modal
    const [advanceBillModal, setAdvanceBillModal] = useState({
        isOpen: false,
        tenantId: null,
        tenantName: '',
        propertyTitle: ''
    });

    // --- EFFECTS ---

    useEffect(() => {
        if (profile) {
            loadDashboard();
        }
    }, [profile]);

    useRealtime(
        ['properties', 'tenant_occupancies', 'maintenance_requests', 'payment_requests', 'bookings'],
        () => {
            console.log("Realtime update triggered reload");
            loadDashboard();
        },
        !!profile
    );

    // Auto-calculate end date
    useEffect(() => {
        if (startDate && contractMonths) {
            try {
                const start = new Date(startDate);
                if (!isNaN(start.getTime())) {
                    const end = new Date(start);
                    end.setMonth(end.getMonth() + parseInt(contractMonths));
                    setEndDate(end.toISOString().split('T')[0]);
                }
            } catch (e) {
                console.log('Date calculation error:', e);
            }
        }
    }, [startDate, contractMonths]);

    // Recalculate Billing Schedule when occupancies change
    useEffect(() => {
        if (occupancies.length > 0) calculateBillingSchedule();
    }, [occupancies]);

    // --- DATA LOADING ---

    const loadDashboard = async () => {
        setRefreshing(true);
        await Promise.all([
            loadProperties(),
            loadOccupancies(),
            loadPendingEndRequests(),
            loadPendingRenewalRequests(),
            loadDashboardTasks(),
            loadMonthlyIncome(),
            loadScheduledViewings(),
        ]);
        setRefreshing(false);
        setLoading(false);
    };

    async function loadProperties() {
        const { data } = await supabase
            .from('properties')
            .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, last_name)')
            .eq('landlord', session.user.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });
        setProperties(data || []);
    }

    async function loadOccupancies() {
        const { data } = await supabase.from('tenant_occupancies')
            .select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone), property:properties(id, title, address, images)`)
            .eq('landlord_id', session.user.id)
            .eq('status', 'active');
        setOccupancies(data || []);
    }

    async function loadPendingEndRequests() {
        const { data, error } = await supabase.from('tenant_occupancies')
            .select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone), property:properties(id, title, address)`)
            .eq('landlord_id', session.user.id)
            .eq('end_request_status', 'pending');
        if (error) {
            console.error('loadPendingEndRequests error:', error);
        } else {
            console.log('loadPendingEndRequests:', data?.length, 'pending end requests found');
        }
        setPendingEndRequests(data || []);
    }

    async function loadPendingRenewalRequests() {
        const { data } = await supabase
            .from('tenant_occupancies')
            .select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone), property:properties(id, title, address, price)`)
            .eq('landlord_id', session.user.id)
            .eq('renewal_requested', true)
            .eq('renewal_status', 'pending');
        setPendingRenewalRequests(data || []);
    }

    async function loadDashboardTasks() {
        const { data: myProps } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id);
        if (!myProps || myProps.length === 0) return;

        const propIds = myProps.map(p => p.id);
        const propMap = myProps.reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.title }), {});

        const { data: maint } = await supabase
            .from('maintenance_requests')
            .select('*')
            .in('property_id', propIds)
            .in('status', ['pending', 'in_progress'])
            .order('created_at', { ascending: false })
            .limit(5);

        const { data: payments } = await supabase
            .from('payment_requests')
            .select('*')
            .in('property_id', propIds)
            .in('status', ['pending', 'pending_confirmation'])
            .order('due_date', { ascending: true })
            .limit(5);

        setTasks({
            maintenance: maint?.map(m => ({ ...m, property_title: propMap[m.property_id] })) as any || [],
            payments: payments?.map(p => ({ ...p, property_title: propMap[p.property_id] })) as any || []
        });
    }

    async function loadScheduledViewings() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: myProps } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id);

            if (!myProps || myProps.length === 0) {
                setScheduledViewings([]);
                return;
            }

            const propIds = myProps.map(p => p.id);
            const propMap = myProps.reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});

            const { data: bookings } = await supabase
                .from('bookings')
                .select('*')
                .in('property_id', propIds)
                .in('status', ['approved', 'accepted'])
                .gte('booking_date', `${today}T00:00:00`)
                .lte('booking_date', `${today}T23:59:59`);

            if (bookings && bookings.length > 0) {
                const tenantIds = bookings.map((b: any) => b.tenant);
                const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', tenantIds);
                const profileMap = (profiles || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});

                const enriched = bookings.map((b: any) => ({
                    ...b,
                    property: propMap[b.property_id],
                    tenant_profile: profileMap[b.tenant]
                }));
                setScheduledViewings(enriched);
            } else {
                setScheduledViewings([]);
            }
        } catch (e) {
            console.log('Error loading scheduled viewings:', e);
        }
    }

    // --- FINANCIAL LOGIC ---
    async function loadMonthlyIncome() {
        try {
            const year = selectedStatementYear || new Date().getFullYear();
            const yearStart = new Date(year, 0, 1);
            const yearEnd = new Date(year, 11, 31, 23, 59, 59);

            const { data: yearPayments } = await supabase
                .from('payment_requests')
                .select('amount_paid, paid_at, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills')
                .eq('landlord', session.user.id)
                .eq('status', 'paid')
                .gte('paid_at', yearStart.toISOString())
                .lte('paid_at', yearEnd.toISOString());

            const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const dataPoints = new Array(12).fill(0);
            let totalIncome = 0;

            yearPayments?.forEach(p => {
                const date = new Date(p.paid_at);
                const month = date.getMonth();
                const total = parseFloat(p.amount_paid || 0) || (
                    (parseFloat(p.rent_amount) || 0) +
                    (parseFloat(p.security_deposit_amount) || 0) +
                    (parseFloat(p.advance_amount) || 0) +
                    (parseFloat(p.water_bill) || 0) +
                    (parseFloat(p.electrical_bill) || 0) +
                    (parseFloat(p.wifi_bill) || 0) +
                    (parseFloat(p.other_bills) || 0)
                );
                dataPoints[month] += total;
                totalIncome += total;
            });

            setMonthlyIncome(prev => ({ ...prev, yearTotal: totalIncome }));
            setMonthlyChartData({
                labels: labels.filter((_, i) => i % 2 === 0), // Show every other label to save space
                datasets: [{ data: dataPoints.length > 0 ? dataPoints : [0] }]
            });
        } catch (e) {
            console.log('Error loading monthly income:', e);
        }
    }

    async function calculateBillingSchedule() {
        try {
            const { data: allBills } = await supabase
                .from('payment_requests')
                .select('occupancy_id, status, due_date, created_at, rent_amount, advance_amount')
                .eq('landlord', session.user.id)
                .order('due_date', { ascending: true });

            const billsByOccupancy: any = {};
            if (allBills) {
                allBills.forEach((bill: any) => {
                    if (!billsByOccupancy[bill.occupancy_id]) billsByOccupancy[bill.occupancy_id] = [];
                    billsByOccupancy[bill.occupancy_id].push(bill);
                });
            }

            const schedule = occupancies.map(occ => {
                const bills = billsByOccupancy[occ.id] || [];
                const earliestPending = bills.find((b: any) => b.status === 'pending' || b.status === 'pending_confirmation');

                let nextDueDate: Date | null = null;
                let status = 'Scheduled';

                try {
                    if (earliestPending && earliestPending.due_date) {
                        nextDueDate = new Date(earliestPending.due_date);
                        if (!isNaN(nextDueDate.getTime())) {
                            status = new Date() > nextDueDate ? 'Overdue' : earliestPending.status === 'pending_confirmation' ? 'Confirming' : 'Pending';
                        }
                    } else {
                        // Estimate next due date from last paid
                        const lastPaid = bills.filter((b: any) => b.status === 'paid').sort((a: any, b: any) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())[0];
                        if (lastPaid && lastPaid.due_date) {
                            nextDueDate = new Date(lastPaid.due_date);
                            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                        } else if (occ.start_date) {
                            nextDueDate = new Date(occ.start_date);
                        }
                    }
                } catch (dateError) {
                    console.log('Date parsing error', dateError);
                }

                return {
                    id: occ.id,
                    tenantId: occ.tenant_id,
                    tenantName: `${occ.tenant?.first_name || ''} ${occ.tenant?.last_name || ''}`,
                    propertyTitle: occ.property?.title || 'Unknown',
                    nextDueDate: nextDueDate,
                    status
                };
            });
            setBillingSchedule(schedule.sort((a, b) => (a.nextDueDate?.getTime() || 0) - (b.nextDueDate?.getTime() || 0)));
        } catch (e) {
            console.log('Error calculating billing schedule:', e);
        }
    }

    // --- BULK EMAIL LOGIC ---
    const openEmailModal = () => {
        // Load tenants into selectable format
        const tenants = occupancies.map(occ => ({
            id: occ.tenant_id,
            name: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
            property: occ.property?.title,
            phone: occ.tenant?.phone
        }));
        setAllTenants(tenants);
        setSelectedTenants([]);
        setEmailSubject('');
        setEmailBody('');
        setShowEmailModal(true);
    };

    const toggleTenantSelection = (id: string) => {
        if (selectedTenants.includes(id)) {
            setSelectedTenants(prev => prev.filter(t => t !== id));
        } else {
            setSelectedTenants(prev => [...prev, id]);
        }
    };

    const selectAllTenants = () => {
        if (selectedTenants.length === allTenants.length) {
            setSelectedTenants([]);
        } else {
            setSelectedTenants(allTenants.map(t => t.id));
        }
    };

    const sendBulkNotification = async () => {
        if (selectedTenants.length === 0) return Alert.alert('Error', 'Select at least one tenant');
        if (!emailSubject || !emailBody) return Alert.alert('Error', 'Enter subject and message');

        setSendingEmail(true);
        try {
            // Using API call pattern from Next.js, adapted for fetch in RN
            // Ensure you have this endpoint deployed or handle locally via Supabase functions
            const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/send-bulk-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantIds: selectedTenants,
                    subject: emailSubject,
                    body: emailBody,
                    ending: emailEnding,
                    landlordId: session.user.id
                })
            });

            const result = await response.json();
            if (result.success) {
                Alert.alert('Success', 'Notifications sent!');
                setShowEmailModal(false);
            } else {
                // Fallback if API fails: Create local notifications
                for (const tenantId of selectedTenants) {
                    await createNotification(tenantId, 'broadcast_message', `${emailSubject}: ${emailBody.substring(0, 50)}...`, { actor: session.user.id });
                }
                Alert.alert('Success', 'In-app notifications sent.');
                setShowEmailModal(false);
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to send notifications');
        } finally {
            setSendingEmail(false);
        }
    };

    // --- BILLING LOGIC ---
    const confirmSendAdvanceBill = async () => {
        const { tenantId, propertyTitle } = advanceBillModal;
        if (!tenantId) return;

        try {
            // Send request to API route or invoke Supabase function
            // Fallback: manually create bill
            // Here we assume manual creation for reliability in RN without backend route:
            const property = properties.find(p => p.title === propertyTitle); // simplified lookup
            const rentAmount = property?.price || 0;

            const { error } = await supabase.from('payment_requests').insert({
                landlord: session.user.id,
                tenant: tenantId,
                property_id: property?.id,
                rent_amount: rentAmount,
                bills_description: 'Advance Rent Payment',
                due_date: new Date().toISOString(),
                status: 'pending'
            });

            if (error) throw error;

            Alert.alert('Success', 'Advance bill sent successfully!');
            setAdvanceBillModal({ isOpen: false, tenantId: null, tenantName: '', propertyTitle: '' });
            calculateBillingSchedule(); // Refresh
        } catch (e) {
            Alert.alert('Error', 'Failed to create bill');
        }
    };

    // --- ASSIGNMENT LOGIC ---
    const openAssignModal = async (property: any) => {
        setSelectedProperty(property);
        const { data: bookings } = await supabase.from('bookings').select('*').eq('property_id', property.id).eq('status', 'approved');

        if (bookings && bookings.length > 0) {
            const tenantIds = bookings.map((b: any) => b.tenant);
            const { data: profiles } = await supabase.from('profiles').select('*').in('id', tenantIds);
            const profileMap = (profiles || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});
            const candidates = bookings.map((b: any) => ({ ...b, tenant_profile: profileMap[b.tenant] }));
            setAcceptedApplications(candidates);
        } else {
            setAcceptedApplications([]);
        }

        // Reset Form
        setStartDate(new Date().toISOString().split('T')[0]);
        setContractMonths('12');
        setPenaltyDetails('');
        setWifiDueDay('');
        setAssignModalVisible(true);
    };

    const assignTenant = async (candidate: any) => {
        if (!startDate || !endDate) return Alert.alert('Error', 'Please check dates');
        if (!penaltyDetails) return Alert.alert('Error', 'Please enter late penalty fee');

        setUploadingContract(true);
        const securityDeposit = selectedProperty.price || 0;

        // 1. Create Occupancy
        const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
            property_id: selectedProperty.id,
            tenant_id: candidate.tenant,
            landlord_id: session.user.id,
            status: 'active',
            start_date: new Date(startDate).toISOString(),
            contract_end_date: endDate,
            security_deposit: securityDeposit,
            security_deposit_used: 0,
            wifi_due_day: wifiDueDay ? parseInt(wifiDueDay) : null,
            late_payment_fee: parseFloat(penaltyDetails) || 0
        }).select().single();

        if (error) {
            setUploadingContract(false);
            Alert.alert('Error', error.message);
            return;
        }

        // 2. Update Property
        await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedProperty.id);

        // 3. Auto-Create Move-In Bill
        await supabase.from('payment_requests').insert({
            landlord: session.user.id,
            tenant: candidate.tenant,
            property_id: selectedProperty.id,
            occupancy_id: newOccupancy.id,
            rent_amount: selectedProperty.price,
            security_deposit_amount: securityDeposit,
            advance_amount: selectedProperty.price, // 1 month advance
            bills_description: 'Move-in Payment (Rent + Advance + Security Deposit)',
            due_date: new Date(startDate).toISOString(),
            status: 'pending',
            is_move_in_payment: true
        });

        // 4. Notify (non-blocking)
        try {
            const message = `You have been assigned to "${selectedProperty.title}" from ${startDate}. Move-in bill sent.`;
            await createNotification(candidate.tenant, 'occupancy_assigned', message, { actor: session.user.id });
        } catch (notifErr) {
            console.log('Notification failed (non-critical):', notifErr);
        }

        setUploadingContract(false);
        Alert.alert('Success', 'Tenant assigned & Move-in bill created!');
        setAssignModalVisible(false);
        loadDashboard();
    };

    // --- RENEWAL LOGIC ---
    const openRenewalModal = (occupancy: any, action: string) => {
        setRenewalModal({ isOpen: true, occupancy, action });
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        setRenewalSigningDate(defaultDate.toISOString().split('T')[0]);

        if (occupancy && occupancy.contract_end_date) {
            const currentEnd = new Date(occupancy.contract_end_date);
            currentEnd.setFullYear(currentEnd.getFullYear() + 1);
            setRenewalEndDate(currentEnd.toISOString().split('T')[0]);
        }
    };

    const confirmRenewalRequest = async () => {
        const { occupancy, action } = renewalModal;
        if (!occupancy) return;
        const approved = action === 'approve';

        const updateData: any = {
            renewal_status: approved ? 'approved' : 'rejected',
            renewal_requested: false
        };

        if (approved) {
            updateData.contract_end_date = renewalEndDate;
            updateData.renewal_signing_date = renewalSigningDate;

            // Create Renewal Bill (Rent + Advance)
            const rentAmount = occupancy.property?.price || 0;
            await supabase.from('payment_requests').insert({
                landlord: session.user.id,
                tenant: occupancy.tenant_id,
                property_id: occupancy.property_id,
                occupancy_id: occupancy.id,
                rent_amount: rentAmount,
                advance_amount: rentAmount, // 1 month advance
                bills_description: 'Contract Renewal (1 Month Rent + 1 Month Advance)',
                due_date: new Date(renewalSigningDate).toISOString(),
                status: 'pending',
                is_renewal_payment: true
            });
        }

        await supabase.from('tenant_occupancies').update(updateData).eq('id', occupancy.id);
        const message = approved ? `Renewal approved. Bill sent.` : `Renewal rejected.`;
        await createNotification(occupancy.tenant_id, approved ? 'contract_renewal_approved' : 'contract_renewal_rejected', message, { actor: session.user.id });

        Alert.alert('Success', approved ? 'Renewed & Bill Sent' : 'Rejected');
        setRenewalModal({ isOpen: false, occupancy: null, action: null });
        loadDashboard();
    };

    // --- ACTION CENTER HELPERS ---
    const openEndContractModal = (occupancy: any) => {
        setEndContractModal({ isOpen: true, occupancy });
        setEndContractDate(new Date().toISOString().split('T')[0]);
        setEndContractReason('');
    };

    const approveEndRequest = async (occupancyId: string) => {
        const occupancy = pendingEndRequests.find(o => o.id === occupancyId);
        if (!occupancy) return;

        await supabase.from('tenant_occupancies')
            .update({ status: 'ended', end_date: new Date().toISOString(), end_request_status: 'approved' })
            .eq('id', occupancyId);
        await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id);

        // Close booking
        await supabase.from('bookings').update({ status: 'completed' }).eq('tenant', occupancy.tenant_id).eq('property_id', occupancy.property_id);

        await createNotification(occupancy.tenant_id, 'end_request_approved', `Move-out approved for ${occupancy.property?.title}`, { actor: session.user.id });
        Alert.alert('Approved', 'Contract ended.');
        loadDashboard();
    };

    const confirmEndContract = async () => {
        const { occupancy } = endContractModal;
        if (!occupancy) return;
        if (!endContractDate || !endContractReason) return Alert.alert('Error', 'Date and Reason required');

        await supabase.from('tenant_occupancies')
            .update({ status: 'ended', end_date: new Date(endContractDate).toISOString() })
            .eq('id', occupancy.id);
        await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id);

        await createNotification(occupancy.tenant_id, 'occupancy_ended', `Contract ended. Reason: ${endContractReason}`, { actor: session.user.id });
        Alert.alert('Success', 'Contract ended.');
        setEndContractModal({ isOpen: false, occupancy: null });
        loadDashboard();
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDashboard} />}
        >
            {/* --- HERO HEADER BOX --- */}
            <View style={styles.headerBox}>
                <View style={styles.headerTextSection}>
                    <Text style={styles.welcomeText}>Welcome</Text>
                    <Text style={styles.nameText}>{profile?.first_name || 'Landlord'} {profile?.last_name || ''}</Text>
                    <View style={styles.roleBadge}>
                        <Ionicons name="shield-checkmark" size={12} color="#059669" />
                        <Text style={styles.roleText}>{profile?.role === 'landlord' ? 'Landlord' : 'User'}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => router.push('/properties/new' as any)} style={styles.addPropertyBtn}>
                    <View style={styles.addPropertyIcon}>
                        <Ionicons name="add" size={24} color="white" />
                    </View>
                    <Text style={styles.addPropertyLabel}>Add Property</Text>
                </TouchableOpacity>
            </View>

            {/* --- MESSAGE TENANTS BUTTON --- */}
            <TouchableOpacity onPress={openEmailModal} style={styles.messageTenantsBtnFull}>
                <View style={styles.messageTenantsBtnInner}>
                    <View style={styles.messageTenantsBtnIconCircle}>
                        <Ionicons name="chatbubbles" size={18} color="white" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.messageTenantsBtnTitle}>Message Tenants</Text>
                        <Text style={styles.messageTenantsBtnSub}>Send notifications to your tenants via SMS & Email</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </View>
            </TouchableOpacity>

            {/* --- METRICS GRID --- */}
            <View style={styles.gridContainer}>
                {/* Properties */}
                <View style={styles.metricCard}>
                    <View style={[styles.iconBox, { backgroundColor: '#f3f4f6' }]}>
                        <Ionicons name="home-outline" size={20} color="#111" />
                    </View>
                    <Text style={styles.metricValue}>{properties.length}</Text>
                    <Text style={styles.metricLabel}>Properties</Text>
                </View>
                {/* Tenants */}
                <View style={styles.metricCard}>
                    <View style={[styles.iconBox, { backgroundColor: '#d1fae5' }]}>
                        <Ionicons name="people-outline" size={20} color="#059669" />
                    </View>
                    <Text style={styles.metricValue}>{occupancies.length}</Text>
                    <Text style={styles.metricLabel}>Tenants</Text>
                </View>
                {/* Income */}
                <View style={styles.metricCard}>
                    <View style={[styles.iconBox, { backgroundColor: '#dbeafe' }]}>
                        <Ionicons name="cash-outline" size={20} color="#2563eb" />
                    </View>
                    <Text style={[styles.metricValue, { fontSize: 18 }]}>₱{(monthlyIncome.yearTotal / 1000).toFixed(1)}k</Text>
                    <Text style={styles.metricLabel}>Income</Text>
                </View>
                {/* Tasks */}
                <View style={styles.metricCard}>
                    <View style={[styles.iconBox, { backgroundColor: '#ffe4e6' }]}>
                        <Ionicons name="alert-circle-outline" size={20} color="#e11d48" />
                    </View>
                    <Text style={styles.metricValue}>
                        {pendingEndRequests.length + pendingRenewalRequests.length + tasks.maintenance.length + tasks.payments.length}
                    </Text>
                    <Text style={styles.metricLabel}>Pending</Text>
                </View>
            </View>

            {/* --- FINANCIAL OVERVIEW --- */}
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Income {selectedStatementYear}</Text>
                <View style={styles.card}>
                    <LineChart
                        data={monthlyChartData}
                        width={width - 60}
                        height={200}
                        chartConfig={{
                            backgroundColor: "#ffffff",
                            backgroundGradientFrom: "#ffffff",
                            backgroundGradientTo: "#ffffff",
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(5, 150, 105, ${opacity})`,
                            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                            style: { borderRadius: 16 },
                            propsForDots: { r: "4", strokeWidth: "2", stroke: "#047857" }
                        }}
                        bezier
                        style={{ marginVertical: 8, borderRadius: 16 }}
                    />
                </View>
            </View>

            {/* --- ACTION CENTER --- */}
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Action Center</Text>

                {/* Move Out Requests */}
                {pendingEndRequests.map(req => (
                    <View key={req.id} style={[styles.actionCard, { borderColor: '#ffedd5', backgroundColor: '#fff7ed' }]}>
                        <View style={{ flex: 1 }}>
                            <View style={[styles.badge, { backgroundColor: '#fdba74' }]}><Text style={styles.badgeText}>MOVE-OUT</Text></View>
                            <Text style={styles.actionTitle}>{req.property?.title}</Text>
                            <Text style={styles.actionSub}>{req.tenant?.first_name} {req.tenant?.last_name}</Text>
                        </View>
                        <TouchableOpacity onPress={() => approveEndRequest(req.id)} style={styles.btnSmallBlack}>
                            <Text style={styles.btnTextWhite}>Approve</Text>
                        </TouchableOpacity>
                    </View>
                ))}

                {/* Renewals */}
                {pendingRenewalRequests.map(req => (
                    <View key={req.id} style={[styles.actionCard, { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' }]}>
                        <View style={{ flex: 1 }}>
                            <View style={[styles.badge, { backgroundColor: '#818cf8' }]}><Text style={styles.badgeText}>RENEWAL</Text></View>
                            <Text style={styles.actionTitle}>{req.property?.title}</Text>
                            <Text style={styles.actionSub}>{req.tenant?.first_name}</Text>
                        </View>
                        <TouchableOpacity onPress={() => openRenewalModal(req, 'approve')} style={styles.btnSmallBlack}>
                            <Text style={styles.btnTextWhite}>Review</Text>
                        </TouchableOpacity>
                    </View>
                ))}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.actionQuickCard, { flex: 1 }]} onPress={() => router.push('/(tabs)/maintenance' as any)}>
                        <View style={[styles.actionQuickIcon, { backgroundColor: '#fef3c7' }]}>
                            <Ionicons name="hammer-outline" size={20} color="#b45309" />
                        </View>
                        <Text style={styles.actionQuickLabel}>Maintenance</Text>
                        <Text style={styles.actionQuickCount}>{tasks.maintenance.length}</Text>
                        <Ionicons name="chevron-forward" size={16} color="#ccc" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionQuickCard, { flex: 1 }]} onPress={() => router.push('/(tabs)/payments' as any)}>
                        <View style={[styles.actionQuickIcon, { backgroundColor: '#dbeafe' }]}>
                            <Ionicons name="card-outline" size={20} color="#2563eb" />
                        </View>
                        <Text style={styles.actionQuickLabel}>Payments</Text>
                        <Text style={styles.actionQuickCount}>{tasks.payments.length}</Text>
                        <Ionicons name="chevron-forward" size={16} color="#ccc" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* --- BILLING SCHEDULE --- */}
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Upcoming Bills</Text>
                <View style={styles.card}>
                    {billingSchedule.length === 0 ? (
                        <View style={styles.emptyState}><Text style={{ color: '#999' }}>No upcoming bills</Text></View>
                    ) : (
                        billingSchedule.slice(0, 5).map((item, idx) => (
                            <View key={idx} style={styles.billRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.billTenant}>{item.tenantName}</Text>
                                    <Text style={styles.billProp}>{item.propertyTitle}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                                    <Text style={styles.billDate}>{item.nextDueDate ? new Date(item.nextDueDate).toLocaleDateString() : 'N/A'}</Text>
                                    <View style={[styles.statusBadge, item.status === 'Overdue' ? styles.bgRed : styles.bgGreen]}>
                                        <Text style={[styles.statusText, item.status === 'Overdue' ? styles.textRed : styles.textGreen]}>{item.status}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setAdvanceBillModal({ isOpen: true, tenantId: item.tenantId, tenantName: item.tenantName, propertyTitle: item.propertyTitle })}
                                    style={styles.btnXs}
                                >
                                    <Text style={styles.btnTextXs}>Bill</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>
            </View>

            {/* --- SCHEDULED TENANTS TODAY --- */}
            <View style={styles.sectionContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                    <Text style={styles.sectionTitle}>Today's Viewings</Text>
                    <View style={[styles.badge, { backgroundColor: '#f3f4f6' }]}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#111' }}>{scheduledViewings.length}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    {scheduledViewings.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="calendar-outline" size={32} color="#e5e7eb" style={{ marginBottom: 8 }} />
                            <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '500' }}>No viewings scheduled for today</Text>
                        </View>
                    ) : (
                        scheduledViewings.map((viewing, idx) => (
                            <View key={idx} style={[styles.billRow, idx === scheduledViewings.length - 1 && { borderBottomWidth: 0 }]}>
                                {/* Time Column */}
                                <View style={{ alignItems: 'center', marginRight: 15, width: 45 }}>
                                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#111' }}>
                                        {new Date(viewing.booking_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                    </Text>
                                    <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase' }}>
                                        {new Date(viewing.booking_date).getHours() < 12 ? 'AM' : 'PM'}
                                    </Text>
                                </View>

                                {/* Info Column */}
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111' }}>
                                        {viewing.tenant_profile?.first_name} {viewing.tenant_profile?.last_name}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={1}>{viewing.property?.title}</Text>
                                </View>

                                {/* Status Icon */}
                                <View style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 16, backgroundColor: '#dcfce7' }}>
                                    <Ionicons name="checkmark" size={16} color="#166534" />
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </View>

            {/* --- OCCUPIED PROPERTIES --- */}
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Occupied Properties</Text>

                {occupancies.length === 0 ? (
                    <View style={[styles.card, styles.emptyState]}>
                        <Ionicons name="home-outline" size={32} color="#e5e7eb" style={{ marginBottom: 8 }} />
                        <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '500' }}>No properties are currently occupied</Text>
                    </View>
                ) : (
                    occupancies.map((occ: any) => (
                        <View key={occ.id} style={styles.propCard}>
                            <View style={{ height: 150, backgroundColor: '#eee', position: 'relative' }}>
                                <Image
                                    source={{ uri: occ.property?.images?.[0] || 'https://via.placeholder.com/400' }}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="cover"
                                />
                                <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'white', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 }}>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#059669' }}>OCCUPIED</Text>
                                </View>
                            </View>

                            <View style={styles.propContent}>
                                <Text style={styles.propTitle}>{occ.property?.title}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                                    <Ionicons name="location-outline" size={12} color="#9ca3af" />
                                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{occ.property?.address || 'No address'}</Text>
                                </View>

                                <View style={styles.occupantRow}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name="person" size={16} color="#166534" />
                                        </View>
                                        <View>
                                            <Text style={{ fontSize: 9, color: '#166534', fontWeight: 'bold', opacity: 0.8 }}>TENANT</Text>
                                            <Text style={styles.occupantName}>{occ.tenant?.first_name} {occ.tenant?.last_name}</Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity onPress={() => openEndContractModal(occ)} style={styles.btnEnd}>
                                        <Text style={styles.btnEndText}>End Contract</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* --- MODALS --- */}

            {/* 1. Assign Modal */}
            <Modal visible={assignModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Assign Tenant</Text>
                            <TouchableOpacity onPress={() => setAssignModalVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 400 }}>
                            <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
                            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />

                            <Text style={styles.label}>Duration (Months)</Text>
                            <TextInput style={styles.input} value={contractMonths} onChangeText={setContractMonths} keyboardType="numeric" />

                            <Text style={styles.label}>End Date (Auto)</Text>
                            <TextInput style={[styles.input, { backgroundColor: '#f3f4f6' }]} value={endDate} editable={false} />

                            <Text style={styles.label}>Late Penalty Fee (₱)</Text>
                            <TextInput style={styles.input} value={penaltyDetails} onChangeText={setPenaltyDetails} keyboardType="numeric" placeholder="e.g. 500" />

                            <Text style={styles.label}>Wifi Due Day (1-31)</Text>
                            <TextInput style={styles.input} value={wifiDueDay} onChangeText={setWifiDueDay} keyboardType="numeric" />

                            <Text style={[styles.label, { marginTop: 15 }]}>Select Approved Application:</Text>
                            {acceptedApplications.length === 0 ? (
                                <Text style={{ color: '#999', fontStyle: 'italic', marginBottom: 10 }}>No approved applications.</Text>
                            ) : (
                                acceptedApplications.map(item => (
                                    <View key={item.id} style={styles.userRow}>
                                        <View>
                                            <Text style={{ fontWeight: 'bold' }}>{item.tenant_profile?.first_name}</Text>
                                            <Text style={{ fontSize: 10, color: '#666' }}>{item.tenant_profile?.phone}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => assignTenant(item)} disabled={uploadingContract} style={styles.btnSmallBlack}>
                                            {uploadingContract ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.btnTextWhite}>Assign</Text>}
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* 2. Email Modal */}
            <Modal visible={showEmailModal} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.fullScreenModal}>
                    {/* Modal Header */}
                    <View style={styles.emailModalHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={styles.emailModalHeaderIcon}>
                                <Ionicons name="chatbubbles" size={20} color="white" />
                            </View>
                            <View>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>Message Tenants</Text>
                                <Text style={{ fontSize: 12, color: '#9ca3af' }}>Send notifications to your tenants</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => setShowEmailModal(false)} style={styles.emailCloseBtn}>
                            <Ionicons name="close" size={20} color="#666" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                        {/* Recipients Section */}
                        <View style={styles.emailSection}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Ionicons name="people" size={16} color="#111" />
                                <Text style={styles.emailSectionLabel}>Recipients</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowTenantDropdown(!showTenantDropdown)} style={styles.emailDropdownTrigger}>
                                <Ionicons name="person-add-outline" size={18} color="#9ca3af" />
                                <Text style={{ flex: 1, color: selectedTenants.length === 0 ? '#9ca3af' : '#111', fontSize: 14, fontWeight: selectedTenants.length > 0 ? '600' : '400' }}>
                                    {selectedTenants.length === 0 ? 'Tap to select tenants...' : `${selectedTenants.length} tenant${selectedTenants.length > 1 ? 's' : ''} selected`}
                                </Text>
                                {selectedTenants.length > 0 && (
                                    <View style={styles.emailCountBadge}>
                                        <Text style={styles.emailCountText}>{selectedTenants.length}</Text>
                                    </View>
                                )}
                                <Ionicons name={showTenantDropdown ? "chevron-up" : "chevron-down"} size={18} color="#9ca3af" />
                            </TouchableOpacity>

                            {showTenantDropdown && (
                                <View style={styles.emailDropdownList}>
                                    <TouchableOpacity onPress={selectAllTenants} style={styles.emailDropdownSelectAll}>
                                        <Ionicons name={selectedTenants.length === allTenants.length ? "checkbox" : "square-outline"} size={20} color={selectedTenants.length === allTenants.length ? "#111" : "#ccc"} />
                                        <Text style={{ fontWeight: '700', fontSize: 14, marginLeft: 10 }}>Select All</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={{ fontSize: 12, color: '#9ca3af' }}>{allTenants.length} tenants</Text>
                                    </TouchableOpacity>
                                    {allTenants.map(t => (
                                        <TouchableOpacity key={t.id} onPress={() => toggleTenantSelection(t.id)} style={styles.emailDropdownItemRow}>
                                            <Ionicons name={selectedTenants.includes(t.id) ? "checkbox" : "square-outline"} size={20} color={selectedTenants.includes(t.id) ? "#111" : "#d1d5db"} />
                                            <View style={styles.emailTenantInfo}>
                                                <Text style={styles.emailTenantName}>{t.name}</Text>
                                                <Text style={styles.emailTenantProp}>{t.property}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Subject Section */}
                        <View style={styles.emailSection}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Ionicons name="text" size={16} color="#111" />
                                <Text style={styles.emailSectionLabel}>Subject</Text>
                            </View>
                            <TextInput
                                style={styles.emailInput}
                                value={emailSubject}
                                onChangeText={setEmailSubject}
                                placeholder="e.g. Monthly Rent Reminder"
                                placeholderTextColor="#c4c4c4"
                            />
                        </View>

                        {/* Message Section */}
                        <View style={styles.emailSection}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="document-text" size={16} color="#111" />
                                    <Text style={styles.emailSectionLabel}>Message</Text>
                                </View>
                                <Text style={{ fontSize: 11, color: '#c4c4c4' }}>{emailBody.length} chars</Text>
                            </View>
                            <TextInput
                                style={styles.emailMessageInput}
                                value={emailBody}
                                onChangeText={setEmailBody}
                                multiline
                                placeholder="Write your message to tenants here..."
                                placeholderTextColor="#c4c4c4"
                                textAlignVertical="top"
                            />
                        </View>

                        {/* Preview Info */}
                        {selectedTenants.length > 0 && emailSubject.length > 0 && (
                            <View style={styles.emailPreviewBox}>
                                <Ionicons name="eye-outline" size={16} color="#6366f1" />
                                <Text style={styles.emailPreviewText}>
                                    Will send to {selectedTenants.length} tenant{selectedTenants.length > 1 ? 's' : ''}: "{emailSubject}"
                                </Text>
                            </View>
                        )}
                    </ScrollView>

                    {/* Bottom Send Button */}
                    <View style={styles.emailBottomBar}>
                        <TouchableOpacity
                            onPress={sendBulkNotification}
                            disabled={sendingEmail || selectedTenants.length === 0 || !emailSubject || !emailBody}
                            style={[
                                styles.emailSendBtn,
                                (sendingEmail || selectedTenants.length === 0 || !emailSubject || !emailBody) && { opacity: 0.5 }
                            ]}
                        >
                            {sendingEmail ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <>
                                    <Ionicons name="send" size={18} color="white" />
                                    <Text style={styles.emailSendBtnText}>Send Notification</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 3. Renewal Modal */}
            <Modal visible={renewalModal.isOpen} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{renewalModal.action === 'approve' ? 'Approve Renewal' : 'Reject Request'}</Text>
                        {renewalModal.action === 'approve' ? (
                            <>
                                <View style={{ backgroundColor: '#e0e7ff', padding: 10, borderRadius: 8, marginBottom: 15 }}>
                                    <Text style={{ color: '#3730a3', fontSize: 12 }}>Approving will extend the contract and automatically send a bill for Rent + 1 Month Advance.</Text>
                                </View>
                                <Text style={styles.label}>New End Date</Text>
                                <TextInput style={styles.input} value={renewalEndDate} onChangeText={setRenewalEndDate} />
                                <Text style={styles.label}>Signing Date</Text>
                                <TextInput style={styles.input} value={renewalSigningDate} onChangeText={setRenewalSigningDate} />
                            </>
                        ) : (
                            <Text style={{ marginBottom: 20 }}>Are you sure you want to reject this request?</Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                            <TouchableOpacity onPress={() => setRenewalModal({ isOpen: false, occupancy: null, action: null })} style={[styles.btnFull, { backgroundColor: '#eee' }]}><Text>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={confirmRenewalRequest} style={[styles.btnFull, { backgroundColor: renewalModal.action === 'approve' ? '#4f46e5' : '#ef4444' }]}>
                                <Text style={styles.btnTextWhite}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 4. End Contract Modal */}
            <Modal visible={endContractModal.isOpen} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>End Contract</Text>
                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 15 }}>This will mark the property as available.</Text>
                        <Text style={styles.label}>End Date</Text>
                        <CalendarPicker
                            selectedDate={endContractDate}
                            onDateSelect={setEndContractDate}
                        />
                        <Text style={styles.label}>Reason</Text>
                        <TextInput style={styles.input} value={endContractReason} onChangeText={setEndContractReason} multiline />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                            <TouchableOpacity onPress={() => setEndContractModal({ isOpen: false, occupancy: null })} style={[styles.btnFull, { backgroundColor: '#eee' }]}><Text>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={confirmEndContract} style={[styles.btnFull, { backgroundColor: '#ef4444' }]}><Text style={styles.btnTextWhite}>End Contract</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 5. Advance Bill Modal */}
            <Modal visible={advanceBillModal.isOpen} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Send Advance Bill</Text>
                        <Text style={{ marginVertical: 10 }}>Send an immediate rent bill to <Text style={{ fontWeight: 'bold' }}>{advanceBillModal.tenantName}</Text>?</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                            <TouchableOpacity onPress={() => setAdvanceBillModal({ isOpen: false, tenantId: null, tenantName: '', propertyTitle: '' })} style={[styles.btnFull, { backgroundColor: '#eee' }]}><Text>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={confirmSendAdvanceBill} style={[styles.btnFull, { backgroundColor: 'black' }]}><Text style={styles.btnTextWhite}>Send Bill</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },

    // Header Box
    headerBox: {
        backgroundColor: '#111827',
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 24,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTextSection: { flex: 1 },
    welcomeText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
    nameText: { color: 'white', fontSize: 22, fontWeight: 'bold', marginTop: 2 },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(5, 150, 105, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginTop: 8,
    },
    roleText: { color: '#34d399', fontSize: 11, fontWeight: '700' },
    addPropertyBtn: { alignItems: 'center', gap: 6 },
    addPropertyIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    addPropertyLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },

    // Message Tenants Button
    messageTenantsBtnFull: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 1,
    },
    messageTenantsBtnInner: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    messageTenantsBtnIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageTenantsBtnTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
    messageTenantsBtnSub: { fontSize: 11, color: '#9ca3af', marginTop: 1 },

    // Grid
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', padding: 15, marginTop: 0 },
    metricCard: { width: '47%', backgroundColor: 'white', borderRadius: 20, padding: 15, margin: '1.5%', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    metricValue: { fontSize: 22, fontWeight: '900', color: '#111' },
    metricLabel: { fontSize: 12, color: '#666', fontWeight: '500' },

    // Sections
    sectionContainer: { paddingHorizontal: 20, paddingBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
    card: { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },

    // Action Cards
    actionCard: { padding: 15, borderRadius: 16, marginBottom: 10, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 4 },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: 'white' },
    actionTitle: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
    actionSub: { fontSize: 12, color: '#6b7280' },
    miniTitle: { fontSize: 12, fontWeight: 'bold', color: '#666' },

    // Action Center Quick Cards
    actionQuickCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    actionQuickIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    actionQuickLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: '#333' },
    actionQuickCount: { fontSize: 20, fontWeight: '900', color: '#111', marginRight: 4 },

    // Billing
    billRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#f3f4f6' },
    billTenant: { fontSize: 14, fontWeight: 'bold', color: '#111' },
    billProp: { fontSize: 11, color: '#666' },
    billDate: { fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' },
    statusBadge: { paddingHorizontal: 6, borderRadius: 4, marginTop: 2 },
    bgRed: { backgroundColor: '#fee2e2' },
    bgGreen: { backgroundColor: '#dcfce7' },
    textRed: { color: '#ef4444', fontSize: 10, fontWeight: 'bold' },
    textGreen: { color: '#16a34a', fontSize: 10, fontWeight: 'bold' },
    statusText: { fontSize: 10, fontWeight: 'bold' },
    btnXs: { backgroundColor: 'black', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    btnTextXs: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    // Properties - Row Layout Cards
    propCardRow: {
        flex: 1,
        backgroundColor: 'white',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    propImageContainerRow: { height: 110, backgroundColor: '#eee' },
    propImage: { width: '100%', height: '100%' },
    propStatus: { position: 'absolute', top: 8, left: 8, backgroundColor: 'white', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
    propStatusText: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' },
    propContentRow: { padding: 10 },
    propTitleRow: { fontSize: 13, fontWeight: 'bold', color: '#111' },
    propAddress: { fontSize: 10, color: '#666', marginTop: 1 },
    propPriceRow: { fontSize: 14, fontWeight: '900', color: '#111', marginTop: 4 },
    propStatusBadge: { marginTop: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },

    // View All Button
    viewAllBtn: {
        backgroundColor: '#111',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 15,
    },
    viewAllBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

    // Legacy property styles (kept for modals/other usage)
    propCard: { backgroundColor: 'white', borderRadius: 20, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
    propImageContainer: { height: 180, backgroundColor: '#eee' },
    propContent: { padding: 16 },
    propTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
    propPrice: { fontSize: 16, fontWeight: '900', color: '#111', backgroundColor: '#f3f4f6', paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden' },
    occupantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 10 },
    occupantName: { fontSize: 13, fontWeight: 'bold', color: '#166534' },
    btnEnd: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
    btnEndText: { color: '#ef4444', fontSize: 10, fontWeight: 'bold' },
    assignBtn: { width: '100%', padding: 12, backgroundColor: '#111', borderRadius: 10, alignItems: 'center' },
    assignBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

    // Common Buttons
    btnSmallBlack: { backgroundColor: 'black', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    btnTextWhite: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    btnFull: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    emptyState: { padding: 20, alignItems: 'center' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 20, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    fullScreenModal: { flex: 1, backgroundColor: 'white', marginTop: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    label: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', color: '#666', marginBottom: 5, marginTop: 10 },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#f9fafb' },
    userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },

    // Dropdown
    dropdownTrigger: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center' },
    dropdownContent: { maxHeight: 200, borderWidth: 1, borderColor: '#eee', marginTop: 5, borderRadius: 10 },
    dropdownItem: { padding: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#f9fafb' },

    // Email Modal
    emailModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    emailModalHeaderIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emailCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emailSection: { marginBottom: 20 },
    emailSectionLabel: { fontSize: 13, fontWeight: '700', color: '#111' },
    emailDropdownTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        padding: 14,
        backgroundColor: '#fafafa',
    },
    emailCountBadge: {
        backgroundColor: '#111',
        borderRadius: 10,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emailCountText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
    emailDropdownList: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#fff',
    },
    emailDropdownSelectAll: {
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderBottomWidth: 1,
        borderColor: '#e5e7eb',
    },
    emailDropdownItemRow: {
        padding: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderBottomWidth: 1,
        borderColor: '#f3f4f6',
    },
    emailTenantInfo: { flex: 1 },
    emailTenantName: { fontSize: 14, fontWeight: '600', color: '#111' },
    emailTenantProp: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
    emailInput: {
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        padding: 14,
        fontSize: 15,
        backgroundColor: '#fafafa',
        color: '#111',
    },
    emailMessageInput: {
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        padding: 14,
        fontSize: 15,
        backgroundColor: '#fafafa',
        color: '#111',
        height: 140,
    },
    emailPreviewBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#eef2ff',
        padding: 12,
        borderRadius: 12,
        marginTop: 5,
    },
    emailPreviewText: { flex: 1, fontSize: 12, color: '#6366f1', fontWeight: '500' },
    emailBottomBar: {
        padding: 16,
        paddingBottom: 30,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        backgroundColor: 'white',
    },
    emailSendBtn: {
        backgroundColor: '#111827',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    emailSendBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});