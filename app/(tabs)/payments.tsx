import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, 
  Alert, Modal, TextInput, Image, RefreshControl, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { createNotification } from '../../lib/notifications';

const { width } = Dimensions.get('window');

export default function Payments() {
  const router = useRouter();
  
  // -- State --
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending'); // 'pending', 'verify', 'paid', 'all'
  
  // Data State
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]); // Approved tenants for dropdown
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Pay Modal (Tenant)
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [proofImage, setProofImage] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash', 'bank_transfer', 'gcash'
  const [uploading, setUploading] = useState(false);

  // Verify Modal (Landlord)
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [billToVerify, setBillToVerify] = useState<any>(null);

  // Edit Modal (Landlord)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  // Form State (Create)
  const [formData, setFormData] = useState({
    property_id: '',
    tenant_id: '',
    rent_amount: '',
    water_bill: '',
    electrical_bill: '',
    wifi_bill: '',
    other_bills: '',
    due_date: new Date().toISOString().split('T')[0],
    description: 'Monthly Rent'
  });

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSession(session);
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(data);
      loadData(session.user.id, data?.role);
    }
  };

  const loadData = async (userId: string, role: string) => {
    setLoading(true);
    try {
      // 1. Load Bills
      let query = supabase
        .from('payment_requests')
        .select(`*, property:properties(title, address), tenant_profile:profiles!payment_requests_tenant_fkey(first_name, last_name)`)
        .order('due_date', { ascending: true });

      if (role === 'landlord') {
        query = query.eq('landlord', userId);
        
        // Load Properties & Approved Tenants for "Create Bill"
        const { data: props } = await supabase.from('properties').select('id, title').eq('landlord', userId);
        setProperties(props || []);

        // Load active occupancies to get tenants
        const { data: occs } = await supabase.from('tenant_occupancies')
            .select('tenant_id, property_id, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name)')
            .eq('landlord_id', userId)
            .eq('status', 'active');
        
        // Map unique tenants
        const uniqueTenants = occs?.map((o: any) => ({
            id: o.tenant_id,
            name: `${o.tenant.first_name} ${o.tenant.last_name}`,
            property_id: o.property_id
        })) || [];
        setTenants(uniqueTenants);

      } else {
        query = query.eq('tenant', userId);
      }

      const { data: bills } = await query;
      setPaymentRequests(bills || []);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // --- ACTIONS: LANDLORD ---

  const handleCreateBill = async () => {
    if (!formData.property_id || !formData.tenant_id || !formData.rent_amount) return Alert.alert('Error', 'Missing required fields');
    
    // Find occupancy for this tenant/property combo
    const { data: occupancy } = await supabase.from('tenant_occupancies')
        .select('id')
        .eq('property_id', formData.property_id)
        .eq('tenant_id', formData.tenant_id)
        .eq('status', 'active')
        .single();

    if (!occupancy) return Alert.alert('Error', 'No active occupancy found for this tenant.');

    const { error } = await supabase.from('payment_requests').insert({
        landlord: session.user.id,
        tenant: formData.tenant_id,
        property_id: formData.property_id,
        occupancy_id: occupancy.id,
        rent_amount: parseFloat(formData.rent_amount || '0'),
        water_bill: parseFloat(formData.water_bill || '0'),
        electrical_bill: parseFloat(formData.electrical_bill || '0'),
        wifi_bill: parseFloat(formData.wifi_bill || '0'),
        other_bills: parseFloat(formData.other_bills || '0'),
        bills_description: formData.description,
        due_date: formData.due_date,
        status: 'pending'
    });

    if (error) Alert.alert('Error', error.message);
    else {
        await createNotification(formData.tenant_id, 'payment_request', `New bill received: ₱${formData.rent_amount}`, { actor: session.user.id });
        Alert.alert('Success', 'Bill created');
        setShowCreateModal(false);
        setFormData({ ...formData, rent_amount: '', water_bill: '', electrical_bill: '' }); // Reset
        loadData(session.user.id, profile.role);
    }
  };

  const handleEditBill = async () => {
     if(!editFormData.id) return;
     const { error } = await supabase.from('payment_requests').update({
         rent_amount: parseFloat(editFormData.rent_amount || '0'),
         water_bill: parseFloat(editFormData.water_bill || '0'),
         electrical_bill: parseFloat(editFormData.electrical_bill || '0'),
         wifi_bill: parseFloat(editFormData.wifi_bill || '0'),
         other_bills: parseFloat(editFormData.other_bills || '0'),
         due_date: editFormData.due_date,
         bills_description: editFormData.bills_description
     }).eq('id', editFormData.id);

     if(error) Alert.alert('Error', error.message);
     else {
         Alert.alert('Success', 'Bill updated');
         setShowEditModal(false);
         loadData(session.user.id, profile.role);
     }
  };

  const handleCancelBill = async (id: string) => {
      Alert.alert('Confirm', 'Are you sure you want to cancel this bill?', [
          { text: 'No' },
          { text: 'Yes', style: 'destructive', onPress: async () => {
              await supabase.from('payment_requests').update({ status: 'cancelled' }).eq('id', id);
              loadData(session.user.id, profile.role);
          }}
      ]);
  };

  // --- PORTED: Verify Payment Logic (Landlord) ---
  const handleApprovePayment = async () => {
    if (!billToVerify) return;
    setUploading(true);
    
    try {
        // 1. Get Tenant Balance
        const { data: balanceData } = await supabase
            .from('tenant_balances')
            .select('*')
            .eq('tenant_id', billToVerify.tenant)
            .eq('occupancy_id', billToVerify.occupancy_id)
            .maybeSingle();

        const currentBalance = balanceData ? parseFloat(balanceData.amount) : 0;
        
        // 2. Calculate Totals
        const totalBill = (billToVerify.rent_amount || 0) + 
                          (billToVerify.water_bill || 0) + 
                          (billToVerify.electrical_bill || 0) + 
                          (billToVerify.wifi_bill || 0) + 
                          (billToVerify.other_bills || 0) +
                          (billToVerify.security_deposit_amount || 0) +
                          (billToVerify.advance_amount || 0);

        const amountPaid = billToVerify.amount_paid || totalBill; // Assuming full payment if not specified in manual flow, or use billToVerify.amount_paid if partials allowed
        
        // Logic: Did they pay enough?
        // In this simple version, we assume the 'amount_paid' field was set during tenant submission or we treat it as fully paid.
        // If your tenant submission doesn't allow partials, amountPaid = totalBill.
        
        const newBalance = currentBalance + (amountPaid - totalBill);

        // 3. Update Balance Table
        if (balanceData) {
            await supabase.from('tenant_balances').update({ amount: newBalance, last_updated: new Date() }).eq('id', balanceData.id);
        } else {
            await supabase.from('tenant_balances').insert({
                tenant_id: billToVerify.tenant,
                occupancy_id: billToVerify.occupancy_id,
                landlord_id: session.user.id,
                amount: newBalance
            });
        }

        // 4. Update Payment Request Status
        await supabase.from('payment_requests').update({
            status: 'paid',
            paid_at: new Date().toISOString()
        }).eq('id', billToVerify.id);

        // 5. Notify
        await createNotification(billToVerify.tenant, 'payment_approved', `Payment verified for ${billToVerify.property?.title}`, { actor: session.user.id });
        
        Alert.alert('Success', 'Payment Approved & Balance Updated');
        setShowVerifyModal(false);
        loadData(session.user.id, profile.role);

    } catch (err: any) {
        Alert.alert('Error', err.message);
    } finally {
        setUploading(false);
    }
  };

  const handleRejectPayment = async () => {
      if(!billToVerify) return;
      await supabase.from('payment_requests').update({ status: 'pending', proof_of_payment_url: null }).eq('id', billToVerify.id);
      await createNotification(billToVerify.tenant, 'payment_rejected', `Payment rejected. Please upload a valid proof.`, { actor: session.user.id });
      Alert.alert('Rejected', 'Tenant notified to re-upload.');
      setShowVerifyModal(false);
      loadData(session.user.id, profile.role);
  };

  // --- ACTIONS: TENANT ---

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true, // Crucial for Supabase upload
    });

    if (!result.canceled) {
      setProofImage(result.assets[0]);
    }
  };

  const handleSubmitPayment = async () => {
    if (!selectedBill || !proofImage) return Alert.alert('Missing', 'Please upload proof of payment');
    setUploading(true);

    try {
      // 1. Upload Image
      const fileName = `${session.user.id}/${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payment_proofs')
        .upload(fileName, decode(proofImage.base64), { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('payment_proofs').getPublicUrl(fileName);

      // 2. Update Bill
      const { error: updateError } = await supabase.from('payment_requests').update({
        status: 'pending_confirmation',
        proof_of_payment_url: publicUrlData.publicUrl,
        payment_method: paymentMethod,
        amount_paid: getTotal(selectedBill) // Assuming full payment for now
      }).eq('id', selectedBill.id);

      if (updateError) throw updateError;

      // 3. Notify
      await createNotification(selectedBill.landlord, 'payment_submitted', `${profile.first_name} submitted payment. Verify now.`, { actor: session.user.id });

      Alert.alert('Success', 'Payment submitted for verification!');
      setShowPayModal(false);
      loadData(session.user.id, profile.role);

    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
      setProofImage(null);
    }
  };

  // --- HELPERS ---
  const getTotal = (bill: any) => {
    return (bill.rent_amount || 0) + (bill.water_bill || 0) + (bill.electrical_bill || 0) + (bill.wifi_bill || 0) + (bill.other_bills || 0) + (bill.security_deposit_amount || 0) + (bill.advance_amount || 0);
  };

  const getFilteredBills = () => {
    if (filter === 'pending') return paymentRequests.filter(p => p.status === 'pending');
    if (filter === 'verify') return paymentRequests.filter(p => p.status === 'pending_confirmation');
    if (filter === 'paid') return paymentRequests.filter(p => p.status === 'paid');
    return paymentRequests;
  };

  // --- RENDER ---
  const renderBillCard = (item: any) => {
    const total = getTotal(item);
    const isLandlord = profile?.role === 'landlord';

    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{item.property?.title}</Text>
            <Text style={styles.cardDate}>Due: {new Date(item.due_date).toLocaleDateString()}</Text>
            {isLandlord && <Text style={styles.tenantName}>Tenant: {item.tenant_profile?.first_name} {item.tenant_profile?.last_name}</Text>}
          </View>
          <View style={[styles.badge, 
            item.status === 'paid' ? styles.badgeGreen : 
            item.status === 'pending_confirmation' ? styles.badgeOrange : styles.badgeGray
          ]}>
            <Text style={styles.badgeText}>{item.status.replace('_', ' ')}</Text>
          </View>
        </View>

        <View style={styles.breakdown}>
           <Text style={styles.itemRow}>Rent: ₱{item.rent_amount}</Text>
           {item.water_bill > 0 && <Text style={styles.itemRow}>Water: ₱{item.water_bill}</Text>}
           {item.electrical_bill > 0 && <Text style={styles.itemRow}>Electric: ₱{item.electrical_bill}</Text>}
           {item.wifi_bill > 0 && <Text style={styles.itemRow}>Wifi: ₱{item.wifi_bill}</Text>}
           {item.other_bills > 0 && <Text style={styles.itemRow}>Other: ₱{item.other_bills}</Text>}
           {item.security_deposit_amount > 0 && <Text style={styles.itemRow}>Security Dep: ₱{item.security_deposit_amount}</Text>}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.amount}>Total: ₱{total.toLocaleString()}</Text>
          
          {/* TENANT ACTIONS */}
          {!isLandlord && item.status === 'pending' && (
            <TouchableOpacity onPress={() => { setSelectedBill(item); setShowPayModal(true); }} style={styles.payBtn}>
              <Text style={styles.payBtnText}>Pay Now</Text>
            </TouchableOpacity>
          )}

          {/* LANDLORD ACTIONS */}
          {isLandlord && (
              <View style={{flexDirection:'row', gap:8}}>
                  {item.status === 'pending' && (
                      <TouchableOpacity onPress={() => { setEditFormData(item); setShowEditModal(true); }} style={[styles.payBtn, {backgroundColor: '#333'}]}>
                        <Text style={styles.payBtnText}>Edit</Text>
                      </TouchableOpacity>
                  )}
                  {item.status === 'pending' && (
                      <TouchableOpacity onPress={() => handleCancelBill(item.id)} style={[styles.payBtn, {backgroundColor: '#ef4444'}]}>
                        <Text style={styles.payBtnText}>Cancel</Text>
                      </TouchableOpacity>
                  )}
                  {item.status === 'pending_confirmation' && (
                      <TouchableOpacity onPress={() => { setBillToVerify(item); setShowVerifyModal(true); }} style={[styles.payBtn, {backgroundColor: '#ca8a04'}]}>
                        <Text style={styles.payBtnText}>Verify</Text>
                      </TouchableOpacity>
                  )}
              </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ padding: 20, paddingBottom: 10, backgroundColor: 'white' }}>
        <Text style={{ fontSize: 24, fontWeight: '900' }}>Payments</Text>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
        {['pending', 'verify', 'paid'].map(t => (
            <TouchableOpacity key={t} onPress={() => setFilter(t)} style={[styles.tab, filter === t && styles.tabActive]}>
                <Text style={[styles.tabText, filter === t && styles.tabTextActive]}>
                    {t === 'verify' ? 'To Verify' : t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
            </TouchableOpacity>
        ))}
      </View>

      {/* LIST */}
      <ScrollView 
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(session.user.id, profile.role)} />}
      >
        {profile?.role === 'landlord' && (
           <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.createBtn}>
              <Ionicons name="add-circle" size={24} color="white" />
              <Text style={{color:'white', fontWeight:'bold'}}>Create New Bill</Text>
           </TouchableOpacity>
        )}

        {loading ? <ActivityIndicator color="black" /> : (
            getFilteredBills().length === 0 ? 
            <Text style={{textAlign:'center', color:'#999', marginTop: 50}}>No bills found</Text> : 
            getFilteredBills().map(renderBillCard)
        )}
      </ScrollView>

      {/* --- MODALS --- */}

      {/* 1. CREATE BILL MODAL */}
      <Modal visible={showCreateModal} animationType="slide">
         <SafeAreaView style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create Bill</Text>
            <ScrollView>
               <Text style={styles.label}>Select Property</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:15}}>
                  {properties.map(p => (
                      <TouchableOpacity key={p.id} onPress={() => setFormData({...formData, property_id: p.id})} style={[styles.chip, formData.property_id === p.id && styles.chipActive]}>
                          <Text style={[styles.chipText, formData.property_id === p.id && {color:'white'}]}>{p.title}</Text>
                      </TouchableOpacity>
                  ))}
               </ScrollView>

               <Text style={styles.label}>Select Tenant</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:15}}>
                  {tenants.filter(t => t.property_id === formData.property_id).map(t => (
                      <TouchableOpacity key={t.id} onPress={() => setFormData({...formData, tenant_id: t.id})} style={[styles.chip, formData.tenant_id === t.id && styles.chipActive]}>
                          <Text style={[styles.chipText, formData.tenant_id === t.id && {color:'white'}]}>{t.name}</Text>
                      </TouchableOpacity>
                  ))}
               </ScrollView>

               <Text style={styles.label}>Rent Amount</Text>
               <TextInput style={styles.input} keyboardType="numeric" value={formData.rent_amount} onChangeText={t => setFormData({...formData, rent_amount: t})} />
               
               <View style={{flexDirection:'row', gap:10}}>
                   <View style={{flex:1}}>
                       <Text style={styles.label}>Water</Text>
                       <TextInput style={styles.input} keyboardType="numeric" value={formData.water_bill} onChangeText={t => setFormData({...formData, water_bill: t})} />
                   </View>
                   <View style={{flex:1}}>
                       <Text style={styles.label}>Electricity</Text>
                       <TextInput style={styles.input} keyboardType="numeric" value={formData.electrical_bill} onChangeText={t => setFormData({...formData, electrical_bill: t})} />
                   </View>
               </View>

               <Text style={styles.label}>Due Date (YYYY-MM-DD)</Text>
               <TextInput style={styles.input} value={formData.due_date} onChangeText={t => setFormData({...formData, due_date: t})} />

               <TouchableOpacity onPress={handleCreateBill} style={[styles.payBtn, {marginTop: 20, paddingVertical: 15, alignItems:'center'}]}>
                   <Text style={{color:'white', fontWeight:'bold'}}>Send Bill</Text>
               </TouchableOpacity>
               <TouchableOpacity onPress={() => setShowCreateModal(false)} style={{marginTop: 10, alignItems:'center', padding: 10}}>
                   <Text>Cancel</Text>
               </TouchableOpacity>
            </ScrollView>
         </SafeAreaView>
      </Modal>

      {/* 2. PAY MODAL (TENANT) */}
      <Modal visible={showPayModal} animationType="slide">
          <SafeAreaView style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Submit Payment</Text>
              <Text style={{marginBottom: 20, color:'#666'}}>Total Due: ₱{selectedBill ? getTotal(selectedBill).toLocaleString() : 0}</Text>
              
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.pickerRow}>
                  {['cash', 'gcash', 'bank_transfer'].map(m => (
                      <TouchableOpacity key={m} onPress={() => setPaymentMethod(m)} style={[styles.chip, paymentMethod === m && styles.chipActive]}>
                          <Text style={[styles.chipText, paymentMethod === m && {color:'white'}]}>{m.toUpperCase()}</Text>
                      </TouchableOpacity>
                  ))}
              </View>

              <Text style={styles.label}>Proof of Payment</Text>
              <TouchableOpacity onPress={pickImage} style={styles.uploadBtn}>
                  {proofImage ? (
                      <Image source={{ uri: proofImage.uri }} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
                  ) : (
                      <View style={{alignItems:'center'}}>
                          <Ionicons name="camera-outline" size={30} color="#999" />
                          <Text style={{color:'#999', marginTop: 5}}>Tap to Upload Screenshot</Text>
                      </View>
                  )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSubmitPayment} disabled={uploading} style={[styles.payBtn, {marginTop: 30, paddingVertical: 15, alignItems:'center'}]}>
                  {uploading ? <ActivityIndicator color="white"/> : <Text style={{color:'white', fontWeight:'bold'}}>Submit Payment</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => {setShowPayModal(false); setProofImage(null);}} style={{marginTop: 15, alignItems:'center'}}>
                  <Text>Cancel</Text>
              </TouchableOpacity>
          </SafeAreaView>
      </Modal>

      {/* 3. VERIFY MODAL (LANDLORD) - PORTED LOGIC */}
      <Modal visible={showVerifyModal} animationType="slide">
          <SafeAreaView style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Verify Payment</Text>
              <ScrollView>
                  <View style={{backgroundColor:'#f3f4f6', padding:15, borderRadius:12, marginBottom:20}}>
                      <Text style={{fontWeight:'bold', fontSize:16}}>Bill Total: ₱{billToVerify ? getTotal(billToVerify).toLocaleString() : 0}</Text>
                      <Text style={{color:'#666'}}>Tenant: {billToVerify?.tenant_profile?.first_name}</Text>
                  </View>

                  <Text style={styles.label}>Proof of Payment</Text>
                  <View style={{height: 400, backgroundColor:'#eee', borderRadius:12, marginBottom: 20, overflow:'hidden'}}>
                      {billToVerify?.proof_of_payment_url ? (
                          <Image source={{ uri: billToVerify.proof_of_payment_url }} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
                      ) : (
                          <View style={{flex:1, alignItems:'center', justifyContent:'center'}}><Text>No Image Available</Text></View>
                      )}
                  </View>

                  <View style={{flexDirection:'row', gap: 10}}>
                      <TouchableOpacity onPress={handleRejectPayment} style={[styles.payBtn, {backgroundColor: 'white', borderWidth:1, borderColor:'#ddd', flex:1, paddingVertical:15, alignItems:'center'}]}>
                          <Text style={{color:'black', fontWeight:'bold'}}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleApprovePayment} disabled={uploading} style={[styles.payBtn, {backgroundColor: '#16a34a', flex:1, paddingVertical:15, alignItems:'center'}]}>
                          {uploading ? <ActivityIndicator color="white"/> : <Text style={{color:'white', fontWeight:'bold'}}>Approve Payment</Text>}
                      </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={() => setShowVerifyModal(false)} style={{marginTop: 20, alignItems:'center'}}>
                      <Text>Close</Text>
                  </TouchableOpacity>
              </ScrollView>
          </SafeAreaView>
      </Modal>

      {/* 4. EDIT BILL MODAL (LANDLORD) */}
      <Modal visible={showEditModal} animationType="slide">
          <SafeAreaView style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Edit Bill</Text>
              <ScrollView>
                 <Text style={styles.label}>Rent</Text>
                 <TextInput style={styles.input} keyboardType="numeric" value={String(editFormData.rent_amount || '')} onChangeText={t => setEditFormData({...editFormData, rent_amount: t})} />
                 
                 <Text style={styles.label}>Water</Text>
                 <TextInput style={styles.input} keyboardType="numeric" value={String(editFormData.water_bill || '')} onChangeText={t => setEditFormData({...editFormData, water_bill: t})} />

                 <Text style={styles.label}>Electricity</Text>
                 <TextInput style={styles.input} keyboardType="numeric" value={String(editFormData.electrical_bill || '')} onChangeText={t => setEditFormData({...editFormData, electrical_bill: t})} />
                 
                 <Text style={styles.label}>Other</Text>
                 <TextInput style={styles.input} keyboardType="numeric" value={String(editFormData.other_bills || '')} onChangeText={t => setEditFormData({...editFormData, other_bills: t})} />

                 <Text style={styles.label}>Due Date</Text>
                 <TextInput style={styles.input} value={editFormData.due_date} onChangeText={t => setEditFormData({...editFormData, due_date: t})} />

                 <TouchableOpacity onPress={handleEditBill} style={[styles.payBtn, {marginTop: 20, paddingVertical: 15, alignItems:'center'}]}>
                     <Text style={{color:'white', fontWeight:'bold'}}>Save Changes</Text>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => setShowEditModal(false)} style={{marginTop: 15, alignItems:'center'}}>
                     <Text>Cancel</Text>
                 </TouchableOpacity>
              </ScrollView>
          </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardDate: { fontSize: 12, color: '#666', marginTop: 2 },
  tenantName: { fontSize: 12, color: '#333', fontWeight: 'bold', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeOrange: { backgroundColor: '#ffedd5' },
  badgeGray: { backgroundColor: '#f3f4f6' },
  badgeText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  breakdown: { backgroundColor: '#f9fafb', padding: 10, borderRadius: 8, marginBottom: 10 },
  itemRow: { fontSize: 12, color: '#444', marginBottom: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  amount: { fontSize: 16, fontWeight: 'bold' },
  payBtn: { backgroundColor: 'black', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  payBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

  // Tabs
  tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15 },
  tab: { marginRight: 15, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: 'black' },
  tabText: { color: '#999', fontWeight: 'bold' },
  tabTextActive: { color: 'black' },
  createBtn: { backgroundColor: 'black', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, marginBottom: 20, gap: 10 },

  // Modal
  modalContainer: { flex: 1, backgroundColor:'white', padding: 25 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  label: { fontWeight: 'bold', marginBottom: 5, marginTop: 15, color: '#666', fontSize: 12, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16, backgroundColor: '#f9fafb' },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: 'white', marginRight: 8 },
  chipActive: { backgroundColor: 'black', borderColor: 'black' },
  chipText: { fontSize: 12, fontWeight: 'bold' },
  uploadBtn: { height: 150, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
});