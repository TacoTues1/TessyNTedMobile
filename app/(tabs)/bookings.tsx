import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Dimensions,
    Modal,
    RefreshControl,
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

// Optional: Define your backend URL if you want to send actual emails like the Next.js app
const API_URL = null; // e.g. 'https://your-app.com/api'

export default function Bookings() {
    const router = useRouter();

    // -- State --
    const [session, setSession] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');

    // Modal State
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [selectedApplication, setSelectedApplication] = useState<any>(null);
    const [availableTimeSlots, setAvailableTimeSlots] = useState<any[]>([]);
    const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
    const [bookingNotes, setBookingNotes] = useState('');
    const [submittingBooking, setSubmittingBooking] = useState(false);

    const [showCancelModal, setShowCancelModal] = useState(false);
    const [bookingToCancel, setBookingToCancel] = useState<any>(null);

    useEffect(() => {
        loadSession();
    }, []);

    const loadSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return router.replace('/');
        setSession(session);

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setProfile(profile);

        loadBookings(session.user.id, profile?.role);
    };

    // --- HELPER: Ported from Next.js ---
    function getTimeSlotInfo(bookingDate: string) {
        if (!bookingDate) return { emoji: '📅', label: 'Not Scheduled', time: 'Select a time' };

        const date = new Date(bookingDate);
        const hour = date.getHours();
        if (hour === 8) {
            return { emoji: '🌅', label: 'Morning', time: '8:00 AM - 11:00 AM' };
        } else if (hour === 13) {
            return { emoji: '☀️', label: 'Afternoon', time: '1:00 PM - 5:30 PM' };
        } else {
            return {
                emoji: '⏰',
                label: 'Custom',
                time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
        }
    }

    const loadBookings = async (userId: string, role: string) => {
        if (!refreshing) setLoading(true);

        try {
            let bookingsData: any[] = [];

            if (role === 'landlord') {
                const { data: myProperties } = await supabase.from('properties').select('id').eq('landlord', userId);

                if (!myProperties || myProperties.length === 0) {
                    setBookings([]);
                    setLoading(false);
                    setRefreshing(false);
                    return;
                }

                const propIds = myProperties.map(p => p.id);

                let query = supabase
                    .from('bookings')
                    .select('*')
                    .in('property_id', propIds)
                    .order('booking_date', { ascending: false });

                if (filter === 'pending_approval' || filter === 'pending') {
                    query = query.in('status', ['pending', 'pending_approval']);
                } else if (filter === 'approved') {
                    query = query.in('status', ['approved', 'accepted']);
                } else if (filter !== 'all') {
                    query = query.eq('status', filter);
                }

                const { data, error } = await query;
                if (error) throw error;
                bookingsData = data || [];

            } else {
                // --- TENANT LOGIC ---
                let query = supabase
                    .from('bookings')
                    .select('*')
                    .eq('tenant', userId)
                    .order('booking_date', { ascending: false });

                if (filter === 'pending_approval' || filter === 'pending') {
                    query = query.in('status', ['pending', 'pending_approval']);
                } else if (filter === 'approved') {
                    query = query.in('status', ['approved', 'accepted']);
                } else if (filter !== 'all' && filter !== 'ready_to_book') {
                    query = query.eq('status', filter);
                }

                const { data, error } = await query;
                if (error) throw error;
                bookingsData = data || [];

                // 2. Fetch "Accepted" Applications (Ready to Book)
                if (filter === 'all' || filter === 'approved' || filter === 'ready_to_book') {
                    const { data: acceptedApps } = await supabase
                        .from('applications')
                        .select('id, property_id, tenant, status, message')
                        .eq('tenant', userId)
                        .eq('status', 'accepted');

                    if (acceptedApps && acceptedApps.length > 0) {
                        const appsToBook = acceptedApps.map(app => ({
                            id: app.id,
                            is_application: true,
                            property_id: app.property_id,
                            tenant: app.tenant,
                            booking_date: null,
                            status: 'ready_to_book',
                            notes: app.message
                        }));
                        bookingsData = [...appsToBook, ...bookingsData];
                    }
                }
            }

            if (bookingsData.length === 0) {
                setBookings([]);
                setLoading(false);
                setRefreshing(false);
                return;
            }

            // ENRICHMENT
            const propIds = [...new Set(bookingsData.map(b => b.property_id).filter(Boolean))];
            const tenantIds = [...new Set(bookingsData.map(b => b.tenant).filter(Boolean))];

            const { data: properties } = await supabase.from('properties').select('id, title, address, city, landlord').in('id', propIds);
            const { data: tenantProfiles } = await supabase.from('profiles').select('id, first_name, middle_name, last_name, email, phone').in('id', tenantIds);

            const propMap: any = {};
            properties?.forEach(p => { propMap[p.id] = p; });

            const tenantMap: any = {};
            tenantProfiles?.forEach(t => { tenantMap[t.id] = t; });

            const enriched = bookingsData.map(b => ({
                ...b,
                property: propMap[b.property_id],
                tenant_profile: tenantMap[b.tenant]
            }));

            // --- SORTING & DEDUPE (Matches Next.js) ---
            let finalBookings = enriched;
            const hasActiveBooking = bookingsData.some(b => ['pending', 'pending_approval', 'approved', 'accepted'].includes(b.status));

            const getSortWeight = (booking: any) => {
                const s = (booking.status || '').toLowerCase();
                if (['pending', 'pending_approval'].includes(s)) return 1;
                if (s === 'ready_to_book') {
                    if (role !== 'landlord' && hasActiveBooking) return 3; 
                    return 2;
                }
                if (['approved', 'accepted'].includes(s)) return 4;
                if (['rejected', 'cancelled'].includes(s)) return 5;
                return 6;
            };

            if (role !== 'landlord') {
                const distinctMap: any = {};
                const getDedupeScore = (status: string) => {
                    const s = (status || '').toLowerCase();
                    if (['pending', 'pending_approval', 'approved', 'accepted'].includes(s)) return 3;
                    if (s === 'ready_to_book') return 2;
                    if (['rejected', 'cancelled'].includes(s)) return 1;
                    return 0;
                };

                enriched.forEach(item => {
                    const pid = item.property_id;
                    if (!distinctMap[pid]) {
                        distinctMap[pid] = item;
                    } else {
                        const existing = distinctMap[pid];
                        const scoreNew = getDedupeScore(item.status);
                        const scoreExisting = getDedupeScore(existing.status);
                        if (scoreNew > scoreExisting) {
                            distinctMap[pid] = item;
                        }
                    }
                });
                finalBookings = Object.values(distinctMap);
            }

            finalBookings.sort((a, b) => {
                const weightA = getSortWeight(a);
                const weightB = getSortWeight(b);
                if (weightA !== weightB) return weightA - weightB;
                return new Date(b.booking_date || 0).getTime() - new Date(a.booking_date || 0).getTime();
            });

            setBookings(finalBookings);

        } catch (error: any) {
            console.error('Error loading bookings:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // --- ACTIONS ---

    const sendBackendNotification = async (type: string, recordId: string, actorId: string) => {
        if (!API_URL) return;
        try {
            await fetch(`${API_URL}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, recordId, actorId })
            });
        } catch (e) { console.error("Backend notify error", e); }
    };

    const approveBooking = async (booking: any) => {
        const { error } = await supabase.from('bookings').update({ status: 'approved' }).eq('id', booking.id);
        if (error) return Alert.alert('Error', error.message);

        if (booking.time_slot_id) {
            await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', booking.time_slot_id);
        }

        await createNotification(booking.tenant, 'booking_approved', `Your viewing request for ${booking.property?.title} has been approved!`, { actor: session.user.id });
        sendBackendNotification('booking_status', booking.id, session.user.id);

        Alert.alert('Success', 'Booking approved!');
        loadBookings(session.user.id, profile.role);
    };

    const rejectBooking = async (booking: any) => {
        const { error } = await supabase.from('bookings').update({ status: 'rejected' }).eq('id', booking.id);
        if (error) return Alert.alert('Error', error.message);

        if (booking.time_slot_id) {
            await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', booking.time_slot_id);
        }

        await createNotification(booking.tenant, 'booking_rejected', `Your viewing request for ${booking.property?.title} was rejected.`, { actor: session.user.id });
        sendBackendNotification('booking_status', booking.id, session.user.id);

        Alert.alert('Success', 'Booking rejected.');
        loadBookings(session.user.id, profile.role);
    };

    const promptCancelBooking = (booking: any) => {
        setBookingToCancel(booking);
        setShowCancelModal(true);
    };

    const confirmCancelBooking = async () => {
        if (!bookingToCancel) return;

        const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingToCancel.id);
        if (error) {
            Alert.alert("Error", "Failed to cancel");
        } else {
            if (bookingToCancel.time_slot_id) {
                await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', bookingToCancel.time_slot_id);
            }
            Alert.alert("Success", "Booking cancelled");
            loadBookings(session.user.id, profile.role);
        }
        setShowCancelModal(false);
        setBookingToCancel(null);
    };

    // --- MODAL & SCHEDULING ---

    const openBookingModal = async (booking: any) => {
        if (!booking.property?.landlord) return Alert.alert("Error", "Landlord info missing");

        setSelectedApplication(booking);
        setShowBookingModal(true);
        setBookingNotes('');
        setSelectedTimeSlot('');
        setAvailableTimeSlots([]);

        const { data } = await supabase
            .from('available_time_slots')
            .select('*')
            .eq('landlord_id', booking.property.landlord)
            .eq('is_booked', false)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true });

        setAvailableTimeSlots(data || []);
    };

    const submitBooking = async () => {
        if (!selectedTimeSlot || !selectedApplication) return;
        setSubmittingBooking(true);

        const { data: globalActive } = await supabase
            .from('bookings')
            .select('id')
            .eq('tenant', session.user.id)
            .in('status', ['pending', 'pending_approval', 'approved', 'accepted'])
            .maybeSingle();

        if (globalActive && globalActive.id !== selectedApplication.id) {
            Alert.alert("Limit Reached", "You can only have 1 active viewing schedule at a time.");
            setSubmittingBooking(false);
            return;
        }

        const slot = availableTimeSlots.find(s => s.id === selectedTimeSlot);

        const { data: newBooking, error } = await supabase.from('bookings').insert({
            property_id: selectedApplication.property_id,
            tenant: session.user.id,
            landlord: selectedApplication.property.landlord,
            start_time: slot.start_time,
            end_time: slot.end_time,
            booking_date: slot.start_time,
            time_slot_id: slot.id,
            status: 'pending',
            notes: bookingNotes || `Booking for ${selectedApplication.property?.title}`
        }).select().single();

        if (error) {
            Alert.alert("Error", error.message);
            setSubmittingBooking(false);
            return;
        }

        await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', slot.id);

        if (!selectedApplication.is_application) {
            if (selectedApplication.status !== 'rejected' && selectedApplication.status !== 'cancelled') {
                await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', selectedApplication.id);
                if (selectedApplication.time_slot_id) {
                    await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', selectedApplication.time_slot_id);
                }
            }
        }

        await createNotification(selectedApplication.property.landlord, 'new_booking', `${profile.first_name} requested a viewing.`, { actor: session.user.id });
        if(newBooking) sendBackendNotification('booking_new', newBooking.id, session.user.id);

        Alert.alert("Success", "Viewing scheduled!");
        setSubmittingBooking(false);
        setShowBookingModal(false);
        loadBookings(session.user.id, profile.role);
    };

    const canModifyBooking = (bookingDate: string) => {
        if (!bookingDate) return true;
        const diff = (new Date(bookingDate).getTime() - new Date().getTime()) / (1000 * 60 * 60);
        return diff >= 12;
    };

    // --- RENDER ---
    const hasGlobalActive = bookings.some(b => ['pending', 'pending_approval', 'approved', 'accepted'].includes(b.status));
    const pendingCount = bookings.filter(b => b.status === 'pending' || b.status === 'pending_approval').length;
    const approvedCount = bookings.filter(b => b.status === 'approved' || b.status === 'accepted').length;
    const rejectedCount = bookings.filter(b => b.status === 'rejected' || b.status === 'cancelled').length;

    const renderBookingCard = ({ item }: { item: any }) => {
        const timeInfo = getTimeSlotInfo(item.booking_date);
        const date = item.booking_date ? new Date(item.booking_date) : null;
        const isPending = item.status === 'pending' || item.status === 'pending_approval';
        const isPast = date && date < new Date();
        const statusLower = (item.status || '').toLowerCase();
        const roleLower = (profile?.role || '').toLowerCase();

        let badgeStyle = styles.badgeGray;
        let badgeText = styles.badgeTextGray;
        let statusText = item.status;

        if (statusLower === 'ready_to_book') {
            if (roleLower !== 'landlord' && hasGlobalActive) {
                badgeStyle = styles.badgeGray; badgeText = styles.badgeTextGray; statusText = 'Limit Reached';
            } else {
                badgeStyle = styles.badgeBlue; badgeText = styles.badgeTextBlue; statusText = 'Ready to Book';
            }
        } else if (isPending) {
            badgeStyle = styles.badgeYellow; badgeText = styles.badgeTextYellow; statusText = 'Pending';
        } else if (['approved', 'accepted'].includes(statusLower)) {
            badgeStyle = styles.badgeGreen; badgeText = styles.badgeTextGreen; statusText = 'Approved';
        } else if (['rejected', 'cancelled'].includes(statusLower)) {
            badgeStyle = styles.badgeRed; badgeText = styles.badgeTextRed;
        }

        return (
            <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{item.property?.title || 'Unknown Property'}</Text>
                        <Text style={styles.cardSubtitle}>{item.property?.address}</Text>
                        <Text style={styles.cardSubtitle}>
                            {item.tenant_profile?.first_name} {item.tenant_profile?.last_name}
                            {item.tenant_profile?.phone ? ` • ${item.tenant_profile.phone}` : ''}
                        </Text>
                        {item.notes ? <Text style={styles.notes}>"{item.notes}"</Text> : null}
                    </View>
                    <View style={[styles.badge, badgeStyle]}>
                        <Text style={[badgeText]}>{statusText}</Text>
                    </View>
                </View>

                {/* NEW: Action Required Banner (Ported from Next.js) */}
                {statusLower === 'ready_to_book' && !hasGlobalActive && roleLower !== 'landlord' && (
                    <View style={styles.actionBanner}>
                        <Text style={styles.actionBannerTitle}>Action Required</Text>
                        <Text style={styles.actionBannerText}>Please schedule a viewing time.</Text>
                    </View>
                )}

                {/* Date / Time Display (Updated with TimeSlotInfo) */}
                {statusLower !== 'ready_to_book' && date && (
                    <View style={styles.dateContainer}>
                        <Text style={styles.dateLabel}>REQUESTED TIME</Text>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                            <Text style={styles.dateValue}>
                                {date.toLocaleDateString()}
                            </Text>
                            <View style={{flexDirection:'row', alignItems:'center', gap:5}}>
                                <Text style={{fontSize:16}}>{timeInfo.emoji}</Text>
                                <Text style={styles.timeValue}>{timeInfo.time}</Text>
                            </View>
                        </View>
                        {isPast && <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold', marginTop: 2 }}>PAST</Text>}
                    </View>
                )}

                {/* Actions */}
                <View style={styles.actionContainer}>
                    {roleLower === 'landlord' && isPending && (
                        <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                            <TouchableOpacity onPress={() => approveBooking(item)} style={styles.btnApprove}><Text style={styles.btnTextWhite}>Accept</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => rejectBooking(item)} style={styles.btnReject}><Text style={styles.btnTextGray}>Decline</Text></TouchableOpacity>
                        </View>
                    )}

                    {roleLower !== 'landlord' && !isPast && statusLower !== 'completed' && (
                        <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                            {statusLower === 'ready_to_book' && (
                                <TouchableOpacity
                                    onPress={() => !hasGlobalActive && openBookingModal(item)}
                                    disabled={hasGlobalActive}
                                    style={[styles.btnBlack, hasGlobalActive && styles.btnDisabled]}
                                >
                                    <Text style={styles.btnTextWhite}>{hasGlobalActive ? 'Booking Limit Reached' : 'Schedule Viewing'}</Text>
                                </TouchableOpacity>
                            )}

                            {['rejected', 'cancelled'].includes(statusLower) && (
                                <TouchableOpacity
                                    onPress={() => !hasGlobalActive && openBookingModal(item)}
                                    disabled={hasGlobalActive}
                                    style={[styles.btnBlack, hasGlobalActive && styles.btnDisabled]}
                                >
                                    <Text style={styles.btnTextWhite}>{hasGlobalActive ? 'Booking Limit Reached' : 'Book Again'}</Text>
                                </TouchableOpacity>
                            )}

                            {['pending', 'pending_approval', 'approved', 'accepted'].includes(statusLower) && canModifyBooking(item.booking_date) && (
                                <>
                                    {isPending && (
                                        <TouchableOpacity onPress={() => openBookingModal(item)} style={styles.btnBlue}>
                                            <Text style={styles.btnTextWhite}>Reschedule</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity onPress={() => promptCancelBooking(item)} style={styles.btnOutlineRed}>
                                        <Text style={styles.btnTextRed}>Cancel</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                            {!canModifyBooking(item.booking_date) && ['pending', 'pending_approval', 'approved'].includes(statusLower) && (
                                <View style={{padding:8, backgroundColor:'#fef2f2', borderRadius:8}}>
                                    <Text style={{color:'#ef4444', fontSize:10, fontWeight:'bold'}}>Cannot modify (within 12h)</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Viewing Bookings</Text>
                <Text style={styles.headerSub}>Manage your viewing appointments.</Text>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Pending</Text>
                    <Text style={styles.statValue}>{pendingCount}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Approved</Text>
                    <Text style={[styles.statValue, {color:'#16a34a'}]}>{approvedCount}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Rejected</Text>
                    <Text style={[styles.statValue, {color:'#dc2626'}]}>{rejectedCount}</Text>
                </View>
            </View>

            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {['all', 'pending', 'approved', 'rejected'].map(f => (
                    <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filterBtn, filter === f && styles.filterBtnActive]}>
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {loading ? (
                <ActivityIndicator size="large" color="black" style={{ marginTop: 50 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadBookings(session?.user?.id, profile?.role)} />}
                >
                    {bookings.length === 0 ? (
                        <Text style={styles.emptyText}>No bookings found.</Text>
                    ) : (
                        bookings.map(item => <View key={item.id}>{renderBookingCard({ item })}</View>)
                    )}
                </ScrollView>
            )}

            {/* Booking Modal */}
            <Modal visible={showBookingModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Schedule Viewing</Text>
                            <TouchableOpacity onPress={() => setShowBookingModal(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {availableTimeSlots.length === 0 ? (
                                <Text style={styles.noSlots}>No time slots available.</Text>
                            ) : (
                                availableTimeSlots.map(slot => {
                                    const info = getTimeSlotInfo(slot.start_time);
                                    return (
                                        <TouchableOpacity
                                            key={slot.id}
                                            style={[styles.slotItem, selectedTimeSlot === slot.id && styles.slotItemActive]}
                                            onPress={() => setSelectedTimeSlot(slot.id)}
                                        >
                                            <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                                                <Ionicons name={selectedTimeSlot === slot.id ? "radio-button-on" : "radio-button-off"} size={20} color={selectedTimeSlot === slot.id ? "white" : "black"} />
                                                <View>
                                                    <Text style={[styles.slotText, selectedTimeSlot === slot.id && styles.slotTextActive]}>
                                                        {new Date(slot.start_time).toLocaleDateString()}
                                                    </Text>
                                                    <Text style={{fontSize:10, color: selectedTimeSlot === slot.id ? 'white' : '#666'}}>
                                                        {info.emoji} {info.time}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    )
                                })
                            )}
                            <Text style={styles.label}>Notes</Text>
                            <TextInput
                                style={styles.textArea}
                                placeholder="Any questions?"
                                multiline
                                value={bookingNotes}
                                onChangeText={setBookingNotes}
                            />
                        </ScrollView>
                        <TouchableOpacity
                            style={[styles.btnBlack, { marginTop: 20 }, (submittingBooking || !selectedTimeSlot) && styles.btnDisabled]}
                            onPress={submitBooking}
                            disabled={submittingBooking || !selectedTimeSlot}
                        >
                            <Text style={styles.btnTextWhite}>{submittingBooking ? 'Scheduling...' : 'Confirm Booking'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Cancel Confirmation Modal */}
            <Modal visible={showCancelModal} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContentSmall}>
                        <Ionicons name="alert-circle" size={40} color="#dc2626" style={{ alignSelf: 'center', marginBottom: 10 }} />
                        <Text style={styles.modalTitleCenter}>Cancel Viewing?</Text>
                        <Text style={styles.modalTextCenter}>Are you sure? This cannot be undone.</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity onPress={() => setShowCancelModal(false)} style={styles.btnOutline}><Text>Keep it</Text></TouchableOpacity>
                            <TouchableOpacity onPress={confirmCancelBooking} style={styles.btnRed}><Text style={styles.btnTextWhite}>Yes, Cancel</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: { padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#111' },
    headerSub: { fontSize: 14, color: '#666', marginTop: 4 },

    statsGrid: { flexDirection: 'row', gap: 10, padding: 20, paddingBottom: 0 },
    statCard: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, alignItems:'center' },
    statLabel: { fontSize: 10, fontWeight: 'bold', color: '#999', textTransform: 'uppercase' },
    statValue: { fontSize: 20, fontWeight: '900', color: '#111', marginTop: 5 },

    filterScroll: { marginTop: 20, maxHeight: 50 },
    filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e5e7eb' },
    filterBtnActive: { backgroundColor: 'black', borderColor: 'black' },
    filterText: { fontSize: 12, fontWeight: 'bold', color: '#666' },
    filterTextActive: { color: 'white' },

    emptyText: { textAlign: 'center', color: '#999', marginTop: 40 },

    card: { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
    cardSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
    notes: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 8, backgroundColor: '#f9fafb', padding: 8, borderRadius: 8 },

    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    badgeGray: { backgroundColor: '#f3f4f6' }, badgeTextGray: { color: '#666', fontSize: 10, fontWeight: 'bold' },
    badgeBlue: { backgroundColor: '#eff6ff' }, badgeTextBlue: { color: '#1d4ed8', fontSize: 10, fontWeight: 'bold' },
    badgeYellow: { backgroundColor: '#fefce8' }, badgeTextYellow: { color: '#854d0e', fontSize: 10, fontWeight: 'bold' },
    badgeGreen: { backgroundColor: '#f0fdf4' }, badgeTextGreen: { color: '#15803d', fontSize: 10, fontWeight: 'bold' },
    badgeRed: { backgroundColor: '#fef2f2' }, badgeTextRed: { color: '#b91c1c', fontSize: 10, fontWeight: 'bold' },

    // New Action Banner
    actionBanner: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 12, marginTop: 12, borderLeftWidth: 4, borderLeftColor: '#2563eb' },
    actionBannerTitle: { fontSize: 12, fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase' },
    actionBannerText: { fontSize: 14, fontWeight: 'bold', color: '#1e3a8a', marginTop: 2 },

    dateContainer: { marginTop: 12, padding: 12, backgroundColor: '#f9fafb', borderRadius: 12 },
    dateLabel: { fontSize: 10, fontWeight: 'bold', color: '#9ca3af' },
    dateValue: { fontSize: 14, fontWeight: 'bold', color: '#111', marginTop: 2 },
    timeValue: { fontSize: 12, color:'#666' },

    actionContainer: { marginTop: 16, flexDirection: 'row', gap: 10 },

    btnBlack: { backgroundColor: 'black', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
    btnBlue: { backgroundColor: '#2563eb', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
    btnRed: { backgroundColor: '#dc2626', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
    btnApprove: { backgroundColor: '#16a34a', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
    btnReject: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
    btnOutline: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
    btnOutlineRed: { backgroundColor: 'white', borderWidth: 1, borderColor: '#fecaca', padding: 12, borderRadius: 12, alignItems: 'center', flex: 1 },

    btnTextWhite: { color: 'white', fontWeight: 'bold', fontSize: 12 },
    btnTextGray: { color: '#374151', fontWeight: 'bold', fontSize: 12 },
    btnTextRed: { color: '#dc2626', fontWeight: 'bold', fontSize: 12 },
    btnDisabled: { opacity: 0.5 },
    warningText: { fontSize: 10, color: '#ef4444', fontStyle: 'italic', alignSelf: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 24, padding: 24 },
    modalContentSmall: { backgroundColor: 'white', borderRadius: 24, padding: 24, alignItems: 'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    modalTitleCenter: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
    modalTextCenter: { textAlign: 'center', color: '#666', marginTop: 8 },

    slotItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, marginBottom: 8, gap: 10 },
    slotItemActive: { backgroundColor: 'black', borderColor: 'black' },
    slotText: { fontWeight: 'bold', color: '#111' },
    slotTextActive: { color: 'white' },
    noSlots: { textAlign: 'center', color: '#999', marginVertical: 20 },
    label: { fontSize: 12, fontWeight: 'bold', marginTop: 16, marginBottom: 8, color: '#666' },
    textArea: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, height: 80, textAlignVertical: 'top', backgroundColor: '#f9fafb' }
});