import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import CalendarPicker from '../../../components/ui/CalendarPicker';
import { useRealtime } from '../../../hooks/useRealtime';
import { createNotification } from '../../../lib/notifications';
import { supabase } from '../../../lib/supabase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;

export default function TenantDashboard({ session, profile }: any) {
    const router = useRouter();

    // --- STATE ---
    const [properties, setProperties] = useState<any[]>([]);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [guestFavorites, setGuestFavorites] = useState<any[]>([]);
    const [topRated, setTopRated] = useState<any[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [comparisonList, setComparisonList] = useState<any[]>([]);
    const [occupancy, setOccupancy] = useState<any>(null);
    const [propertyStats, setPropertyStats] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Active Property State
    const [activePropertyImageIndex, setActivePropertyImageIndex] = useState(0);

    // Financials
    const [tenantBalance, setTenantBalance] = useState(0);
    const [pendingPayments, setPendingPayments] = useState<any[]>([]);
    const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
    const [nextPaymentDate, setNextPaymentDate] = useState<string>('Loading...');
    const [lastRentPeriod, setLastRentPeriod] = useState<string>('N/A');
    const [lastPayment, setLastPayment] = useState<any>(null);
    const [securityDepositPaid, setSecurityDepositPaid] = useState(false);
    const [securityDepositProcessing, setSecurityDepositProcessing] = useState(false);
    const [totalRentPaid, setTotalRentPaid] = useState(0);

    // Renewals
    const [daysUntilContractEnd, setDaysUntilContractEnd] = useState<number | null>(null);
    const [canRenew, setCanRenew] = useState(false);
    const [showRenewalModal, setShowRenewalModal] = useState(false);
    const [renewalMeetingDate, setRenewalMeetingDate] = useState('');
    const [renewalRequested, setRenewalRequested] = useState(false);

    // Reviews & End Request
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [reviewTarget, setReviewTarget] = useState<any>(null);
    const [reviewRating, setReviewRating] = useState(5); // Internal ref
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [cleanlinessRating, setCleanlinessRating] = useState(5);
    const [communicationRating, setCommunicationRating] = useState(5);
    const [locationRating, setLocationRating] = useState(5);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const [endRequestModalVisible, setEndRequestModalVisible] = useState(false);
    const [endRequestDate, setEndRequestDate] = useState('');
    const [endRequestReason, setEndRequestReason] = useState('');
    const [submittingEndRequest, setSubmittingEndRequest] = useState(false);

    // --- INITIAL LOAD ---
    useEffect(() => {
        if (profile) {
            loadInitialData();
        }
    }, [profile]);

    useRealtime(
        ['tenant_occupancies', 'payment_requests', 'payments', 'tenant_balances'],
        () => {
            console.log("Realtime update triggered reload for tenant dashboard");
            loadInitialData();
        },
        !!profile
    );

    useRealtime(
        ['properties'],
        () => {
            console.log("Property update triggered reload");
            loadPropertiesData();
        },
        !!profile
    );

    // Image Slider Effect
    useEffect(() => {
        if (occupancy?.property?.images?.length > 1) {
            const interval = setInterval(() => {
                setActivePropertyImageIndex(prev => (prev + 1) % occupancy.property.images.length);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [occupancy]);

    // Financial Calc Effect
    useEffect(() => {
        if (occupancy) {
            calculateNextPayment(occupancy.id, occupancy);
        }
    }, [pendingPayments, occupancy]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadInitialData();
    }, []);

    async function loadInitialData() {
        await Promise.all([
            loadPropertiesData(),
            loadOccupancyData(),
            checkPendingReviews()
        ]);
        setLoading(false);
        setRefreshing(false);
    }

    // --- DATA FETCHING ---

    const loadPropertiesData = async () => {
        try {
            const { data: allProps } = await supabase
                .from('properties')
                .select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)')
                .eq('is_deleted', false);

            const { data: stats } = await supabase.from('property_stats').select('*');
            const statsMap: any = {};
            if (stats) stats.forEach((s: any) => { statsMap[s.property_id] = s; });
            setPropertyStats(statsMap);
            setProperties(allProps || []);

            // Stats Logic
            const favs = (allProps || []).filter((p: any) => (statsMap[p.id]?.favorite_count || 0) >= 1)
                .sort((a: any, b: any) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
                .slice(0, 8);
            const rated = (allProps || []).filter((p: any) => (statsMap[p.id]?.review_count || 0) > 0)
                .sort((a: any, b: any) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
                .slice(0, 8);

            setGuestFavorites(favs);
            setTopRated(rated);

            if (session?.user) {
                const { data: userFavs } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id);
                if (userFavs) setFavorites(userFavs.map((f: any) => f.property_id));
            }
        } catch (err) { console.error(err); }
    };

    const loadOccupancyData = async () => {
        try {
            if (!session?.user) {
                console.log("loadOccupancyData: No session user");
                return;
            }
            console.log("loadOccupancyData: Fetching for user:", session.user.id);

            const { data: occs, error } = await supabase.from('tenant_occupancies')
                .select('*, property:properties(*), landlord:profiles!tenant_occupancies_landlord_id_fkey(*)')
                .eq('tenant_id', session.user.id)
                .in('status', ['active', 'pending_end', 'approved', 'signed'])
                .order('start_date', { ascending: false });

            if (error) {
                console.error("loadOccupancyData Error:", error);
                return;
            }

            console.log("Fetched occupancies:", occs?.length);
            if (occs && occs.length > 0) {
                occs.forEach((o, i) => console.log(`[${i}] Status: ${o.status}, Start: ${o.start_date}, Prop: ${o.property?.title}`));
            }

            // Filter out occupancies with missing or deleted properties
            const validOccs = occs?.filter((o: any) => o.property && !o.property.is_deleted) || [];

            // Prioritize Active/Pending_End -> Then Approved/Signed
            // Sort by start_date desc to get latest if multiple exist in same category
            const activeOrPending = validOccs.filter((o: any) => o.status === 'active' || o.status === 'pending_end');
            const signedOrApproved = validOccs.filter((o: any) => o.status === 'approved' || o.status === 'signed');

            // Pick the best candidate:
            // 1. Latest Active/Pending
            // 2. Latest Signed/Approved (if no active)
            let finalOcc = null;
            if (activeOrPending.length > 0) {
                finalOcc = activeOrPending.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
            } else if (signedOrApproved.length > 0) {
                finalOcc = signedOrApproved.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
            }

            const occ = finalOcc;

            console.log("Selected Occ:", occ?.id, occ?.status, occ?.property?.title);

            // Handle images possibly being a string
            if (occ && occ.property && typeof occ.property.images === 'string') {
                try {
                    occ.property.images = JSON.parse(occ.property.images);
                } catch (e) {
                    occ.property.images = [];
                }
            }

            setOccupancy(occ);

            if (occ) {
                // Contract End Logic
                if (occ.contract_end_date) {
                    console.log("Found contract end date:", occ.contract_end_date);
                    const endDate = new Date(occ.contract_end_date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); endDate.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    console.log("Calculated days until end:", diffDays);
                    setDaysUntilContractEnd(diffDays);
                    setCanRenew(diffDays > 29 && !occ.renewal_requested);
                    setRenewalRequested(occ.renewal_requested || false);
                } else {
                    console.log("No contract end date found");
                }

                // Financials
                await loadFinancials(occ.id, occ);
                checkLastMonthDepositLogic(occ);
            }
        } catch (err) {
            console.error("loadOccupancyData Exception:", err);
        }
    };

    const loadFinancials = async (occupancyId: string, occData: any) => {
        // Pending Bills (Status: 'pending', 'pending_confirmation', 'rejected')
        // We exclude 'cancelled' and 'paid'
        const { data: allBills } = await supabase.from('payment_requests')
            .select('*')
            .eq('tenant', session.user.id)
            .neq('status', 'cancelled')
            .order('due_date', { ascending: true });

        const bills = allBills || [];

        // Separation
        const pending = bills.filter((b: any) => b.status === 'pending' || b.status === 'rejected' || b.status === 'pending_confirmation');
        const history = bills.filter((b: any) => b.status === 'paid');

        setPendingPayments(pending);

        // Filter history for current occupancy
        const occupancyHistory = history.filter((h: any) =>
            h.occupancy_id === occupancyId || (occData.property_id && h.property_id === occData.property_id)
        );

        setPaymentHistory(occupancyHistory);

        // Total Paid Calculation
        const totalPaid = occupancyHistory.reduce((sum: number, p: any) => sum + (Number(p.rent_amount) || 0), 0);
        setTotalRentPaid(totalPaid);

        // Balance
        const { data: balance } = await supabase.from('tenant_balances')
            .select('amount')
            .eq('tenant_id', session.user.id)
            .eq('occupancy_id', occupancyId)
            .maybeSingle();
        setTenantBalance(balance?.amount || 0);

        // Last Payment (Rent)
        const last = occupancyHistory.filter((h: any) => h.rent_amount > 0).pop();
        setLastPayment(last);

        // Security Deposit Paid?
        const depositBills = bills.filter((h: any) => Number(h.security_deposit_amount) > 0 && h.occupancy_id === occupancyId);

        const paidBill = depositBills.find((b: any) => b.status === 'paid');
        const processingBill = depositBills.find((b: any) => b.status === 'pending_confirmation');

        setSecurityDepositProcessing(!!processingBill && !paidBill);
        setSecurityDepositPaid(!!paidBill);

        if (!paidBill && !processingBill) {
            // Fallback: Use occupancy history search
            const paidDep = occupancyHistory.some((h: any) => Number(h.security_deposit_amount) > 0);
            setSecurityDepositPaid(!!paidDep);
        }
    };

    // --- LOGIC: NEXT BILL & DEPOSIT ---

    const checkLastMonthDepositLogic = async (occupancy: any) => {
        if (!occupancy.contract_end_date) return;
        const endDate = new Date(occupancy.contract_end_date);
        const today = new Date();
        endDate.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const renewalActive = occupancy.renewal_requested || occupancy.renewal_status === 'pending' || occupancy.renewal_status === 'approved';

        if (diffDays <= 28 && diffDays > 0 && !renewalActive) {
            const rentAmount = Number(occupancy.property?.price || 0);
            const depositUsed = Number(occupancy.security_deposit_used || 0);
            const availableDeposit = Number(occupancy.security_deposit || 0) - depositUsed;

            // Check existing bills last 45 days
            const windowStart = new Date(endDate);
            windowStart.setDate(windowStart.getDate() - 40);
            const { data: existingBills } = await supabase.from('payment_requests')
                .select('*')
                .eq('occupancy_id', occupancy.id)
                .gte('due_date', windowStart.toISOString().split('T')[0])
                .gt('rent_amount', 0);

            if (existingBills && existingBills.length > 0) return;

            if (availableDeposit >= rentAmount) {
                // Pay with deposit
                await supabase.from('payment_requests').insert({
                    tenant: session.user.id,
                    property_id: occupancy.property_id,
                    occupancy_id: occupancy.id,
                    rent_amount: rentAmount,
                    status: 'paid', description: 'Last Month Rent (Deposit)', due_date: new Date().toISOString()
                });
                await supabase.from('tenant_occupancies').update({ security_deposit_used: depositUsed + rentAmount }).eq('id', occupancy.id);
                createNotification(session.user.id, 'payment_paid', 'Last month rent paid via Security Deposit', { actor: session.user.id });
                Alert.alert('Info', 'Last month rent paid using Security Deposit.');
                loadFinancials(occupancy.id, occupancy);
            } else {
                // Emergency Bill
                if (availableDeposit > 0) {
                    await supabase.from('tenant_occupancies').update({ security_deposit_used: depositUsed + availableDeposit }).eq('id', occupancy.id);
                }
                const lack = rentAmount - availableDeposit;
                await supabase.from('payment_requests').insert({
                    tenant: session.user.id,
                    property_id: occupancy.property_id,
                    occupancy_id: occupancy.id,
                    rent_amount: lack, status: 'pending', description: 'Emergency Bill: Last Month Balance', due_date: new Date().toISOString()
                });
                Alert.alert('Notice', `Emergency Bill generated: ₱${lack.toLocaleString()}`);
                loadFinancials(occupancy.id, occupancy);
            }
        }
    };

    const calculateNextPayment = async (occupancyId: string, currentOccupancy: any) => {
        // 1. Pending Bills
        const pendingBill = pendingPayments.find(b => {
            if (b.occupancy_id === occupancyId) return true;
            if (currentOccupancy?.property_id && b.property_id === currentOccupancy.property_id) return true;
            return false;
        });

        if (pendingBill) {
            if (pendingBill.status === 'pending_confirmation') {
                setNextPaymentDate("Payment Processing");
            } else {
                setNextPaymentDate(new Date(pendingBill.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
            }
            setLastRentPeriod("N/A");
            return;
        }

        // 2. Calculated from History
        // Use component state paymentHistory which is now filtered
        const paidBills = paymentHistory.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

        const lastBill = paidBills.length > 0 ? paidBills[paidBills.length - 1] : null;

        if (lastBill) {
            const rent = parseFloat(lastBill.rent_amount || 0);
            const advance = parseFloat(lastBill.advance_amount || 0);
            let monthsCovered = 1;

            if (rent > 0 && advance > 0) {
                monthsCovered = 1 + Math.floor(advance / rent);
            }

            const nextDue = new Date(lastBill.due_date);
            nextDue.setMonth(nextDue.getMonth() + monthsCovered);

            // Check Contract End
            if (currentOccupancy.contract_end_date) {
                const endDate = new Date(currentOccupancy.contract_end_date);
                const paidPeriodEnd = new Date(lastBill.due_date);
                paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCovered);

                if (paidPeriodEnd >= endDate) {
                    setNextPaymentDate("All Paid - Contract Ending");
                    setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString());
                    return;
                }
            }
            setNextPaymentDate(nextDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
            setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString());

        } else {
            // No history -> Start Date
            setNextPaymentDate(new Date(currentOccupancy.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
            setLastRentPeriod("N/A");
        }
    };

    // --- ACTIONS ---

    const requestContractRenewal = async () => {
        if (!renewalMeetingDate) return Alert.alert('Error', 'Select a date');
        const { error } = await supabase.from('tenant_occupancies').update({
            renewal_requested: true,
            renewal_requested_at: new Date().toISOString(),
            renewal_status: 'pending',
            renewal_meeting_date: renewalMeetingDate
        }).eq('id', occupancy.id);

        if (!error) {
            createNotification(occupancy.landlord_id, 'contract_renewal_request', `Renewal req: ${renewalMeetingDate}`, { actor: session.user.id });
            Alert.alert('Sent', 'Renewal request sent.');
            setShowRenewalModal(false);
            loadOccupancyData();
        } else Alert.alert('Error', error.message);
    };

    const requestEndOccupancy = async () => {
        if (!occupancy || !endRequestDate || !endRequestReason) return Alert.alert('Error', 'Fill all fields');
        setSubmittingEndRequest(true);
        try {
            console.log('requestEndOccupancy: Updating occupancy', occupancy.id);
            const { data, error } = await supabase.from('tenant_occupancies').update({
                status: 'pending_end',
                end_requested_at: new Date().toISOString(),
                end_request_reason: endRequestReason.trim(),
                end_request_date: endRequestDate,
                end_request_status: 'pending'
            }).eq('id', occupancy.id).select();

            if (error) {
                console.error('requestEndOccupancy: Update error:', error);
                Alert.alert('Error', `Failed to submit: ${error.message}`);
                setSubmittingEndRequest(false);
                return;
            }

            console.log('requestEndOccupancy: Update success, data:', data);

            // Send notification to landlord
            try {
                const tenantName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
                await createNotification(
                    occupancy.landlord_id,
                    'end_occupancy_request',
                    `${tenantName || 'A tenant'} requested to end occupancy on ${endRequestDate}. Reason: ${endRequestReason.trim().substring(0, 50)}`,
                    { actor: session.user.id }
                );
                console.log('requestEndOccupancy: Notification sent to landlord', occupancy.landlord_id);
            } catch (notifErr) {
                console.error('requestEndOccupancy: Notification error:', notifErr);
                // Don't block the flow — the update already succeeded
            }

            Alert.alert('Sent', 'End request sent.');
            setEndRequestModalVisible(false);
            setEndRequestReason('');
            setEndRequestDate('');
            loadOccupancyData();
        } catch (err) {
            console.error('requestEndOccupancy: Unexpected error:', err);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        }
        setSubmittingEndRequest(false);
    };

    const toggleFavorite = async (id: string) => {
        if (!session) return;
        if (favorites.includes(id)) {
            setFavorites(prev => prev.filter(f => f !== id));
            await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', id);
        } else {
            setFavorites(prev => [...prev, id]);
            await supabase.from('favorites').insert({ user_id: session.user.id, property_id: id });
        }
    };

    const toggleCompare = (prop: any) => {
        setComparisonList(prev => {
            if (prev.find((p: any) => p.id === prop.id)) return prev.filter((p: any) => p.id !== prop.id);
            if (prev.length >= 3) { Alert.alert('Limit', 'Max 3 properties'); return prev; }
            return [...prev, prop];
        });
    };

    const checkPendingReviews = async () => {
        if (!session?.user) return;
        const { data: ended } = await supabase.from('tenant_occupancies').select('*, property:properties(title, id, address, city)').eq('tenant_id', session.user.id).eq('status', 'ended');
        const { data: reviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', session.user.id);
        const reviewedIds = reviews?.map((r: any) => r.occupancy_id) || [];
        const dismissedStr = await AsyncStorage.getItem('dismissedReviews');
        const dismissedReviews = dismissedStr ? JSON.parse(dismissedStr) : [];
        const unreviewed = ended?.find((o: any) => !reviewedIds.includes(o.id) && !dismissedReviews.includes(o.id));
        if (unreviewed) { setReviewTarget(unreviewed); setReviewModalVisible(true); }
    };

    const submitReview = async () => {
        if (!reviewTarget) return;
        setSubmittingReview(true);
        const overallRating = Math.round((cleanlinessRating + communicationRating + locationRating) / 3);
        const { error } = await supabase.from('reviews').insert({
            property_id: reviewTarget.property_id, user_id: session.user.id, tenant_id: session.user.id, occupancy_id: reviewTarget.id,
            rating: overallRating, cleanliness_rating: cleanlinessRating, communication_rating: communicationRating, location_rating: locationRating,
            comment: reviewComment, created_at: new Date().toISOString()
        });
        setSubmittingReview(false);
        if (!error) { Alert.alert('Success', 'Review submitted'); setReviewModalVisible(false); checkPendingReviews(); }
    };

    const handleSkipReview = async () => {
        if (dontShowAgain && reviewTarget) {
            try {
                const dismissedStr = await AsyncStorage.getItem('dismissedReviews');
                const dismissed = dismissedStr ? JSON.parse(dismissedStr) : [];
                if (!dismissed.includes(reviewTarget.id)) {
                    // Update array and save back to storage
                    const newDismissed = [...dismissed, reviewTarget.id];
                    await AsyncStorage.setItem('dismissedReviews', JSON.stringify(newDismissed));
                    console.log("Saved dismissed review:", reviewTarget.id, newDismissed);
                }
            } catch (e) {
                console.error("Failed to save dismissed review preference", e);
            }
        }
        setReviewModalVisible(false);
    };

    // --- RENDERS ---

    const renderCard = (item: any) => {
        const isFav = favorites.includes(item.id);
        const isCompare = comparisonList.some(c => c.id === item.id);
        const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 };
        return (
            <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.9} onPress={() => router.push(`/properties/${item.id}` as any)}>
                <View style={styles.cardImageContainer}>
                    <Image source={{ uri: item.images?.[0] || 'https://via.placeholder.com/400' }} style={styles.cardImage} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.cardGradient} />
                    <View style={styles.cardHeader}>
                        <View style={[styles.badge, item.status === 'available' ? styles.badgeAvailable : styles.badgeOccupied]}>
                            <Text style={[styles.badgeText, item.status === 'available' ? styles.textDark : styles.textWhite]}>{item.status === 'available' ? 'Available' : 'Occupied'}</Text>
                        </View>
                        {stats.favorite_count >= 1 && <View style={[styles.badge, styles.badgeFav]}><Ionicons name="heart" size={10} color="white" /><Text style={[styles.badgeText, styles.textWhite, { marginLeft: 2 }]}>{stats.favorite_count}</Text></View>}
                    </View>
                    <View style={styles.cardActions}>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id) }} style={styles.actionBtn}><Ionicons name={isFav ? "heart" : "heart-outline"} size={18} color={isFav ? "#ef4444" : "#666"} /></TouchableOpacity>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleCompare(item) }} style={[styles.actionBtn, { marginTop: 8 }, isCompare && styles.actionBtnActive]}><Ionicons name={isCompare ? "checkmark" : "add"} size={18} color={isCompare ? "white" : "#666"} /></TouchableOpacity>
                    </View>
                    <View style={styles.priceOverlay}><Text style={styles.priceText}>₱{Number(item.price).toLocaleString()}</Text><Text style={styles.priceSub}>/mo</Text></View>
                </View>
                <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.cardLocation}>{item.city}, Philippines</Text>
                    <View style={styles.featureRow}>
                        <View style={styles.featureItem}><Ionicons name="bed-outline" size={14} color="#666" /><Text style={styles.featureText}>{item.bedrooms}</Text></View>
                        <View style={styles.divider} />
                        <View style={styles.featureItem}><Ionicons name="water-outline" size={14} color="#666" /><Text style={styles.featureText}>{item.bathrooms}</Text></View>
                        <View style={styles.divider} />
                        <View style={styles.featureItem}><Ionicons name="resize-outline" size={14} color="#666" /><Text style={styles.featureText}>{item.area_sqft} sqm</Text></View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

                {occupancy ? (
                    <View style={styles.dashboardContent}>
                        {/* Header */}
                        <View style={styles.headerRow}>
                            <View>
                                <Text style={styles.headerTitle}>Your Active Property</Text>
                                <Text style={styles.headerSubtitle}>Manage your lease & payments.</Text>
                            </View>
                            <TouchableOpacity onPress={() => router.push('/properties' as any)}><Text style={styles.seeMoreLink}>See More Properties</Text></TouchableOpacity>
                        </View>

                        {/* 1. Main Property Card */}
                        <View style={styles.activeCard}>
                            <View style={styles.activeImageContainer}>
                                <Image
                                    source={{ uri: occupancy.property?.images?.[activePropertyImageIndex] || 'https://via.placeholder.com/600' }}
                                    style={styles.activeImage}
                                />
                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.activeGradient} />

                                <View style={styles.activeBadge}>
                                    <View style={[styles.statusDot, occupancy.status === 'pending_end' ? { backgroundColor: '#f59e0b' } : { backgroundColor: '#10b981' }]} />
                                    <Text style={styles.activeBadgeText}>{occupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Lease'}</Text>
                                </View>

                                {/* Title Overlay */}
                                <View style={styles.activeInfoOverlay}>
                                    <Text style={styles.activeTitle} numberOfLines={1}>{occupancy.property?.title}</Text>
                                    <Text style={styles.activeAddress} numberOfLines={1}>{occupancy.property?.address}, {occupancy.property?.city}</Text>
                                </View>

                                {/* Slider Dots */}
                                {occupancy.property?.images?.length > 1 && (
                                    <View style={styles.sliderDots}>
                                        {occupancy.property.images.map((_: any, i: number) => (
                                            <View key={i} style={[styles.dot, i === activePropertyImageIndex && styles.dotActive]} />
                                        ))}
                                    </View>
                                )}
                            </View>

                            <View style={styles.activeContent}>
                                <View style={styles.leaseRow}>
                                    <View style={styles.leaseItem}>
                                        <Text style={styles.leaseLabel}>LEASE START</Text>
                                        <Text style={styles.leaseValue}>{new Date(occupancy.start_date).toLocaleDateString()}</Text>
                                    </View>
                                    {occupancy.contract_end_date && (
                                        <View style={[styles.leaseItem, { alignItems: 'flex-end' }]}>
                                            <Text style={styles.leaseLabel}>LEASE END</Text>
                                            <Text style={styles.leaseValue}>{new Date(occupancy.contract_end_date).toLocaleDateString()}</Text>
                                            {daysUntilContractEnd !== null && (
                                                <Text style={{ fontSize: 10, color: '#ea580c', fontWeight: 'bold', marginTop: 2 }}>
                                                    Ends in {daysUntilContractEnd} days
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.gridActions}>
                                    <TouchableOpacity style={[styles.gridBtn, styles.btnGray]} onPress={() => router.push(`/properties/${occupancy.property?.id}` as any)}>
                                        <Text style={styles.btnTextGray}>View Details</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.gridBtn, occupancy.contract_url ? styles.btnBlack : styles.btnDisabled]}
                                        disabled={!occupancy.contract_url}
                                        onPress={() => occupancy.contract_url && Linking.openURL(occupancy.contract_url)}
                                    >
                                        <Ionicons name="document-text-outline" size={16} color={occupancy.contract_url ? "white" : "#999"} style={{ marginRight: 4 }} />
                                        <Text style={occupancy.contract_url ? styles.btnTextWhite : styles.btnTextDisabled}>
                                            {occupancy.contract_url ? "View Contract" : "Contract Pending"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.gridActions, { marginTop: 8 }]}>
                                    {canRenew ? (
                                        <TouchableOpacity style={[styles.gridBtn, styles.btnOutline]} onPress={() => setShowRenewalModal(true)}>
                                            <Ionicons name="refresh" size={16} color="black" style={{ marginRight: 4 }} />
                                            <Text style={styles.btnTextBlack}>Renew Contract</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={[styles.gridBtn, styles.btnDisabled]}><Text style={styles.btnTextDisabled}>Renew Unavailable</Text></View>
                                    )}
                                    <TouchableOpacity style={[styles.gridBtn, styles.btnOutlineRed]} onPress={() => setEndRequestModalVisible(true)}>
                                        <Text style={styles.btnTextRed}>End Contract</Text>
                                    </TouchableOpacity>
                                </View>
                                {occupancy.property?.terms_conditions ? (
                                    <TouchableOpacity
                                        style={[styles.gridBtn, { marginTop: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', width: '100%' }]}
                                        onPress={() => {
                                            const terms = occupancy.property.terms_conditions;
                                            if (typeof terms === 'string' && terms.startsWith('http')) {
                                                Linking.openURL(terms);
                                            } else {
                                                setShowTermsModal(true);
                                            }
                                        }}
                                    >
                                        <Ionicons name="document-text-outline" size={16} color="#333" style={{ marginRight: 6 }} />
                                        <Text style={styles.btnTextBlack}>View Property Terms</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>

                        {/* 2. Security Deposit */}
                        <View style={styles.infoCard}>
                            <View style={styles.cardHeaderSmall}>
                                <View style={styles.iconCircle}><Ionicons name="lock-closed-outline" size={16} color="#333" /></View>
                                <Text style={styles.cardTitleSmall}>Security Deposit</Text>
                            </View>
                            {securityDepositPaid ? (
                                <View>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.textLabel}>Total Deposit</Text>
                                        <Text style={styles.textValueBlack}>₱{Number(occupancy.security_deposit || 0).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.textLabel}>Used</Text>
                                        <Text style={styles.textValueGray}>₱{Number(occupancy.security_deposit_used || 0).toLocaleString()}</Text>
                                    </View>
                                    <View style={[styles.rowBetween, styles.borderTop, { paddingTop: 8, marginTop: 4 }]}>
                                        <Text style={styles.textLabelBold}>Remaining Balance</Text>
                                        <Text style={styles.textValueBig}>₱{Number((occupancy.security_deposit || 0) - (occupancy.security_deposit_used || 0)).toLocaleString()}</Text>
                                    </View>
                                    {daysUntilContractEnd !== null && daysUntilContractEnd <= 30 && (
                                        <View style={styles.tipBox}><Text style={styles.tipText}>💡 Deposit can be used for last month.</Text></View>
                                    )}
                                </View>
                            ) : securityDepositProcessing ? (
                                <View style={styles.centerBox}>
                                    <Ionicons name="hourglass-outline" size={24} color="#f59e0b" style={{ marginBottom: 4 }} />
                                    <Text style={[styles.textLabel, { color: '#f59e0b', fontWeight: 'bold' }]}>Deposit Payment Processing</Text>
                                    <Text style={styles.textValueGray}>Please wait for confirmation.</Text>
                                </View>
                            ) : (
                                <View style={styles.centerBox}>
                                    <Text style={styles.textLabel}>No security deposit paid yet</Text>
                                    <Text style={styles.textValueGray}>Required: ₱{Number(occupancy.security_deposit || 0).toLocaleString()}</Text>
                                </View>
                            )}
                        </View>

                        {/* 3. Utility Reminders */}
                        <View style={styles.infoCard}>
                            <View style={styles.cardHeaderSmall}>
                                <View style={[styles.iconCircle, { backgroundColor: '#fef3c7' }]}><Ionicons name="alarm-outline" size={16} color="#d97706" /></View>
                                <Text style={styles.cardTitleSmall}>Utility Reminders</Text>
                            </View>
                            <View style={styles.utilityItem}>
                                <View style={[styles.utilIcon, { backgroundColor: '#fef3c7' }]}><Ionicons name="flash" size={14} color="#d97706" /></View>
                                <View>
                                    <Text style={styles.utilTitle}>Electricity Bill</Text>
                                    <Text style={styles.utilSub}>Usually arrives 1st week of the month.</Text>
                                </View>
                            </View>
                            {occupancy.wifi_due_day && (
                                <View style={[styles.utilityItem, { marginTop: 10 }]}>
                                    <View style={[styles.utilIcon, { backgroundColor: '#dbeafe' }]}><Ionicons name="wifi" size={14} color="#2563eb" /></View>
                                    <View>
                                        <Text style={styles.utilTitle}>Internet Bill</Text>
                                        <Text style={styles.utilSub}>Due on the {occupancy.wifi_due_day}th of the month.</Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* 4. Pending Payments */}
                        <View style={styles.infoCard}>
                            <View style={[styles.rowBetween, { marginBottom: 16 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={styles.cardTitleSmall}>Recent Payments</Text>
                                    {pendingPayments.length > 0 && <View style={styles.badgeRed}><Text style={styles.badgeRedText}>{pendingPayments.length} Pending</Text></View>}
                                </View>
                                <TouchableOpacity onPress={() => router.push('/payments' as any)}><Text style={styles.seeAllText}>See All</Text></TouchableOpacity>
                            </View>

                            {pendingPayments.length > 0 ? pendingPayments.map((bill, i) => {
                                const total = (Number(bill.rent_amount) || 0) + (Number(bill.water_bill) || 0) + (Number(bill.electrical_bill) || 0) + (Number(bill.other_bills) || 0) + (Number(bill.security_deposit_amount) || 0) + (Number(bill.advance_amount) || 0);
                                const isMoveIn = bill.is_move_in_payment || (Number(bill.security_deposit_amount) > 0);
                                return (
                                    <View key={i} style={styles.billRow}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={styles.billIcon}><Ionicons name={bill.rent_amount > 0 ? "home-outline" : "flash-outline"} size={18} color="#333" /></View>
                                            <View>
                                                <Text style={styles.billTitle}>{isMoveIn ? 'Move-in Bill' : (bill.rent_amount > 0 ? 'House Rent' : 'Utility Bill')}</Text>
                                                {bill.status === 'pending_confirmation' ? (
                                                    <Text style={[styles.billDate, { color: '#f59e0b', fontWeight: 'bold' }]}>Processing Payment</Text>
                                                ) : bill.status === 'rejected' ? (
                                                    <Text style={[styles.billDate, { color: '#ef4444', fontWeight: 'bold' }]}>Payment Rejected</Text>
                                                ) : (
                                                    <Text style={styles.billDate}>Due: {new Date(bill.due_date).toLocaleDateString()}</Text>
                                                )}
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.billAmount}>₱{total.toLocaleString()}</Text>
                                            {bill.status === 'pending_confirmation' ? (
                                                <View style={[styles.payBtnSmall, { backgroundColor: '#fef3c7' }]}>
                                                    <Text style={[styles.payBtnText, { color: '#d97706' }]}> verifying </Text>
                                                </View>
                                            ) : (
                                                <TouchableOpacity style={styles.payBtnSmall} onPress={() => router.push('/payments' as any)}>
                                                    <Text style={styles.payBtnText}>{bill.status === 'rejected' ? 'Retry' : 'Pay Now'}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                )
                            }) : (
                                <View style={styles.emptyStateBox}>
                                    <Ionicons name="checkmark-circle" size={32} color="#10b981" />
                                    <Text style={styles.emptyStateText}>You're all caught up!</Text>
                                </View>
                            )}
                            <Text style={styles.noteText}>Note: Landlord is not liable for late utility payments.</Text>
                        </View>

                        {/* 5. Payment Overview */}
                        <View style={styles.borderCard}>
                            <Text style={styles.cardTitleSmall}>Payment Overview</Text>

                            {/* Credit */}
                            <View style={[styles.overviewRow, { backgroundColor: tenantBalance > 0 ? '#f0fdf4' : '#f9fafb' }]}>
                                <View>
                                    <Text style={styles.ovLabel}>CREDIT BALANCE</Text>
                                    <Text style={styles.ovSub}>{tenantBalance > 0 ? 'Applied to next bill' : 'No credit available'}</Text>
                                </View>
                                <Text style={[styles.ovValue, { color: tenantBalance > 0 ? '#15803d' : '#9ca3af' }]}>₱{tenantBalance.toLocaleString()}</Text>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                <View style={styles.ovBox}>
                                    <Text style={styles.ovLabel}>NEXT HOUSE DUE DATE</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
                                        {/* <Ionicons name="calendar-outline" size={18} color="#000" /> */}
                                        <Text style={[styles.ovDate, { fontSize: 15 }]}>{nextPaymentDate}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <Ionicons name="calendar-outline" size={14} color="#333" />
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#333' }}>Expected Bill: ₱{Number(occupancy.property?.price || 0).toLocaleString()}</Text>
                                    </View>
                                    {daysUntilContractEnd !== null && daysUntilContractEnd < 90 && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Ionicons name="alert-circle-outline" size={12} color="#ea580c" />
                                            <Text style={{ fontSize: 10, color: '#ea580c', fontWeight: 'bold' }}>Contract ends in {daysUntilContractEnd} days</Text>
                                        </View>
                                    )}
                                    {canRenew && (
                                        <TouchableOpacity onPress={() => setShowRenewalModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                            <Ionicons name="refresh" size={12} color="#4338ca" />
                                            <Text style={{ fontSize: 10, color: '#4338ca', fontWeight: 'bold' }}>Renew Contract Available</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <View style={styles.ovBox}>
                                    <Text style={styles.ovLabel}>LAST HOUSE DUE DATE</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name="time-outline" size={12} color="#64748b" />
                                        </View>
                                        <Text style={styles.ovDateGray}>{lastRentPeriod}</Text>
                                    </View>
                                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Total Paid: ₱{totalRentPaid.toLocaleString()}</Text>
                                </View>
                            </View>

                            {/* Payment History Grid */}
                            <View style={styles.historySection}>
                                <Text style={[styles.cardTitleSmall, { marginBottom: 10 }]}>Rent Payment History ({new Date().getFullYear()})</Text>
                                <View style={styles.historyGrid}>
                                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
                                        const isPaid = paymentHistory.some(p => {
                                            const d = new Date(p.due_date);
                                            return d.getMonth() === i && d.getFullYear() === new Date().getFullYear();
                                        });
                                        const isCurrent = new Date().getMonth() === i;
                                        return (
                                            <View key={m} style={styles.monthCol}>
                                                <Text style={[styles.monthText, isPaid ? { color: 'black' } : { color: '#d1d5db' }]}>{m}</Text>
                                                {isPaid ? (
                                                    <View style={styles.dotPaid}><Ionicons name="checkmark" size={10} color="black" /></View>
                                                ) : isCurrent ? (
                                                    <View style={styles.dotCurrent} />
                                                ) : (
                                                    <View style={styles.dotEmpty} />
                                                )}
                                            </View>
                                        )
                                    })}
                                </View>
                            </View>
                        </View>
                    </View>
                ) : (
                    // --- ALL PROPERTIES VIEW (Preserved) ---
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>All Properties</Text>
                            <TouchableOpacity onPress={() => router.push('/properties' as any)}><Text style={styles.seeMore}>See More</Text></TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
                            {properties.slice(0, 8).map(renderCard)}
                        </ScrollView>

                        {guestFavorites.length > 0 && (
                            <View style={{ marginTop: 24 }}>
                                <Text style={[styles.sectionTitle, { marginLeft: 20 }]}>Tenant Favorites</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
                                    {guestFavorites.map(renderCard)}
                                </ScrollView>
                            </View>
                        )}
                        {topRated.length > 0 && (
                            <View style={{ marginTop: 24 }}>
                                <Text style={[styles.sectionTitle, { marginLeft: 20 }]}>Top Rated</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
                                    {topRated.map(renderCard)}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                )}

            </ScrollView>

            {/* Compare Button */}
            {comparisonList.length > 0 && (
                <TouchableOpacity style={styles.compareBtn} onPress={() => router.push({ pathname: '/compare', params: { ids: comparisonList.map((c: any) => c.id).join(',') } })}>
                    <View style={styles.compareBadge}><Text style={styles.compareBadgeText}>{comparisonList.length}</Text></View>
                    <Text style={styles.compareText}>COMPARE SELECTED</Text>
                </TouchableOpacity>
            )}

            {/* Renewal Modal */}
            <Modal visible={showRenewalModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={[styles.modalIconContainer, { backgroundColor: '#e0e7ff' }]}>
                            <Ionicons name="repeat" size={28} color="#4338ca" />
                        </View>
                        <Text style={styles.modalTitle}>Request Contract Renewal</Text>
                        <Text style={styles.modalSubtitle}>{occupancy?.property?.title}</Text>

                        <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 'bold' }}>Current Contract Ends</Text>
                                <Text style={{ fontSize: 13, fontWeight: 'bold' }}>
                                    {occupancy?.contract_end_date ? new Date(occupancy.contract_end_date).toLocaleDateString() : 'N/A'}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 'bold' }}>Days Remaining</Text>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: daysUntilContractEnd !== null && daysUntilContractEnd < 30 ? '#ea580c' : '#111' }}>
                                    {daysUntilContractEnd !== null ? `${daysUntilContractEnd} days` : 'N/A'}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.inputLabel}>Select Meeting Date for Contract Signing *</Text>
                        <CalendarPicker
                            selectedDate={renewalMeetingDate}
                            onDateSelect={setRenewalMeetingDate}
                        />
                        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 10, lineHeight: 18 }}>
                            Please choose a date to meet the landlord for signing the new contract.
                        </Text>
                        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8, lineHeight: 18, fontStyle: 'italic' }}>
                            By requesting a renewal, your landlord will be notified and can approve or propose new terms for your continued stay.
                        </Text>

                        <View style={[styles.modalActions, { marginTop: 20 }]}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRenewalModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#4338ca' }]} onPress={requestContractRenewal}>
                                <Text style={styles.confirmBtnText}>Submit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* End Request Modal */}
            <Modal visible={endRequestModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={10}>
                            <View style={styles.modalContent}>
                                <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
                                    <Text style={styles.modalTitle}>Request to Leave</Text>
                                    <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                                    <CalendarPicker
                                        selectedDate={endRequestDate}
                                        onDateSelect={setEndRequestDate}
                                    />
                                    <Text style={styles.inputLabel}>Reason</Text>
                                    <TextInput
                                        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                        value={endRequestReason}
                                        onChangeText={setEndRequestReason}
                                        placeholder="Enter your reason..."
                                        blurOnSubmit={true}
                                        returnKeyType="done"
                                    />
                                    <View style={styles.modalActions}>
                                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setEndRequestModalVisible(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                                        <TouchableOpacity style={styles.confirmBtn} onPress={requestEndOccupancy}><Text style={styles.confirmBtnText}>Submit</Text></TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Review Modal */}
            <Modal visible={reviewModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={[styles.modalIconContainer, { backgroundColor: '#fefce8' }]}>
                            <Ionicons name="star" size={28} color="#eab308" />
                        </View>
                        <Text style={styles.modalTitle}>Rate Your Stay</Text>
                        <Text style={styles.modalSubtitle}>How was your experience at {reviewTarget?.property?.title}?</Text>

                        <View style={styles.ratingCard}>
                            <View style={styles.ratingRow}>
                                <Text style={styles.ratingLabel}>Cleanliness</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setCleanlinessRating(s)}>
                                            <Ionicons name={s <= cleanlinessRating ? "star" : "star-outline"} size={20} color="#eab308" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.ratingRow}>
                                <Text style={styles.ratingLabel}>Communication</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setCommunicationRating(s)}>
                                            <Ionicons name={s <= communicationRating ? "star" : "star-outline"} size={20} color="#eab308" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.ratingRow}>
                                <Text style={styles.ratingLabel}>Location</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setLocationRating(s)}>
                                            <Ionicons name={s <= locationRating ? "star" : "star-outline"} size={20} color="#eab308" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>

                        <Text style={styles.inputLabel}>Comment</Text>
                        <TextInput
                            style={styles.textArea}
                            multiline
                            placeholder="Share your experience..."
                            value={reviewComment}
                            onChangeText={setReviewComment}
                        />

                        <View style={styles.checkboxContainer}>
                            <TouchableOpacity onPress={() => setDontShowAgain(!dontShowAgain)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name={dontShowAgain ? "checkbox" : "square-outline"} size={20} color="#666" />
                                <Text style={{ fontSize: 13, color: '#666' }}>Don't show again for this stay</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={handleSkipReview}>
                                <Text style={styles.cancelBtnText}>Skip</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={submitReview} disabled={submittingReview}>
                                {submittingReview ? <ActivityIndicator color="white" /> : <Text style={styles.confirmBtnText}>Submit Review</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Property Terms Modal */}
            <Modal visible={showTermsModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <View style={[styles.modalIconContainer, { backgroundColor: '#f3f4f6' }]}>
                            <Ionicons name="document-text" size={28} color="#333" />
                        </View>
                        <Text style={styles.modalTitle}>Property Terms & Conditions</Text>
                        <Text style={styles.modalSubtitle}>{occupancy?.property?.title}</Text>
                        <ScrollView style={{ maxHeight: 300, marginVertical: 12 }} showsVerticalScrollIndicator>
                            <Text style={{ fontSize: 14, lineHeight: 22, color: '#444' }}>
                                {occupancy?.property?.terms_conditions || 'No terms available.'}
                            </Text>
                        </ScrollView>
                        <TouchableOpacity style={[styles.confirmBtn, { width: '100%' }]} onPress={() => setShowTermsModal(false)}>
                            <Text style={styles.confirmBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    section: { marginTop: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12, alignItems: 'center' },
    sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111', textTransform: 'uppercase' },
    seeMore: { fontSize: 14, color: '#333', fontWeight: '600' },
    listContainer: { paddingHorizontal: 20, paddingBottom: 10 },

    // Header
    dashboardContent: { padding: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
    headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 4 },
    seeMoreLink: { fontSize: 12, fontWeight: 'bold', color: '#666' },

    // Active Card
    activeCard: { backgroundColor: 'white', borderRadius: 24, padding: 0, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
    activeImageContainer: { height: 220, position: 'relative' },
    activeImage: { width: '100%', height: '100%' },
    activeGradient: { position: 'absolute', bottom: 0, width: '100%', height: 100 },
    activeBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#d1fae5' },
    statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    activeBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#047857', textTransform: 'uppercase' },
    activeInfoOverlay: { position: 'absolute', bottom: 12, left: 16, right: 16 },
    activeTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
    activeAddress: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
    sliderDots: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 4 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
    dotActive: { width: 12, backgroundColor: 'white' },

    activeContent: { padding: 16 },
    leaseRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 12 },
    leaseItem: {},
    leaseLabel: { fontSize: 10, color: '#9ca3af', fontWeight: 'bold', marginBottom: 4 },
    leaseValue: { fontSize: 13, fontWeight: 'bold', color: '#111' },
    gridActions: { flexDirection: 'row', gap: 10 },
    gridBtn: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    btnGray: { backgroundColor: '#f3f4f6' },
    btnBlack: { backgroundColor: '#000' },
    btnOutline: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'white' },
    btnOutlineRed: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
    btnDisabled: { backgroundColor: '#f3f4f6' },
    btnTextGray: { fontWeight: 'bold', fontSize: 12, color: '#374151' },
    btnTextWhite: { fontWeight: 'bold', fontSize: 12, color: 'white' },
    btnTextBlack: { fontWeight: 'bold', fontSize: 12, color: '#111' },
    btnTextRed: { fontWeight: 'bold', fontSize: 12, color: '#dc2626' },
    btnTextDisabled: { fontWeight: 'bold', fontSize: 12, color: '#9ca3af' },

    // Info Cards
    infoCard: { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6' },
    cardHeaderSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
    cardTitleSmall: { fontSize: 14, fontWeight: 'bold', color: '#111' },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    textLabel: { fontSize: 12, color: '#6b7280' },
    textLabelBold: { fontSize: 13, color: '#374151', fontWeight: 'bold' },
    textValueBlack: { fontSize: 13, fontWeight: 'bold', color: '#000' },
    textValueGray: { fontSize: 13, fontWeight: 'bold', color: '#6b7280' },
    textValueBig: { fontSize: 18, fontWeight: '900', color: '#111' },
    borderTop: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    tipBox: { marginTop: 10, backgroundColor: '#f9fafb', padding: 8, borderRadius: 8 },
    tipText: { fontSize: 10, color: '#4b5563' },
    centerBox: { alignItems: 'center', paddingVertical: 10 },

    utilityItem: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    utilIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    utilTitle: { fontSize: 13, fontWeight: 'bold', color: '#1f2937' },
    utilSub: { fontSize: 11, color: '#6b7280' },

    badgeRed: { backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#fee2e2' },
    badgeRedText: { fontSize: 10, color: '#ea580c', fontWeight: 'bold' },
    seeAllText: { fontSize: 12, fontWeight: 'bold', color: '#666' },

    billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' },
    billIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
    billTitle: { fontSize: 13, fontWeight: 'bold', color: '#334155' },
    billDate: { fontSize: 10, color: '#64748b' },
    billAmount: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
    payBtnSmall: { marginTop: 4, backgroundColor: 'black', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    payBtnText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    emptyStateBox: { alignItems: 'center', padding: 20, backgroundColor: '#f8fafc', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
    emptyStateText: { marginTop: 8, fontSize: 13, color: '#64748b', fontWeight: '500' },
    noteText: { fontSize: 10, color: '#94a3b8', marginTop: 10, textAlign: 'center' },

    // Payment Overview
    borderCard: { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 80, borderWidth: 1, borderColor: '#f3f4f6' },
    overviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 12 },
    ovLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', marginBottom: 4 },
    ovSub: { fontSize: 11, color: '#4b5563', fontWeight: '500' },
    ovValue: { fontSize: 18, fontWeight: '900' },
    ovBox: { flex: 1, backgroundColor: '#f9fafb', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6' },
    ovDate: { fontSize: 13, fontWeight: 'bold', color: '#111' },
    ovDateGray: { fontSize: 13, fontWeight: 'bold', color: '#6b7280' },

    historySection: { marginTop: 20 },
    historyGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    monthCol: { width: '16.66%', alignItems: 'center', marginBottom: 12 },
    monthText: { fontSize: 10, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
    dotPaid: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#86efac', alignItems: 'center', justifyContent: 'center' },
    dotCurrent: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
    dotEmpty: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#e5e7eb' },

    // Existing Card & Modal Styles preserved...
    card: { width: CARD_WIDTH, marginRight: 16, backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
    cardImageContainer: { height: 160, width: '100%', position: 'relative' },
    cardImage: { width: '100%', height: '100%' },
    cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
    cardHeader: { position: 'absolute', top: 10, left: 10, alignItems: 'flex-start' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
    badgeAvailable: { backgroundColor: 'white' },
    badgeOccupied: { backgroundColor: 'rgba(0,0,0,0.8)' },
    badgeFav: { backgroundColor: '#f43f5e', borderWidth: 0 },
    badgeText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    textDark: { color: 'black' },
    textWhite: { color: 'white' },
    cardActions: { position: 'absolute', top: 10, right: 10 },
    actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
    actionBtnActive: { backgroundColor: '#111' },
    priceOverlay: { position: 'absolute', bottom: 10, left: 12 },
    priceText: { color: 'white', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
    priceSub: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
    cardContent: { padding: 12 },
    cardLocation: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 4 },
    featureRow: { flexDirection: 'row', alignItems: 'center' },
    featureItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    featureText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
    divider: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginHorizontal: 8 },
    compareBtn: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
    compareText: { color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
    compareBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#111' },
    compareBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: 400 },
    modalIconContainer: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 14, marginBottom: 16 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
    cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
    cancelBtnText: { fontWeight: 'bold', color: '#374151' },
    confirmBtn: { flex: 1, backgroundColor: '#111', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
    confirmBtnText: { fontWeight: 'bold', color: 'white' },

    // Review Modal Styles
    ratingCard: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 16, marginBottom: 16 },
    ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    ratingLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
    starsRow: { flexDirection: 'row', gap: 6 },
    textArea: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, height: 100, fontSize: 14, marginBottom: 16, textAlignVertical: 'top' },
    checkboxContainer: { marginBottom: 20 },
});