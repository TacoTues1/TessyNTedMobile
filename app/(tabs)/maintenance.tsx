import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image, Modal,
  ScrollView,
  StyleSheet,
  Text, TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function MaintenanceScreen() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [occupiedProperty, setOccupiedProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Search & Filter
  const [searchId, setSearchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Active Selections
  const [requestToSchedule, setRequestToSchedule] = useState<any>(null);
  const [requestToComplete, setRequestToComplete] = useState<any>(null);
  const [requestForFeedback, setRequestForFeedback] = useState<any>(null);

  // Inputs
  const [scheduleDate, setScheduleDate] = useState('');
  const [repairmanName, setRepairmanName] = useState('');
  const [maintenanceCost, setMaintenanceCost] = useState('');
  const [deductFromDeposit, setDeductFromDeposit] = useState(true);
  const [feedbackText, setFeedbackText] = useState('');

  // Create Request Form
  const [formData, setFormData] = useState({
    property_id: '',
    title: '',
    description: '',
    priority: 'normal'
  });
  const [proofFiles, setProofFiles] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploading, setUploading] = useState(false);

  const statusColors: any = {
    pending: '#FEF3C7', // yellow-100
    scheduled: '#DBEAFE', // blue-100
    in_progress: '#FFEDD5', // orange-100
    completed: '#DCFCE7', // green-100
    closed: '#F3F4F6', // gray-100
    cancelled: '#FEE2E2' // red-100
  };

  const statusTextColors: any = {
    pending: '#92400E',
    scheduled: '#1E40AF',
    in_progress: '#9A3412',
    completed: '#166534',
    closed: '#1F2937',
    cancelled: '#991B1B'
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        loadProfile(session.user.id);
      } else {
        router.replace('/');
      }
    });
  }, []);

  useEffect(() => {
    if (session && profile) {
      loadRequests();
      loadProperties();
    }
  }, [session, profile]);

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
  }

  async function loadRequests() {
    let query = supabase
      .from('maintenance_requests')
      .select('*, properties(title, landlord), tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (profile?.role === 'tenant') {
      query = query.eq('tenant', session.user.id);
    } else if (profile?.role === 'landlord') {
      const { data: myProps } = await supabase.from('properties').select('id').eq('landlord', session.user.id);
      if (myProps && myProps.length > 0) {
        const propIds = myProps.map(p => p.id);
        query = query.in('property_id', propIds);
      } else {
        setRequests([]);
        setLoading(false);
        return;
      }
    }

    const { data, error } = await query;
    if (!error) setRequests(data || []);
    setLoading(false);
  }

  async function loadProperties() {
    if (profile?.role === 'tenant') {
      const { data: occupancy } = await supabase
        .from('tenant_occupancies')
        .select('property_id, property:properties(id, title)')
        .eq('tenant_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (occupancy && occupancy.property) {
        const prop = Array.isArray(occupancy.property) ? occupancy.property[0] : occupancy.property;
        if (prop) {
          setOccupiedProperty(prop);
          setProperties([prop]);
          setFormData(prev => ({ ...prev, property_id: prop.id }));
        }
      }
    } else if (profile?.role === 'landlord') {

      const { data } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id);
      setProperties(data || []);
    }
  }

  // --- ACTIONS ---

  async function updateStatus(requestId: string, newStatus: string) {
    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: newStatus,
        resolved_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', requestId);

    if (!error) {
      Alert.alert('Success', `Status updated to ${newStatus}`);
      loadRequests();
      // Add notification logic here if needed
    } else {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  async function confirmStartWork() {
    if (!requestToSchedule || !scheduleDate) {
      Alert.alert('Error', 'Please enter a start date/time');
      return;
    }

    // Basic date validation or parsing can be added here
    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'in_progress',
        scheduled_date: new Date().toISOString(), // Using current time as placeholder or parse scheduleDate
        repairman_name: repairmanName.trim() || null
      })
      .eq('id', requestToSchedule.id);

    if (!error) {
      Alert.alert('Success', 'Work started!');
      setShowScheduleModal(false);
      setRequestToSchedule(null);
      loadRequests();
    }
  }

  async function completeWithCost() {
    if (!requestToComplete) return;
    const cost = parseFloat(maintenanceCost) || 0;

    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'completed',
        resolved_at: new Date().toISOString(),
        maintenance_cost: cost,
        cost_deducted_from_deposit: deductFromDeposit && cost > 0
      })
      .eq('id', requestToComplete.id);

    if (error) {
      Alert.alert('Error', 'Failed to complete');
      return;
    }

    if (deductFromDeposit && cost > 0 && requestToComplete.tenant) {
      const { data: occupancy } = await supabase
        .from('tenant_occupancies')
        .select('id, security_deposit_used')
        .eq('tenant_id', requestToComplete.tenant)
        .eq('status', 'active')
        .maybeSingle();

      if (occupancy) {
        const newUsed = (occupancy.security_deposit_used || 0) + cost;
        await supabase.from('tenant_occupancies').update({ security_deposit_used: newUsed }).eq('id', occupancy.id);
      }
    }

    Alert.alert('Success', 'Maintenance completed');
    setShowCostModal(false);
    setRequestToComplete(null);
    loadRequests();
  }

  // --- FILE UPLOAD ---

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      if (proofFiles.length + result.assets.length > 10) {
        Alert.alert('Limit Reached', 'Max 10 files allowed');
        return;
      }
      setProofFiles([...proofFiles, ...result.assets]);
    }
  };

  const uploadProofFiles = async () => {
    const uploadPromises = proofFiles.map(async (asset) => {
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('maintenance-uploads')
        .upload(filePath, decode(asset.base64!), { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('maintenance-uploads').getPublicUrl(filePath);
      return data.publicUrl;
    });

    return Promise.all(uploadPromises);
  };

  const handleSubmitRequest = async () => {
    if (proofFiles.length === 0) {
      Alert.alert('Required', 'Please attach at least one photo.');
      return;
    }
    if (!formData.title || !formData.description) {
      Alert.alert('Required', 'Please fill in title and description.');
      return;
    }

    setUploading(true);
    try {
      const attachmentUrls = await uploadProofFiles();

      const { error } = await supabase.from('maintenance_requests').insert({
        ...formData,
        tenant: session.user.id,
        status: 'pending',
        attachment_urls: attachmentUrls
      });

      if (error) throw error;

      Alert.alert('Success', 'Request submitted!');
      setShowCreateModal(false);
      setFormData({ property_id: occupiedProperty?.id || '', title: '', description: '', priority: 'normal' });
      setProofFiles([]);
      loadRequests();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  // --- RENDER HELPERS ---

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.idBadge}>{item.id.substring(0, 8).toUpperCase()}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] || '#f3f4f6' }]}>
            <Text style={[styles.statusText, { color: statusTextColors[item.status] || '#1f2937' }]}>
              {item.status.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.dateText}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSubtitle}>
          {item.properties?.title} • {item.priority.toUpperCase()} Priority
        </Text>

        <Text style={styles.description}>{item.description}</Text>

        {/* Images Preview */}
        {item.attachment_urls && item.attachment_urls.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
            {item.attachment_urls.map((url: string, idx: number) => (
              <Image key={idx} source={{ uri: url }} style={styles.proofImage} />
            ))}
          </ScrollView>
        )}

        {/* Tenant Actions */}
        {profile?.role === 'tenant' && !['completed', 'closed', 'cancelled'].includes(item.status) && (
          <TouchableOpacity onPress={() => updateStatus(item.id, 'cancelled')} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>Cancel Request</Text>
          </TouchableOpacity>
        )}

        {/* Landlord Actions */}
        {profile?.role === 'landlord' && item.status !== 'closed' && (
          <View style={styles.actionRow}>
            {item.status === 'pending' && (
              <TouchableOpacity onPress={() => updateStatus(item.id, 'scheduled')} style={[styles.actionBtn, { backgroundColor: '#DBEAFE' }]}>
                <Text style={[styles.actionBtnText, { color: '#1E40AF' }]}>Mark Scheduled</Text>
              </TouchableOpacity>
            )}
            {item.status === 'scheduled' && (
              <TouchableOpacity onPress={() => { setRequestToSchedule(item); setShowScheduleModal(true); }} style={[styles.actionBtn, { backgroundColor: '#FFEDD5' }]}>
                <Text style={[styles.actionBtnText, { color: '#9A3412' }]}>Start Work</Text>
              </TouchableOpacity>
            )}
            {item.status === 'in_progress' && (
              <TouchableOpacity onPress={() => { setRequestToComplete(item); setShowCostModal(true); }} style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.actionBtnText, { color: '#166534' }]}>Complete</Text>
              </TouchableOpacity>
            )}
            {(item.status === 'completed' || item.status === 'resolved') && (
              <TouchableOpacity onPress={() => updateStatus(item.id, 'closed')} style={[styles.actionBtn, { backgroundColor: '#F3F4F6' }]}>
                <Text style={[styles.actionBtnText, { color: '#374151' }]}>Archive</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    const matchesSearch = searchId === '' || req.id.toLowerCase().includes(searchId.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{profile?.role === 'landlord' ? 'Maintenance Board' : 'My Requests'}</Text>
          <Text style={styles.headerSubtitle}>Track repairs and issues</Text>
        </View>
        {profile?.role === 'tenant' && (
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.createBtn}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            placeholder="Search ID..."
            value={searchId}
            onChangeText={setSearchId}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {['all', 'pending', 'scheduled', 'in_progress', 'completed'].map(status => (
            <TouchableOpacity
              key={status}
              onPress={() => setStatusFilter(status)}
              style={[
                styles.filterChip,
                statusFilter === status && styles.filterChipActive
              ]}
            >
              <Text style={[
                styles.filterChipText,
                statusFilter === status && styles.filterChipTextActive
              ]}>{status.replace('_', ' ').toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color="black" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredRequests}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No requests found.</Text>}
        />
      )}

      {/* --- CREATE MODAL --- */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Request</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={{ color: 'red', fontWeight: 'bold' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.label}>PROPERTY</Text>
            <View style={styles.inputDisabled}>
              <Text>{occupiedProperty?.title || properties[0]?.title || 'No Property'}</Text>
            </View>

            <Text style={styles.label}>TITLE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Leaking Faucet"
              value={formData.title}
              onChangeText={t => setFormData({ ...formData, title: t })}
            />

            <Text style={styles.label}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              {['low', 'normal', 'high'].map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setFormData({ ...formData, priority: p })}
                  style={[styles.priorityChip, formData.priority === p && styles.priorityChipActive]}
                >
                  <Text style={formData.priority === p ? { color: 'white' } : { color: 'black' }}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, { height: 100 }]}
              multiline
              placeholder="Describe the issue..."
              textAlignVertical="top"
              value={formData.description}
              onChangeText={t => setFormData({ ...formData, description: t })}
            />

            <Text style={styles.label}>PHOTOS ({proofFiles.length}/10)</Text>
            <ScrollView horizontal style={{ marginBottom: 20 }}>
              <TouchableOpacity onPress={pickImages} style={styles.addPhotoBtn}>
                <Ionicons name="camera" size={24} color="#666" />
              </TouchableOpacity>
              {proofFiles.map((asset, i) => (
                <Image key={i} source={{ uri: asset.uri }} style={styles.previewImage} />
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={handleSubmitRequest}
              disabled={uploading}
              style={[styles.primaryBtn, uploading && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryBtnText}>{uploading ? 'Submitting...' : 'Submit Request'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* --- SCHEDULE MODAL --- */}
      <Modal visible={showScheduleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start Work</Text>

            <Text style={styles.label}>START DATE/TIME (Text)</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD HH:MM"
              value={scheduleDate}
              onChangeText={setScheduleDate}
            />

            <Text style={styles.label}>REPAIRMAN NAME (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Juan Dela Cruz"
              value={repairmanName}
              onChangeText={setRepairmanName}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)} style={styles.secondaryBtn}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmStartWork} style={styles.primaryBtnSmall}>
                <Text style={styles.primaryBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- COST MODAL --- */}
      <Modal visible={showCostModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Complete Request</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 15 }}>Enter cost if applicable.</Text>

            <Text style={styles.label}>COST (PHP)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0.00"
              value={maintenanceCost}
              onChangeText={setMaintenanceCost}
            />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDeductFromDeposit(!deductFromDeposit)}
            >
              <Ionicons name={deductFromDeposit ? "checkbox" : "square-outline"} size={20} color="black" />
              <Text style={{ fontSize: 12 }}>Deduct from Security Deposit</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCostModal(false)} style={styles.secondaryBtn}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={completeWithCost} style={[styles.primaryBtnSmall, { backgroundColor: 'green' }]}>
                <Text style={styles.primaryBtnText}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { padding: 20, paddingTop: 60, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900', textTransform: 'uppercase' },
  headerSubtitle: { fontSize: 12, color: '#6b7280' },
  createBtn: { backgroundColor: 'black', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  filterContainer: { padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 10, borderRadius: 8, marginBottom: 10, height: 40 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#f3f4f6', marginRight: 5 },
  filterChipActive: { backgroundColor: 'black' },
  filterChipText: { fontSize: 10, fontWeight: 'bold', color: '#6b7280' },
  filterChipTextActive: { color: 'white' },

  card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#eee', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  idBadge: { fontFamily: 'monospace', fontSize: 10, backgroundColor: '#e5e7eb', padding: 2, borderRadius: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  dateText: { fontSize: 10, color: '#9ca3af' },

  cardBody: { padding: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  cardSubtitle: { fontSize: 11, color: '#6b7280', marginBottom: 10, fontWeight: '600' },
  description: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 10 },

  imageScroll: { flexDirection: 'row', marginBottom: 10 },
  proofImage: { width: 60, height: 60, borderRadius: 6, marginRight: 8, backgroundColor: '#eee' },

  cancelLink: { alignSelf: 'flex-end', padding: 5 },
  cancelLinkText: { color: 'red', fontSize: 11, fontWeight: 'bold' },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  actionBtnText: { fontSize: 11, fontWeight: 'bold' },

  emptyText: { textAlign: 'center', marginTop: 50, color: '#9ca3af' },

  // Modals
  modalContainer: { flex: 1, backgroundColor: 'white', paddingTop: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalBody: { padding: 20 },

  label: { fontSize: 10, fontWeight: 'bold', color: '#6b7280', marginBottom: 5, marginTop: 15 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#fff' },
  inputDisabled: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, backgroundColor: '#f9fafb' },

  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' },
  priorityChipActive: { backgroundColor: 'black', borderColor: 'black' },

  addPhotoBtn: { width: 80, height: 80, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  previewImage: { width: 80, height: 80, borderRadius: 8, marginRight: 10 },

  primaryBtn: { backgroundColor: 'black', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20, marginBottom: 50 },
  primaryBtnText: { color: 'white', fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  secondaryBtn: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' },
  primaryBtnSmall: { flex: 1, padding: 12, backgroundColor: 'black', borderRadius: 8, alignItems: 'center' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
});