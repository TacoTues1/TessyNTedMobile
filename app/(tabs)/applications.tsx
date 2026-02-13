import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

export default function ApplicationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [expandedApps, setExpandedApps] = useState<{ [key: string]: boolean }>({});

  // Landlord Specific
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [showBookingsListModal, setShowBookingsListModal] = useState(false);

  // Tenant Booking Logic
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<any[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Delete Logic
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [appToDelete, setAppToDelete] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (session && profile) {
      loadData();
    }
  }, [session, profile, filter]);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSession(session);
      loadProfile(session.user.id);
    } else {
      router.replace('/');
    }
  };

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadApplications(), profile?.role === 'landlord' ? loadPendingBookings() : null]);
    setLoading(false);
    setRefreshing(false);
  };

  const loadApplications = async () => {
    try {
      console.log('Loading applications for:', profile?.role); // Debug Log

      if (profile?.role === 'landlord') {
        // 1. Get Landlord's Properties first
        const { data: myProperties, error: propError } = await supabase
          .from('properties')
          .select('id')
          .eq('landlord', session.user.id);

        if (propError) console.log('Property Error:', propError);

        if (myProperties && myProperties.length > 0) {
          const propIds = myProperties.map(p => p.id);

          // 2. Fetch Applications for those properties
          // NOTE: Removed 'tenant_profile' alias to avoid join errors. Access via 'profiles' now.
          let query = supabase
            .from('applications')
            .select(`
              *, 
              property:properties(title, address, city, price), 
              profiles(first_name, last_name, phone) 
            `)
            .in('property_id', propIds)
            .order('submitted_at', { ascending: false });

          if (filter !== 'all') query = query.eq('status', filter);

          const { data, error } = await query;

          if (error) {
            console.log('Application Fetch Error:', error); // Check terminal for this!
            Alert.alert('Error', 'Failed to load applications');
          } else {
            setApplications(data || []);
          }
        } else {
          setApplications([]);
        }
      } else {
        // Tenant Logic
        let query = supabase
          .from('applications')
          .select('*, property:properties(title, address, city, price, landlord)')
          .eq('tenant', session.user.id)
          .order('submitted_at', { ascending: false });

        if (filter !== 'all') query = query.eq('status', filter);
        const { data, error } = await query;

        if (error) console.log('Tenant App Error:', error);

        if (data) {
          const appsWithBookings = await Promise.all(data.map(async (app) => {
            const { data: bookings } = await supabase.from('bookings').select('*').eq('application_id', app.id).limit(1);
            return { ...app, hasBooking: bookings && bookings.length > 0, latestBooking: bookings?.[0] };
          }));
          setApplications(appsWithBookings);
        }
      }
    } catch (err) {
      console.log('Unexpected Error:', err);
    }
  };

  const loadPendingBookings = async () => {
    if (profile.role !== 'landlord') return;
    const { data: myProperties } = await supabase.from('properties').select('id').eq('landlord', session.user.id);
    if (!myProperties?.length) return;

    const propIds = myProperties.map(p => p.id);
    const { data } = await supabase
      .from('bookings')
      .select('*, property:properties(title, address), profiles(first_name, last_name)')
      .in('property_id', propIds)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    setPendingBookings(data || []);
  };

  const toggleExpand = (id: string) => {
    setExpandedApps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // --- ACTIONS ---
  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', id);
    if (!error) {
      Alert.alert('Success', `Application ${newStatus}`);
      loadApplications();
    }
  };

  const deleteApplication = async () => {
    if (!appToDelete) return;
    const { error } = await supabase.from('applications').delete().eq('id', appToDelete);
    if (!error) {
      Alert.alert('Deleted', 'Application removed.');
      loadApplications();
    } else {
      Alert.alert('Error', error.message);
    }
    setShowDeleteModal(false);
    setAppToDelete(null);
  };

  // --- BOOKING LOGIC ---
  const openBookingModal = async (app: any) => {
    setSelectedApplication(app);
    setShowBookingModal(true);
    setAvailableTimeSlots([]);

    // Fetch Slots
    const landlordId = app.property?.landlord;
    if (landlordId) {
      const { data } = await supabase
        .from('available_time_slots')
        .select('*')
        .eq('landlord_id', landlordId)
        .eq('is_booked', false)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });
      setAvailableTimeSlots(data || []);
    }
  };

  const submitBooking = async () => {
    setSubmittingBooking(true);
    const slot = availableTimeSlots.find(s => s.id === selectedTimeSlot);
    if (!slot) {
      Alert.alert('Error', 'Please select a time slot.');
      setSubmittingBooking(false);
      return;
    }

    const bookingDateTime = new Date(slot.start_time);

    // 1. Insert Booking and SELECT the result so we have the ID
    const { data: bookingData, error } = await supabase.from('bookings').insert({
      property_id: selectedApplication.property_id,
      tenant: session.user.id,
      landlord: selectedApplication.property.landlord,
      application_id: selectedApplication.id,
      start_time: bookingDateTime.toISOString(),
      booking_date: bookingDateTime.toISOString(),
      notes: bookingNotes,
      status: 'pending_approval',
      time_slot_id: slot.id
    }).select().single();

    if (!error) {
      // 2. Mark slot as booked
      await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', slot.id);

      // 3. SEND NOTIFICATION (Fix)
      // 3. SEND NOTIFICATION (Fix - RLS prevents tenant from creating notifications)
      // await createNotification(
      //   selectedApplication.property.landlord,
      //   'booking_request',
      //   `New viewing request for ${selectedApplication.property.title}`,
      //   { actor: session.user.id, link: '/bookings' }
      // );

      Alert.alert('Success', 'Viewing request sent!');
      setShowBookingModal(false);
      loadApplications();
    } else {
      Alert.alert('Error', 'Failed to book.');
    }
    setSubmittingBooking(false);
  };

  const handleBookingResponse = async (bookingId: string, status: 'approved' | 'rejected', timeSlotId?: string) => {
    // 1. Update status
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .select('*, property:properties(title)') // Fetch title for the message
      .single();

    if (!error && booking) {
      if (status === 'rejected' && timeSlotId) {
        await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', timeSlotId);
      }

      // 2. SEND NOTIFICATION (Fix)
      const msg = status === 'approved'
        ? `Your viewing for ${booking.property?.title} is approved!`
        : `Your viewing for ${booking.property?.title} was rejected.`;

      await createNotification(
        booking.tenant,
        status === 'approved' ? 'booking_approved' : 'booking_rejected',
        msg,
        { actor: session.user.id, link: '/bookings' }
      );

      loadPendingBookings();
      Alert.alert('Success', `Booking ${status}`);
    }
  };

  // --- RENDERING ---
  const renderCard = ({ item }: { item: any }) => {
    const isExpanded = expandedApps[item.id];

    // Handle the Profile Data safely (it might be in 'profiles' or 'tenant_profile')
    // We try 'profiles' first since we updated the query
    const tenantData = item.profiles || item.tenant_profile;

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.propTitle}>{item.property?.title || 'Unknown Property'}</Text>
            <Text style={styles.propCity}>{item.property?.city}</Text>
            <Text style={styles.propPrice}>₱{Number(item.property?.price).toLocaleString()}</Text>
          </View>
          <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
            <Text style={styles.statusText}>{item.status?.toUpperCase()}</Text>
          </View>
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailLabel}>Full Address:</Text>
            <Text style={styles.detailText}>{item.property?.address}</Text>

            {/* APPLICANT INFO (Landlord Only) */}
            {profile?.role === 'landlord' && (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Applicant Info:</Text>
                {tenantData ? (
                  <>
                    <Text style={styles.blackText}>Name: {tenantData.first_name} {tenantData.last_name}</Text>
                    <Text style={styles.blackText}>Phone: {tenantData.phone || 'N/A'}</Text>
                    {/* Removed Email Line */}
                  </>
                ) : (
                  <Text style={{ color: 'red' }}>Tenant profile not found</Text>
                )}
              </View>
            )}

            {/* MESSAGE SECTION - Fixed Color */}
            {item.message && (
              <View style={[styles.infoBox, { backgroundColor: '#eef2ff' }]}>
                <Text style={styles.infoTitle}>Message from Tenant:</Text>
                <Text style={styles.messageText}>{item.message}</Text>
              </View>
            )}

            {/* Tenant Booking Info */}
            {profile?.role === 'tenant' && item.hasBooking && (
              <View style={[styles.infoBox, { backgroundColor: '#f0fdf4' }]}>
                <Text style={styles.infoTitle}>Viewing Details:</Text>
                <Text style={styles.blackText}>{new Date(item.latestBooking.booking_date).toLocaleString()}</Text>
                <Text style={{ fontWeight: 'bold', color: item.latestBooking.status === 'approved' ? 'green' : 'orange' }}>
                  Status: {item.latestBooking.status}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => toggleExpand(item.id)} style={styles.outlineBtn}>
            <Text style={styles.btnText}>{isExpanded ? 'Hide Details' : 'View Details'}</Text>
          </TouchableOpacity>

          {profile?.role === 'landlord' && item.status === 'pending' && (
            <>
              <TouchableOpacity onPress={() => updateStatus(item.id, 'accepted')} style={[styles.fillBtn, { backgroundColor: 'green' }]}>
                <Text style={styles.whiteText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => updateStatus(item.id, 'rejected')} style={[styles.fillBtn, { backgroundColor: 'red' }]}>
                <Text style={styles.whiteText}>Reject</Text>
              </TouchableOpacity>
            </>
          )}

          {profile?.role === 'tenant' && item.status === 'accepted' && !item.hasBooking && (
            <TouchableOpacity onPress={() => openBookingModal(item)} style={styles.fillBtn}>
              <Ionicons name="calendar" color="white" size={14} />
              <Text style={styles.whiteText}> Schedule</Text>
            </TouchableOpacity>
          )}

          {item.status !== 'accepted' && (
            <TouchableOpacity onPress={() => { setAppToDelete(item.id); setShowDeleteModal(true); }} style={{ marginLeft: 'auto', padding: 5 }}>
              <Ionicons name="trash-outline" size={20} color="red" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'accepted': return { backgroundColor: '#dcfce7', borderColor: '#166534' };
      case 'rejected': return { backgroundColor: '#fee2e2', borderColor: '#991b1b' };
      default: return { backgroundColor: '#fef9c3', borderColor: '#854d0e' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{profile?.role === 'landlord' ? 'Tenant Applications' : 'My Applications'}</Text>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {['all', 'pending', 'accepted', 'rejected'].map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f as any)}
            style={[styles.filterBtn, filter === f && styles.activeFilter]}
          >
            <Text style={[styles.filterText, filter === f && styles.activeFilterText]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Landlord Pending Banner */}
      {profile?.role === 'landlord' && pendingBookings.length > 0 && (
        <TouchableOpacity onPress={() => setShowBookingsListModal(true)} style={styles.banner}>
          <Ionicons name="alert-circle" size={24} color="#854d0e" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: 'bold', color: '#854d0e' }}>{pendingBookings.length} Pending Viewings</Text>
            <Text style={{ fontSize: 12, color: '#854d0e' }}>Tap to review requests</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#854d0e" />
        </TouchableOpacity>
      )}

      {loading ? <ActivityIndicator style={{ marginTop: 50 }} /> : (
        <FlatList
          data={applications}
          renderItem={renderCard}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
          contentContainerStyle={{ padding: 15 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50 }}>
              <Text style={styles.emptyText}>No applications found.</Text>
              <TouchableOpacity onPress={loadData} style={{ marginTop: 10 }}><Text style={{ color: 'blue' }}>Tap to Retry</Text></TouchableOpacity>
            </View>
          }
        />
      )}

      {/* --- MODALS --- */}
      <Modal visible={showBookingModal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Schedule Viewing</Text>
            <Text style={styles.subTitle}>{selectedApplication?.property?.title}</Text>

            <Text style={styles.label}>Select Time Slot:</Text>
            {availableTimeSlots.length === 0 ? (
              <Text style={styles.noSlots}>No slots available. Contact Landlord.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 200 }}>
                {availableTimeSlots.map(slot => (
                  <TouchableOpacity
                    key={slot.id}
                    onPress={() => setSelectedTimeSlot(slot.id)}
                    style={[styles.slotItem, selectedTimeSlot === slot.id && styles.activeSlot]}
                  >
                    <Text style={[selectedTimeSlot === slot.id ? { color: 'white' } : { color: 'black' }]}>
                      {new Date(slot.start_time).toLocaleDateString()} • {new Date(slot.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={styles.label}>Notes:</Text>
            <TextInput style={styles.input} placeholder="Any questions?" value={bookingNotes} onChangeText={setBookingNotes} multiline />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setShowBookingModal(false)} style={styles.cancelBtn}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={submitBooking} disabled={submittingBooking || availableTimeSlots.length === 0} style={[styles.confirmBtn, (submittingBooking || availableTimeSlots.length === 0) && { opacity: 0.5 }]}>
                <Text style={styles.whiteText}>{submittingBooking ? 'Sending...' : 'Request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Application?</Text>
            <Text style={{ marginBottom: 20 }}>This cannot be undone.</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)} style={styles.cancelBtn}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={deleteApplication} style={[styles.confirmBtn, { backgroundColor: 'red' }]}><Text style={styles.whiteText}>Delete</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showBookingsListModal} animationType="slide">
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowBookingsListModal(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
            <Text style={styles.title}>Pending Requests</Text>
            <View style={{ width: 24 }} />
          </View>
          <FlatList
            data={pendingBookings}
            contentContainerStyle={{ padding: 20 }}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.propTitle}>{item.property?.title}</Text>
                <Text>Tenant: {item.profiles?.first_name} {item.profiles?.last_name}</Text>
                <Text style={{ marginVertical: 5, fontWeight: 'bold' }}>Date: {new Date(item.booking_date).toLocaleString()}</Text>
                {item.notes && <Text style={{ fontStyle: 'italic', marginBottom: 10 }}>"{item.notes}"</Text>}
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => handleBookingResponse(item.id, 'approved', item.time_slot_id)} style={[styles.fillBtn, { backgroundColor: 'green', flex: 1 }]}><Text style={styles.whiteText}>Approve</Text></TouchableOpacity>
                  <View style={{ width: 10 }} />
                  <TouchableOpacity onPress={() => handleBookingResponse(item.id, 'rejected', item.time_slot_id)} style={[styles.fillBtn, { backgroundColor: 'red', flex: 1 }]}><Text style={styles.whiteText}>Reject</Text></TouchableOpacity>
                </View>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', backgroundColor: 'white' },
  title: { fontSize: 22, fontWeight: 'bold' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 10 },
  filterBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginRight: 8, backgroundColor: '#eee' },
  activeFilter: { backgroundColor: 'black' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#333' },
  activeFilterText: { color: 'white' },
  banner: { flexDirection: 'row', backgroundColor: '#fef9c3', margin: 15, padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ca8a04' },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 16 },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  propTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  propCity: { fontSize: 12, color: '#666' },
  propPrice: { fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  detailsContainer: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee' },
  detailLabel: { fontSize: 12, color: '#666', fontWeight: 'bold' },
  detailText: { fontSize: 14, marginBottom: 10 },
  infoBox: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginTop: 8 },
  infoTitle: { fontWeight: 'bold', fontSize: 12, marginBottom: 4, color: '#333' },
  blackText: { color: 'black', fontSize: 14, marginBottom: 2 },
  messageText: { color: 'black', fontSize: 14, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', marginTop: 15, alignItems: 'center', gap: 10 },
  outlineBtn: { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  fillBtn: { backgroundColor: 'black', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  btnText: { fontSize: 12, fontWeight: '600' },
  whiteText: { color: 'white', fontSize: 12, fontWeight: '600' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  subTitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontWeight: 'bold', marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, height: 80, textAlignVertical: 'top' },
  slotItem: { padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8 },
  activeSlot: { backgroundColor: 'black', borderColor: 'black' },
  noSlots: { fontStyle: 'italic', color: '#999', marginVertical: 10 },
  modalBtnRow: { flexDirection: 'row', marginTop: 20, gap: 10 },
  cancelBtn: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, alignItems: 'center' },
  confirmBtn: { flex: 1, padding: 12, backgroundColor: 'black', borderRadius: 8, alignItems: 'center' },
});