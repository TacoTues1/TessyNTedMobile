import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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

// Helper to get Month Year string
function getRentMonth(dueDateString: string) {
  if (!dueDateString) return '-';
  const due = new Date(dueDateString);
  return due.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Payments() {
  const router = useRouter();

  // -- State --
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'verify', 'paid', 'cancelled'

  // Data State
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]); // Approved tenants/occupancies for dropdown
  const [payments, setPayments] = useState<any[]>([]); // Paid history

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState('water'); // 'water' or 'other'

  // Pay Modal (Tenant) - Smart Logic
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [proofImage, setProofImage] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash', 'stripe', 'paymongo'
  const [uploading, setUploading] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [appliedCredit, setAppliedCredit] = useState(0);
  const [monthsCovered, setMonthsCovered] = useState(1);
  const [contractEndDate, setContractEndDate] = useState<Date | null>(null);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [maxMonthsAllowed, setMaxMonthsAllowed] = useState(1);
  const [isBelowMinimum, setIsBelowMinimum] = useState(false);
  const [minimumPayment, setMinimumPayment] = useState(0);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [maxPaymentLimit, setMaxPaymentLimit] = useState<number | null>(null);
  const [exceedsContract, setExceedsContract] = useState(false);

  // Constants
  const getApiUrl = () => {
    let url = process.env.EXPO_PUBLIC_API_URL || '';
    // If on Android Emulator, force 10.0.2.2 if url is localhost OR if url is the LAN IP but unreachable
    // But usually lan IP (192...) works on Emulator. Localhost doesn't.
    // If user set 172... on Emulator, it might fail.
    // Let's rely on standard practice: replace localhost with 10.0.2.2.
    if (Platform.OS === 'android' && url.includes('localhost')) {
      return url.replace('localhost', '10.0.2.2');
    }
    return url;
  };
  const API_URL = getApiUrl();

  // Verify Modal (Landlord) - Replaced with Confirm Logic in list or separate modal
  // We'll use Alert for confirmations to keep it simple, or a custom modal if needed.
  // Using simple Action Sheet style or Alert for now.

  // Edit Bill Modal (Landlord)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  // Form State (Create Bill)
  const [formData, setFormData] = useState<any>({
    property_id: '',
    tenant_id: '',
    occupancy_id: '',
    water_bill: '',
    other_bills: '',
    bills_description: '',
    water_due_date: '',
    other_due_date: '',
  });

  // --- FUNCTIONS ---
  const loadData = async (userId: string, role: string, isSilent = false) => {
    if (!isSilent) setLoading(true);

    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (!isSilent) {
        setLoading(false);
        console.log("Load Data timed out - unblocking UI");
      }
    }, 10000);

    try {
      console.log(`Loading payments for ${role} ${userId}`);

      // 1. Load Bills with joined properties and profiles (matching web version)
      let query = supabase
        .from('payment_requests')
        .select(`
          *,
          properties(title, address),
          tenant_profile:profiles!payment_requests_tenant_fkey(first_name, middle_name, last_name, phone),
          landlord_profile:profiles!payment_requests_landlord_fkey(first_name, middle_name, last_name, phone)
        `)
        .order('created_at', { ascending: false });

      if (role === 'landlord') {
        query = query.eq('landlord', userId);
      } else {
        query = query.eq('tenant', userId);
      }

      const { data: bills, error } = await query;
      if (error) {
        console.error("Fetch bills error:", error);
        Alert.alert("Error", "Failed to load bills. Please check connection.");
      }
      setPaymentRequests(bills || []);
      console.log(`Loaded ${bills?.length} bills.`);

      // 2. Load payment history (for stats / history)
      let paymentsQuery = supabase
        .from('payments')
        .select('*, properties(title), profiles!payments_tenant_fkey(first_name, middle_name, last_name)')
        .order('paid_at', { ascending: false });

      if (role === 'tenant') {
        paymentsQuery = paymentsQuery.eq('tenant', userId);
      } else if (role === 'landlord') {
        paymentsQuery = paymentsQuery.eq('landlord', userId);
      }

      const { data: paymentsData } = await paymentsQuery;
      setPayments(paymentsData || []);

    } catch (e: any) {
      console.error("Load Data Exception:", e);
      Alert.alert("Error", e.message || "An unexpected error occurred");
    } finally {
      clearTimeout(timeout);
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSession(session);
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(data);
      loadData(session.user.id, data?.role);
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  // Realtime Subscription
  useEffect(() => {
    if (session) {
      const channel = supabase
        .channel('payments_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => loadData(session.user.id, profile?.role, true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => loadData(session.user.id, profile?.role, true))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [session, profile]);

  // --- LANDLORD ACTIONS ---

  // --- LANDLORD ACTIONS ---
  const [billReceiptImage, setBillReceiptImage] = useState<any>(null);
  const [qrCodeImage, setQrCodeImage] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const pickBillReceipt = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
    if (!result.canceled) setBillReceiptImage(result.assets[0]);
  };

  const pickQrCode = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
    if (!result.canceled) setQrCodeImage(result.assets[0]);
  };

  const handleCreateBill = async () => {
    if (!formData.tenant_id || !formData.property_id) return Alert.alert('Error', 'Please select a tenant');

    let water = 0, other = 0;
    let finalDueDate: string | null = null;
    let billTypeLabel = '';

    if (activeTab === 'water') {
      water = parseFloat(formData.water_bill) || 0;
      if (water <= 0) return Alert.alert('Error', 'Please enter water bill amount');
      finalDueDate = formData.water_due_date || null;
      if (!finalDueDate) return Alert.alert('Error', 'Please enter due date');
      billTypeLabel = 'Water Bill';
    } else if (activeTab === 'other') {
      other = parseFloat(formData.other_bills) || 0;
      if (other <= 0) return Alert.alert('Error', 'Please enter amount');
      finalDueDate = formData.other_due_date || null;
      if (!finalDueDate) return Alert.alert('Error', 'Please enter due date');
      billTypeLabel = 'Other Bill';
    }

    const total = water + other;
    if (!billReceiptImage) return Alert.alert('Error', 'Please upload bill receipt');

    setCreating(true);
    try {
      // Upload Receipt
      let receiptUrl = null;
      if (billReceiptImage) {
        const fileName = `receipt_${Date.now()}.jpg`;
        await supabase.storage.from('payment-files').upload(fileName, decode(billReceiptImage.base64), { contentType: 'image/jpeg' });
        const { data } = supabase.storage.from('payment-files').getPublicUrl(fileName);
        receiptUrl = data.publicUrl;
      }

      // Upload QR
      let qrUrl = null;
      if (qrCodeImage) {
        const fileName = `qr_${Date.now()}.jpg`;
        await supabase.storage.from('payment-files').upload(fileName, decode(qrCodeImage.base64), { contentType: 'image/jpeg' });
        const { data } = supabase.storage.from('payment-files').getPublicUrl(fileName);
        qrUrl = data.publicUrl;
      }

      const { data: paymentRequest, error } = await supabase.from('payment_requests').insert({
        landlord: session.user.id,
        tenant: formData.tenant_id,
        property_id: formData.property_id,
        occupancy_id: formData.occupancy_id || null,
        rent_amount: 0,
        water_bill: water,
        electrical_bill: 0,
        wifi_bill: 0,
        other_bills: other,
        bills_description: formData.bills_description || 'No Message',
        due_date: finalDueDate ? new Date(finalDueDate).toISOString() : null,
        water_due_date: formData.water_due_date ? new Date(formData.water_due_date).toISOString() : null,
        other_due_date: formData.other_due_date ? new Date(formData.other_due_date).toISOString() : null,
        status: 'pending',
        bill_receipt_url: receiptUrl,
        qr_code_url: qrUrl
      }).select().single();

      if (error) throw error;

      await createNotification(formData.tenant_id, 'payment_request', `New ${billTypeLabel}: ₱${total.toLocaleString()}`, { actor: session.user.id, email: true, sms: true });
      Alert.alert('Success', `${billTypeLabel} sent!`);
      setShowCreateModal(false);
      setFormData({ property_id: '', tenant_id: '', occupancy_id: '', water_bill: '', other_bills: '', bills_description: '', water_due_date: '', other_due_date: '' });
      setBillReceiptImage(null); setQrCodeImage(null);
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send bill');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelBill = async (id: string) => {
    Alert.alert('Confirm Cancel', 'Are you sure?', [
      { text: 'No' },
      {
        text: 'Yes', style: 'destructive', onPress: async () => {
          await supabase.from('payment_requests').update({ status: 'cancelled' }).eq('id', id);
          loadData(session.user.id, profile.role);
        }
      }
    ]);
  };

  const handleEditBill = (bill: any) => {
    setEditFormData({
      id: bill.id,
      rent_amount: bill.rent_amount?.toString() || '',
      water_bill: bill.water_bill?.toString() || '',
      electrical_bill: bill.electrical_bill?.toString() || '',
      other_bills: bill.other_bills?.toString() || '',
      bills_description: bill.bills_description || '',
      due_date: bill.due_date ? new Date(bill.due_date).toISOString().split('T')[0] : ''
    });
    setShowEditModal(true);
  };

  const handleUpdateBill = async () => {
    try {
      const { error } = await supabase.from('payment_requests').update({
        rent_amount: parseFloat(editFormData.rent_amount) || 0,
        water_bill: parseFloat(editFormData.water_bill) || 0,
        electrical_bill: parseFloat(editFormData.electrical_bill) || 0,
        other_bills: parseFloat(editFormData.other_bills) || 0,
        bills_description: editFormData.bills_description,
        due_date: editFormData.due_date ? new Date(editFormData.due_date).toISOString() : null
      }).eq('id', editFormData.id);

      if (error) throw error;
      Alert.alert('Success', 'Bill updated!');
      setShowEditModal(false);
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // --- SMART CONFIRM LOGIC (LANDLORD) ---
  const confirmPayment = async (request: any) => {
    Alert.alert('Confirm Payment', 'Mark this bill as PAID and record transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => executeConfirmPayment(request) }
    ]);
  };

  const executeConfirmPayment = async (request: any) => {
    try {
      // 1. Get Occupancy Info
      let monthlyRent = parseFloat(request.rent_amount || 0);
      let contractEndDate: Date | null = null;

      if (request.occupancy_id) {
        const { data: occ } = await supabase.from('tenant_occupancies')
          .select('contract_end_date, rent_amount, start_date')
          .eq('id', request.occupancy_id)
          .single();
        if (occ) {
          monthlyRent = parseFloat(occ.rent_amount || request.rent_amount || 0);
          contractEndDate = occ.contract_end_date ? new Date(occ.contract_end_date) : null;
        }
      }

      // 2. Calculate Totals
      const billTotal = (
        parseFloat(request.rent_amount || 0) +
        parseFloat(request.security_deposit_amount || 0) +
        parseFloat(request.advance_amount || 0) +
        parseFloat(request.water_bill || 0) +
        parseFloat(request.electrical_bill || 0) +
        parseFloat(request.other_bills || 0)
      );

      // 3. Extra Months for Advance
      // For move-in payments, advance_amount is a one-time deposit, NOT advance rent months
      // So we skip creating extra "paid" bills for move-in payments
      let extraMonths = 0;
      if (!request.is_move_in_payment && monthlyRent > 0 && parseFloat(request.advance_amount || 0) > 0) {
        extraMonths = Math.floor(parseFloat(request.advance_amount) / monthlyRent);
      }

      // 4. Record Payment
      const { data: payment, error: paymentError } = await supabase.from('payments').insert({
        property_id: request.property_id,
        application_id: request.application_id,
        tenant: request.tenant,
        landlord: session.user.id,
        amount: billTotal,
        water_bill: request.water_bill,
        electrical_bill: request.electrical_bill,
        other_bills: request.other_bills,
        bills_description: request.bills_description,
        method: request.payment_method || 'cash',
        status: 'recorded',
        due_date: request.due_date,
        currency: 'PHP'
      }).select().single();

      if (paymentError) throw paymentError;

      // 5. Handle Renewal Payment Due Date Update
      let actualNextDueDate = request.due_date;
      if (request.is_renewal_payment && request.occupancy_id) {
        // Find latest paid bill to calculate next due date
        const { data: lastPaidBill } = await supabase.from('payment_requests')
          .select('due_date, rent_amount, advance_amount')
          .eq('tenant', request.tenant)
          .eq('occupancy_id', request.occupancy_id)
          .in('status', ['paid', 'pending_confirmation'])
          .neq('id', request.id)
          .gt('rent_amount', 0)
          .order('due_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPaidBill && lastPaidBill.due_date) {
          const lastDue = new Date(lastPaidBill.due_date);
          const lastRent = parseFloat(lastPaidBill.rent_amount || 0);
          const lastAdv = parseFloat(lastPaidBill.advance_amount || 0);
          let monthsFromLast = 1;
          if (lastRent > 0 && lastAdv > 0) {
            monthsFromLast = 1 + Math.floor(lastAdv / lastRent);
          }

          const targetDate = new Date(lastDue);
          targetDate.setMonth(targetDate.getMonth() + monthsFromLast);
          actualNextDueDate = targetDate.toISOString();
        } else {
          // Fallback to start_date + 1 month
          const { data: occ } = await supabase.from('tenant_occupancies').select('start_date').eq('id', request.occupancy_id).single();
          if (occ?.start_date) {
            const d = new Date(occ.start_date);
            d.setMonth(d.getMonth() + 1);
            actualNextDueDate = d.toISOString();
          }
        }
      }

      // 6. Update Status
      const updateData: any = { status: 'paid', payment_id: payment.id };
      if (request.is_renewal_payment && actualNextDueDate !== request.due_date) {
        updateData.due_date = actualNextDueDate;
      }
      await supabase.from('payment_requests').update(updateData).eq('id', request.id);

      // 7. Handle Advance Payments (Create Paid future bills)
      if (extraMonths > 0 && request.occupancy_id && actualNextDueDate) {
        const baseDueDate = new Date(actualNextDueDate);
        for (let i = 1; i <= extraMonths; i++) {
          const fDate = new Date(baseDueDate);
          fDate.setMonth(fDate.getMonth() + i);
          if (contractEndDate && fDate > contractEndDate) break;

          await supabase.from('payment_requests').insert({
            landlord: session.user.id, tenant: request.tenant, property_id: request.property_id, occupancy_id: request.occupancy_id,
            rent_amount: monthlyRent, water_bill: 0, electrical_bill: 0, other_bills: 0,
            bills_description: `Advance Payment (Month ${i + 1})`,
            due_date: fDate.toISOString(), status: 'paid', paid_at: new Date().toISOString(),
            is_advance_payment: true, payment_id: payment.id
          });
        }
      }

      // 8. Balance updates (Credit)
      const totalPaidByTenant = parseFloat(request.amount_paid || 0);

      if (totalPaidByTenant > 0) {
        const billOwed = (
          parseFloat(request.rent_amount || 0) +
          parseFloat(request.security_deposit_amount || 0) +
          parseFloat(request.advance_amount || 0) +
          parseFloat(request.water_bill || 0) +
          parseFloat(request.electrical_bill || 0) +
          parseFloat(request.other_bills || 0)
        );
        const remainingCredit = totalPaidByTenant - billOwed;

        if (request.is_renewal_payment) {
          // Reset renewal status
          if (request.occupancy_id) {
            await supabase.from('tenant_occupancies').update({ renewal_status: null, renewal_requested: false }).eq('id', request.occupancy_id);
          }
          // Check for incorrect credit from renewal and remove
          if (request.occupancy_id) {
            const { data: existing } = await supabase.from('tenant_balances').select('amount').eq('tenant_id', request.tenant).eq('occupancy_id', request.occupancy_id).maybeSingle();
            if (existing && existing.amount > 0) {
              const adv = parseFloat(request.advance_amount || 0);
              if (Math.abs(existing.amount - adv) < 1) {
                // Likely incorrect credit -> remove
                await supabase.from('tenant_balances').update({ amount: 0, last_updated: new Date().toISOString() }).eq('tenant_id', request.tenant).eq('occupancy_id', request.occupancy_id);
              } else {
                // Credit doesn't match - reduce by advance amount
                const newBalance = Math.max(0, existing.amount - adv);
                await supabase.from('tenant_balances').update({ amount: newBalance, last_updated: new Date().toISOString() }).eq('tenant_id', request.tenant).eq('occupancy_id', request.occupancy_id);
              }
            }
          }
        } else if (remainingCredit > 0 && request.occupancy_id) {
          const { data: existing } = await supabase.from('tenant_balances').select('amount').eq('tenant_id', request.tenant).eq('occupancy_id', request.occupancy_id).maybeSingle();
          const newBal = (existing?.amount || 0) + remainingCredit;
          await supabase.from('tenant_balances').upsert({ tenant_id: request.tenant, occupancy_id: request.occupancy_id, amount: newBal }, { onConflict: 'tenant_id,occupancy_id' });
        }
      } else {
        // No amount_paid recorded - still handle renewal status reset
        if (request.is_renewal_payment && request.occupancy_id) {
          await supabase.from('tenant_occupancies').update({ renewal_status: null, renewal_requested: false }).eq('id', request.occupancy_id);
        }
      }

      let notifMsg = `Payment verified for ${request.property?.title}`;
      if (request.is_renewal_payment) notifMsg = `Renewal payment confirmed! Next due date updated.`;

      await createNotification(request.tenant, 'payment_approved', notifMsg, { actor: session.user.id, email: true, sms: true });
      Alert.alert('Success', 'Payment confirmed!');
      loadData(session.user.id, profile.role);

    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const rejectPayment = async (request: any) => {
    Alert.alert('Reject Payment', 'Notify tenant to resubmit?', [
      { text: 'Cancel' },
      {
        text: 'Reject', style: 'destructive', onPress: async () => {
          await supabase.from('payment_requests').update({ status: 'rejected' }).eq('id', request.id);
          await createNotification(request.tenant, 'payment_rejected', `Payment rejected for ${request.property?.title}`, { actor: session.user.id, email: true, sms: true });
          loadData(session.user.id, profile.role);
        }
      }
    ]);
  };


  // --- TENANT ACTIONS: PAY BILL ---

  // --- TENANT ACTIONS: PAY BILL ---
  const handlePayBill = async (request: any) => {
    setSelectedBill(request);

    // Calculate total bill amount
    const total = (
      parseFloat(request.rent_amount || 0) +
      parseFloat(request.security_deposit_amount || 0) +
      parseFloat(request.advance_amount || 0) +
      parseFloat(request.water_bill || 0) +
      parseFloat(request.electrical_bill || 0) +
      parseFloat(request.other_bills || 0)
    );

    // 1. Fetch Credit
    let credit = 0;
    // Try to get occupancy_id from bill, or find active occupancy for tenant
    let targetOccId = request.occupancy_id;
    if (!targetOccId) {
      const { data: activeOcc } = await supabase.from('tenant_occupancies').select('id').eq('tenant_id', session.user.id).eq('status', 'active').limit(1).maybeSingle();
      if (activeOcc) targetOccId = activeOcc.id;
    }

    if (targetOccId) {
      const { data: bal } = await supabase.from('tenant_balances').select('amount').eq('tenant_id', session.user.id).eq('occupancy_id', targetOccId).maybeSingle();
      credit = bal?.amount || 0;
    } else {
      // Fallback checks
      const { data: bal } = await supabase.from('tenant_balances').select('amount').eq('tenant_id', session.user.id).is('occupancy_id', null).maybeSingle();
      credit = bal?.amount || 0;
    }
    setAppliedCredit(credit);

    // 2. Initialize Limit Vars
    let limit = Infinity;
    let rentPerMonth = parseFloat(request.rent_amount || 0);
    let endDate: Date | null = null;
    let startDate: Date | null = null;
    let maxMonths = 1;

    // 3. Contracts Calculation
    if (targetOccId) {
      const { data: occ } = await supabase.from('tenant_occupancies').select('contract_end_date, start_date, security_deposit, rent_amount').eq('id', targetOccId).single();
      if (occ) {
        rentPerMonth = parseFloat(request.rent_amount || occ.rent_amount || 0);
        endDate = occ.contract_end_date ? new Date(occ.contract_end_date) : null;
        startDate = occ.start_date ? new Date(occ.start_date) : null;

        if (endDate && startDate) {
          const startYear = startDate.getFullYear();
          const startMonth = startDate.getMonth();
          const endYear = endDate.getFullYear();
          const endMonth = endDate.getMonth();
          const totalContractMonths = (endYear - startYear) * 12 + (endMonth - startMonth);

          const depositAmount = parseFloat(request.security_deposit_amount || occ.security_deposit || 0);
          let adjustedTotalKey = totalContractMonths;
          if (rentPerMonth > 0 && depositAmount >= (rentPerMonth * 0.9)) {
            adjustedTotalKey = Math.max(1, totalContractMonths - 1);
          }
          maxMonths = Math.max(1, adjustedTotalKey);

          if (endDate < new Date()) {
            maxMonths = 1;
            limit = total + parseFloat(request.security_deposit_amount || 0);
          } else {
            const maxContractValue = maxMonths * rentPerMonth;
            const securityDeposit = parseFloat(request.security_deposit_amount || 0);
            const utilities = (parseFloat(request.water_bill || 0) + parseFloat(request.electrical_bill || 0) + parseFloat(request.other_bills || 0));
            const advance = parseFloat(request.advance_amount || 0);
            limit = Math.max(0, maxContractValue + securityDeposit + utilities + advance - credit);
          }
        }
      }
    }

    setMonthlyRent(rentPerMonth);
    setContractEndDate(endDate);
    setMaxMonthsAllowed(maxMonths);
    setMaxPaymentLimit(limit);
    setMonthsCovered(1);
    setExceedsContract(false);
    setPaymentMethod('cash');

    let toPay = Math.max(0, total - credit);
    // For renewal bills, default to full amount
    if (request.advance_amount && parseFloat(request.advance_amount) > 0) {
      toPay = Math.max(0, total - credit);
    }

    setMinimumPayment(toPay);
    setIsBelowMinimum(false);
    setCustomAmount(Math.min(toPay, limit === Infinity ? toPay : limit).toFixed(2));

    // Trigger month calc immediately for default
    // We defer slightly to let state update or just rely on useEffect if we had one. 
    // RN doesn't have the same useEffect for this as web snippet, so we call calc manually if needed, 
    // but customAmount setter is enough. We will call calc in render or onChange.

    setShowPayModal(true);
  };

  const calculateMonthsCovered = (amountVal: string) => {
    setCustomAmount(amountVal);
    const amount = parseFloat(amountVal) || 0;

    if (!selectedBill) return;

    if (amount < minimumPayment || (amount === 0 && minimumPayment > 0)) {
      setIsBelowMinimum(true);
      setMonthsCovered(1);
      return;
    }
    setIsBelowMinimum(false);

    // For move-in payments, advance_amount is a one-time deposit charge, not advance rent
    const isMoveIn = selectedBill.is_move_in_payment;
    const oneTimeCharges = (parseFloat(selectedBill.security_deposit_amount) || 0) + (parseFloat(selectedBill.water_bill) || 0) + (parseFloat(selectedBill.other_bills) || 0) + (isMoveIn ? (parseFloat(selectedBill.advance_amount) || 0) : 0);
    const rentPortion = Math.max(0, amount - oneTimeCharges);

    const rentForCalc = parseFloat(selectedBill.rent_amount || 0) > 0 ? parseFloat(selectedBill.rent_amount) : monthlyRent;
    const months = rentForCalc > 0 ? Math.ceil(rentPortion / rentForCalc) : 1;
    const totalMonths = Math.max(1, months);

    const maxRentAllowed = maxMonthsAllowed * rentForCalc;
    const exceeds = rentPortion > maxRentAllowed;

    setMonthsCovered(totalMonths);
    setExceedsContract(exceeds);
  };

  const handlePayMongoPayment = async () => {
    console.log("Handling PayMongo Payment...");
    if (!selectedBill || !customAmount) return Alert.alert("Error", "Invalid bill or amount");

    setUploading(true);
    try {
      const allMethods = ['gcash', 'paymaya', 'card', 'grab_pay', 'dob'];
      console.log(`Sending request to: ${API_URL}/api/payments/create-paymongo-checkout`);

      // Add timeout for fetch
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const res = await fetch(`${API_URL}/api/payments/create-paymongo-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(customAmount),
          description: `Payment for ${selectedBill.property?.title}`,
          remarks: `Payment Request ID: ${selectedBill.id}`,
          paymentRequestId: selectedBill.id,
          allowedMethods: allMethods
        }),
        signal: controller.signal
      });
      clearTimeout(id);

      const data = await res.json();
      console.log("PayMongo Response:", data);

      if (!res.ok) throw new Error(data.error || 'Failed to connect to gateway');

      if (data.checkoutUrl) {
        // Open Browser
        console.log("Opening browser to:", data.checkoutUrl);
        const result = await WebBrowser.openBrowserAsync(data.checkoutUrl);

        // After browser closes, check status
        checkPaymentStatus(selectedBill.id, data.checkoutSessionId);
      } else {
        Alert.alert("Error", "No checkout URL returned.");
      }
    } catch (e: any) {
      console.error("PayMongo Error:", e);
      if (e.name === 'AbortError') {
        Alert.alert("Timeout", "Connection to server timed out. Check your network.");
      } else if (e.message.includes('Network request failed')) {
        Alert.alert("Connection Error", `Could not reach ${API_URL}. Ensure you are on the same Wi-Fi as the server.`);
      } else {
        Alert.alert("Payment Error", e.message || "Failed to initialize payment.");
      }
    } finally {
      setUploading(false);
    }
  };



  const checkPaymentStatus = async (requestId: string, sessionId: string) => {
    // Allow some time for webhook or processing
    setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/payments/process-paymongo-success`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentRequestId: requestId, sessionId })
        });

        if (res.ok) {
          Alert.alert("Success", "Payment verified!");
          setShowPayModal(false);
          loadData(session.user.id, profile.role);
        } else {
          Alert.alert("Info", "Payment not yet verified. Please check history later.");
        }
      } catch (e) { console.log(e); }
      setUploading(false);
    }, 3000);
  };

  const handleCreditPayment = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payments/pay-with-credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRequestId: selectedBill.id, tenantId: session.user.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await createNotification(selectedBill.landlord, 'payment_confirmation_needed', `Tenant paid with credit`, { actor: session.user.id, email: true, sms: true });
      Alert.alert("Success", "Paid with credit balance!");
      setShowPayModal(false);
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
    if (!result.canceled) setProofImage(result.assets[0]);
  };

  const submitPayment = async () => {
    console.log("Submit Payment Clicked. Method:", paymentMethod);
    if (!selectedBill) return;

    // Route to correct handler
    if (paymentMethod === 'paymongo') {
      await handlePayMongoPayment();
      return;
    }
    if (paymentMethod === 'stripe') {
      return Alert.alert("Coming Soon", "Stripe payment is not yet available on mobile.");
    }

    const amountVal = parseFloat(customAmount) || 0;
    // ... rest of validation

    // Validation
    if (amountVal <= 0) return Alert.alert("Error", "Enter valid amount");
    if (amountVal < minimumPayment) return Alert.alert("Error", `Minimum payment is ₱${minimumPayment.toLocaleString()}`);
    if (paymentMethod === 'cash' && !proofImage && !referenceNumber) return Alert.alert("Error", "Upload proof or enter reference no.");
    if (exceedsContract) return Alert.alert("Error", "Amount exceeds contract period");

    setUploading(true);
    try {
      let proofUrl = null;
      if (proofImage) {
        const fileName = `${session.user.id}/${Date.now()}.jpg`;
        await supabase.storage.from('payment_proofs').upload(fileName, decode(proofImage.base64), { contentType: 'image/jpeg' });
        const { data } = supabase.storage.from('payment_proofs').getPublicUrl(fileName);
        proofUrl = data.publicUrl;
      }

      // Calculate actual advance amount for DB
      // For move-in payments, advance_amount is a one-time deposit - don't recalculate it
      const isMoveIn = selectedBill.is_move_in_payment;
      const oneTimeCharges = (parseFloat(selectedBill.security_deposit_amount) || 0) + (parseFloat(selectedBill.water_bill) || 0) + (parseFloat(selectedBill.other_bills) || 0) + (isMoveIn ? (parseFloat(selectedBill.advance_amount) || 0) : 0);
      const rentPortion = Math.max(0, amountVal + appliedCredit - oneTimeCharges);
      const firstMonthRent = parseFloat(selectedBill.rent_amount || 0);
      // For move-in: keep original advance_amount (it's a deposit, not advance rent months)
      // For regular payments: calculate advance as rent paid beyond first month
      const advanceAmount = isMoveIn ? (parseFloat(selectedBill.advance_amount) || 0) : Math.max(0, rentPortion - firstMonthRent);

      // Update DB
      await supabase.from('payment_requests').update({
        status: 'pending_confirmation',
        paid_at: new Date().toISOString(),
        payment_method: paymentMethod,
        proof_of_payment_url: proofUrl,
        tenant_reference_number: referenceNumber,
        advance_amount: advanceAmount,
        amount_paid: amountVal + appliedCredit
      }).eq('id', selectedBill.id);

      await createNotification(selectedBill.landlord, 'payment_confirmation_needed', `Tenant submitted payment: ₱${amountVal}`, { actor: session.user.id, email: true, sms: true });

      Alert.alert("Success", "Payment submitted for verification!");
      setShowPayModal(false);
      setProofImage(null); setReferenceNumber('');
      loadData(session.user.id, profile.role);

    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setUploading(false);
    }
  };

  // --- RENDER ---
  const getTotal = (bill: any) => (parseFloat(bill.rent_amount) || 0) + (parseFloat(bill.water_bill) || 0) + (parseFloat(bill.electrical_bill) || 0) + (parseFloat(bill.wifi_bill) || 0) + (parseFloat(bill.other_bills) || 0) + (parseFloat(bill.security_deposit_amount) || 0) + (parseFloat(bill.advance_amount) || 0);

  // Bill type detection (matching web version)
  const getBillType = (item: any) => {
    const rent = parseFloat(item.rent_amount) || 0;
    const electric = parseFloat(item.electrical_bill) || 0;
    const water = parseFloat(item.water_bill) || 0;
    const wifi = parseFloat(item.wifi_bill) || 0;
    if (rent > 0) return 'House Rent';
    if (electric > 0) return 'Electric Bill';
    if (water > 0) return 'Water Bill';
    if (wifi > 0) return 'Wifi Bill';
    return 'Other Bill';
  };

  // Total Income calculated from payment history
  const totalIncome = payments.reduce((sum: number, p: any) => {
    return sum + (parseFloat(p.amount || 0) + parseFloat(p.water_bill || 0) + parseFloat(p.electrical_bill || 0) + parseFloat(p.other_bills || 0));
  }, 0);

  const renderBillCard = (item: any) => {
    const total = getTotal(item);
    const isLandlord = profile?.role === 'landlord';
    const isPastDue = item.due_date && new Date(item.due_date) < new Date() && item.status === 'pending';
    const billType = getBillType(item);

    // Get display names from joined profiles
    const tenantName = item.tenant_profile
      ? `${item.tenant_profile.first_name || ''} ${item.tenant_profile.last_name || ''}`.trim()
      : 'Tenant';
    const landlordName = item.landlord_profile
      ? `${item.landlord_profile.first_name || ''} ${item.landlord_profile.last_name || ''}`.trim()
      : 'Landlord';
    const propertyTitle = item.properties?.title || 'Property';
    const propertyAddress = item.properties?.address || '';

    // Status Badge Logic matching web
    let badgeBg = '#fefce8';
    let badgeBorder = '#fef9c3';
    let badgeColor = '#a16207';
    let statusText = 'Pending';

    if (item.status === 'paid') {
      badgeBg = '#f0fdf4'; badgeBorder = '#bbf7d0'; badgeColor = '#15803d';
      statusText = 'Paid';
    } else if (item.status === 'pending_confirmation') {
      badgeBg = '#fefce8'; badgeBorder = '#fef9c3'; badgeColor = '#a16207';
      statusText = 'Confirming';
    } else if (item.status === 'cancelled') {
      badgeBg = '#fef2f2'; badgeBorder = '#fecaca'; badgeColor = '#b91c1c';
      statusText = 'Cancelled';
    } else if (item.status === 'rejected') {
      badgeBg = '#fef2f2'; badgeBorder = '#fecaca'; badgeColor = '#b91c1c';
      statusText = 'Rejected';
    } else if (isPastDue) {
      badgeBg = '#fef2f2'; badgeBorder = '#fecaca'; badgeColor = '#dc2626';
      statusText = 'Overdue';
    }

    const rent = parseFloat(item.rent_amount) || 0;
    const water = parseFloat(item.water_bill) || 0;
    const electric = parseFloat(item.electrical_bill) || 0;
    const securityDeposit = parseFloat(item.security_deposit_amount) || 0;
    const advance = parseFloat(item.advance_amount) || 0;
    const other = parseFloat(item.other_bills) || 0;

    return (
      <View key={item.id} style={styles.billCard}>
        {/* Header Row: Property + Status */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: '#000' }} numberOfLines={1}>{propertyTitle}</Text>
            {propertyAddress ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <Ionicons name="location-outline" size={11} color="#999" />
                <Text style={{ fontSize: 11, color: '#999' }} numberOfLines={1}>{propertyAddress}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ backgroundColor: badgeBg, borderWidth: 1, borderColor: badgeBorder, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: badgeColor, textTransform: 'uppercase' }}>{statusText}</Text>
          </View>
        </View>

        {/* Info Grid: Bill Type, Person, Month, Due Date */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {/* Bill Type Pill */}
          <View style={{ backgroundColor: '#f2f3f4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#555' }}>{billType}</Text>
          </View>

          {/* Month (only for House Rent) */}
          {billType === 'House Rent' && (
            <View style={{ backgroundColor: '#f2f3f4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#777' }}>{getRentMonth(item.due_date)}</Text>
            </View>
          )}

          {/* Payment Method */}
          {item.payment_method && (
            <View style={{ backgroundColor: '#f2f3f4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#555', textTransform: 'uppercase' }}>
                {item.payment_method === 'paymongo' ? 'E-Wallet/Card' :
                  item.payment_method === 'stripe' ? 'Stripe' :
                    item.payment_method === 'qr_code' ? 'QR Code' :
                      item.payment_method === 'cash' ? 'Cash' : item.payment_method}
              </Text>
            </View>
          )}
        </View>

        {/* Person */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Ionicons name="person-outline" size={12} color="#888" />
          <Text style={{ fontSize: 12, color: '#666' }}>
            {isLandlord ? `Tenant: ${tenantName}` : `Landlord: ${landlordName}`}
          </Text>
        </View>

        {/* Message / Description */}
        {item.bills_description && item.bills_description !== 'No Message' && (
          <Text style={{ fontSize: 11, color: '#888', marginBottom: 6, fontStyle: 'italic' }} numberOfLines={2}>
            "{item.bills_description}"
          </Text>
        )}

        {/* Reference Number */}
        {item.tenant_reference_number && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <Text style={{ fontSize: 10, color: '#999', fontWeight: '600' }}>Ref:</Text>
            <Text style={{ fontSize: 11, color: '#555', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{item.tenant_reference_number}</Text>
          </View>
        )}

        {/* Amount Breakdown */}
        <View style={{ backgroundColor: '#fafafa', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
          {rent > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Rent</Text>
              <Text style={{ fontSize: 12, fontWeight: '600' }}>₱{rent.toLocaleString()}</Text>
            </View>
          )}
          {securityDeposit > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Security Deposit</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#b45309' }}>₱{securityDeposit.toLocaleString()}</Text>
            </View>
          )}
          {advance > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Advance</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4f46e5' }}>₱{advance.toLocaleString()}</Text>
            </View>
          )}
          {water > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Water</Text>
              <Text style={{ fontSize: 12, fontWeight: '600' }}>₱{water.toLocaleString()}</Text>
            </View>
          )}
          {electric > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Electricity</Text>
              <Text style={{ fontSize: 12, fontWeight: '600' }}>₱{electric.toLocaleString()}</Text>
            </View>
          )}
          {other > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Other</Text>
              <Text style={{ fontSize: 12, fontWeight: '600' }}>₱{other.toLocaleString()}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#e5e5e5', paddingTop: 6, marginTop: 3 }}>
            <Text style={{ fontSize: 14, fontWeight: '800' }}>Total</Text>
            <Text style={{ fontSize: 14, fontWeight: '800' }}>₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        {/* Due Date */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <Ionicons name="calendar-outline" size={12} color={isPastDue ? '#dc2626' : '#888'} />
          <Text style={{ fontSize: 12, color: isPastDue ? '#dc2626' : '#666', fontWeight: isPastDue ? '700' : '500' }}>
            Due: {item.due_date ? new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Tenant: Pay Now */}
          {!isLandlord && item.status === 'pending' && (
            <TouchableOpacity onPress={() => handlePayBill(item)} style={styles.actionBtnPrimary}>
              <Ionicons name="card-outline" size={14} color="white" />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>Pay Now</Text>
            </TouchableOpacity>
          )}
          {/* Tenant: Waiting */}
          {!isLandlord && item.status === 'pending_confirmation' && (
            <Text style={{ fontSize: 11, color: '#999', fontWeight: '600', fontStyle: 'italic', paddingVertical: 8 }}>Waiting for approval...</Text>
          )}
          {/* Tenant: Resend (Rejected) */}
          {!isLandlord && item.status === 'rejected' && (
            <TouchableOpacity onPress={() => handlePayBill(item)} style={[styles.actionBtnPrimary, { backgroundColor: '#333' }]}>
              <Ionicons name="refresh" size={14} color="white" />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>Resend</Text>
            </TouchableOpacity>
          )}

          {/* Landlord: Pending - Mark Paid / Edit / Cancel */}
          {isLandlord && item.status === 'pending' && (
            <>
              <TouchableOpacity onPress={() => confirmPayment(item)} style={[styles.actionBtnSmall, { backgroundColor: '#22c55e' }]}>
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 11 }}>Paid</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleEditBill(item)} style={[styles.actionBtnSmall, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' }]}>
                <Text style={{ color: '#333', fontWeight: '700', fontSize: 11 }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleCancelBill(item.id)} style={[styles.actionBtnSmall, { backgroundColor: '#fef2f2' }]}>
                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 11 }}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
          {/* Landlord: Pending Confirmation - Confirm / Reject */}
          {isLandlord && item.status === 'pending_confirmation' && (
            <>
              <TouchableOpacity onPress={() => confirmPayment(item)} style={[styles.actionBtnSmall, { backgroundColor: '#000' }]}>
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 11 }}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => rejectPayment(item)} style={[styles.actionBtnSmall, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#000' }]}>
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 11 }}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      <View style={{ padding: 20, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '900' }}>Payments</Text>
          <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Manage bills and income</Text>
        </View>
        {profile?.role === 'landlord' && (
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.navCreateBtn}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12, marginLeft: 4 }}>New Bill</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Landlord Stats */}
      {profile?.role === 'landlord' && (
        <View style={{ flexDirection: 'row', padding: 15, gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#f0f0f0' }}>
            <Text style={{ fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 }}>Total Income</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#000' }}>₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#f0f0f0' }}>
            <Text style={{ fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 }}>Total Payments</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#000' }}>{payments.length}</Text>
          </View>
        </View>
      )}

      <View style={styles.tabContainer}>
        {['all', 'pending', 'verify', 'paid', 'cancelled'].map(t => (
          <TouchableOpacity key={t} onPress={() => setFilter(t)} style={[styles.tab, filter === t && styles.tabActive]}>
            <Text style={[styles.tabText, filter === t && styles.tabTextActive]}>{t === 'verify' ? 'To Verify' : t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 15 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(session.user.id, profile.role)} />}>

          {loading ? <ActivityIndicator color="black" style={{ marginTop: 20 }} /> :
            (() => {
              const filtered = paymentRequests.filter((p: any) => {
                if (filter === 'all') return true;
                if (filter === 'pending') {
                  return !p.status || p.status === 'pending' || p.status === 'rejected' || p.status === 'recorded' || p.status === 'unpaid';
                }
                if (filter === 'verify') return p.status === 'pending_confirmation';
                if (filter === 'paid') return p.status === 'paid';
                if (filter === 'cancelled') return p.status === 'cancelled';
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <View style={{ alignItems: 'center', marginTop: 50 }}>
                    <Ionicons name="documents-outline" size={48} color="#ccc" />
                    <Text style={{ textAlign: 'center', marginTop: 10, color: '#999', fontWeight: '600' }}>
                      {filter === 'all' ? 'No bills found' : filter === 'pending' ? 'No pending bills' : filter === 'verify' ? 'No payments to verify' : filter === 'cancelled' ? 'No cancelled bills' : 'No paid history'}
                    </Text>
                  </View>
                );
              }
              return filtered.map(renderBillCard);
            })()
          }
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* CREATE MODAL */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={styles.modalTitle}>Send Bill</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {['water', 'other'].map(t => (
              <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={[styles.chip, activeTab === t && styles.chipActive]}>
                <Text style={[styles.chipText, activeTab === t && { color: 'white' }]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView>
            <Text style={styles.label}>SELECT TENANT</Text>
            <ScrollView horizontal style={{ marginBottom: 15 }}>
              {tenants.map(t => (
                <TouchableOpacity key={t.id} onPress={() => setFormData({ ...formData, tenant_id: t.id, property_id: t.property_id, occupancy_id: t.occupancy_id })} style={[styles.chip, formData.tenant_id === t.id && styles.chipActive]}>
                  <Text style={[styles.chipText, formData.tenant_id === t.id && { color: 'white' }]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {activeTab === 'water' && (
              <View>
                <Text style={styles.label}>WATER AMOUNT</Text>
                <TextInput style={styles.input} keyboardType="numeric" onChangeText={t => setFormData({ ...formData, water_bill: t })} />
                <Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} onChangeText={t => setFormData({ ...formData, water_due_date: t })} placeholder="YYYY-MM-DD" />
              </View>
            )}
            {activeTab === 'other' && (
              <View>
                <Text style={styles.label}>AMOUNT</Text>
                <TextInput style={styles.input} keyboardType="numeric" onChangeText={t => setFormData({ ...formData, other_bills: t })} />
                <Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} onChangeText={t => setFormData({ ...formData, other_due_date: t })} placeholder="YYYY-MM-DD" />
              </View>
            )}

            <Text style={styles.label}>MESSAGE (OPTIONAL)</Text>
            <TextInput style={styles.input} onChangeText={t => setFormData({ ...formData, bills_description: t })} placeholder="Details..." />

            <Text style={styles.label}>BILL RECEIPT (REQUIRED)</Text>
            <TouchableOpacity onPress={pickBillReceipt} style={styles.uploadBtn}>
              {billReceiptImage ? <Image source={{ uri: billReceiptImage.uri }} style={{ width: '100%', height: '100%', borderRadius: 8 }} /> : <Text style={{ color: '#999' }}>Tap to upload Receipt</Text>}
            </TouchableOpacity>

            <Text style={styles.label}>QR CODE (OPTIONAL)</Text>
            <TouchableOpacity onPress={pickQrCode} style={styles.uploadBtn}>
              {qrCodeImage ? <Image source={{ uri: qrCodeImage.uri }} style={{ width: '100%', height: '100%', borderRadius: 8 }} /> : <Text style={{ color: '#999' }}>Tap to upload QR</Text>}
            </TouchableOpacity>


            <TouchableOpacity onPress={handleCreateBill} disabled={creating} style={[styles.payBtn, { marginTop: 20, alignItems: 'center', padding: 15 }]}>
              {creating ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>SEND BILL</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={styles.modalTitle}>Edit Bill</Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.label}>RENT AMOUNT</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={editFormData.rent_amount} onChangeText={t => setEditFormData({ ...editFormData, rent_amount: t })} />

            <Text style={styles.label}>WATER BILL</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={editFormData.water_bill} onChangeText={t => setEditFormData({ ...editFormData, water_bill: t })} />

            <Text style={styles.label}>ELECTRICAL BILL</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={editFormData.electrical_bill} onChangeText={t => setEditFormData({ ...editFormData, electrical_bill: t })} />

            <Text style={styles.label}>OTHER BILLS</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={editFormData.other_bills} onChangeText={t => setEditFormData({ ...editFormData, other_bills: t })} />

            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput style={styles.input} value={editFormData.bills_description} onChangeText={t => setEditFormData({ ...editFormData, bills_description: t })} />

            <Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={editFormData.due_date} onChangeText={t => setEditFormData({ ...editFormData, due_date: t })} />

            <TouchableOpacity onPress={handleUpdateBill} style={[styles.payBtn, { marginTop: 20, alignItems: 'center', padding: 15 }]}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>UPDATE BILL</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* PAY MODAL */}
      <Modal visible={showPayModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={styles.modalTitle}>Pay Bill</Text>
            <TouchableOpacity onPress={() => setShowPayModal(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
          </View>

          <ScrollView>
            <View style={styles.billSection}>
              <Text style={styles.billSectionTitle}>Total Due: ₱{selectedBill ? getTotal(selectedBill).toLocaleString() : 0}</Text>
              {appliedCredit > 0 && <Text style={{ color: 'green', fontSize: 12 }}>Credit Applied: -₱{appliedCredit.toLocaleString()}</Text>}
            </View>

            <Text style={styles.label}>AMOUNT TO PAY</Text>
            <TextInput style={styles.input} value={customAmount} onChangeText={calculateMonthsCovered} keyboardType="numeric" />

            {monthsCovered > 1 && <Text style={{ color: 'green', marginVertical: 5 }}>Covers {monthsCovered} months</Text>}
            {exceedsContract && <Text style={{ color: 'red', marginVertical: 5 }}>Exceeds contract duration!</Text>}

            {isBelowMinimum && (
              <Text style={{ color: 'red', fontSize: 12, fontWeight: 'bold', marginVertical: 4 }}>
                Minimum payment is ₱{minimumPayment.toLocaleString()}
              </Text>
            )}

            {minimumPayment <= 0 && appliedCredit > 0 ? (
              <TouchableOpacity onPress={handleCreditPayment} style={[styles.payBtn, { backgroundColor: '#22c55e', marginTop: 10 }]}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Pay with Credit Balance</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.label}>PAYMENT METHOD</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  {/* CASH */}
                  <TouchableOpacity onPress={() => setPaymentMethod('cash')} style={[styles.paymentCard, paymentMethod === 'cash' && styles.paymentCardActive]}>
                    <Ionicons name="cash-outline" size={24} color={paymentMethod === 'cash' ? "white" : "black"} />
                    <Text style={[styles.paymentCardText, paymentMethod === 'cash' && { color: 'white' }]}>Cash</Text>
                  </TouchableOpacity>

                  {/* STRIPE */}
                  <TouchableOpacity onPress={() => setPaymentMethod('stripe')} style={[styles.paymentCard, paymentMethod === 'stripe' && { backgroundColor: '#6772e5', borderColor: '#6772e5' }]}>
                    <Ionicons name="card-outline" size={24} color={paymentMethod === 'stripe' ? "white" : "black"} />
                    <Text style={[styles.paymentCardText, paymentMethod === 'stripe' && { color: 'white' }]}>Stripe</Text>
                  </TouchableOpacity>

                  {/* PAYMONGO */}
                  <TouchableOpacity onPress={() => setPaymentMethod('paymongo')} style={[styles.paymentCard, paymentMethod === 'paymongo' && { backgroundColor: '#00BFA5', borderColor: '#00BFA5' }]}>
                    <Ionicons name="wallet-outline" size={24} color={paymentMethod === 'paymongo' ? "white" : "black"} />
                    <Text style={[styles.paymentCardText, paymentMethod === 'paymongo' && { color: 'white' }]}>GCash/Maya</Text>
                  </TouchableOpacity>
                </View>

                {paymentMethod === 'cash' && (
                  <>
                    <Text style={styles.label}>REFERENCE NO / PROOF</Text>
                    <TextInput style={[styles.input, { marginBottom: 10 }]} placeholder="Ref No." value={referenceNumber} onChangeText={setReferenceNumber} />

                    <TouchableOpacity onPress={pickImage} style={styles.uploadBtn}>
                      {proofImage ? <Image source={{ uri: proofImage.uri }} style={{ width: '100%', height: '100%', borderRadius: 8 }} /> : <Text style={{ color: '#999' }}>Tap to upload Screenshot</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            <TouchableOpacity onPress={submitPayment} disabled={uploading} style={[styles.payBtn, { marginTop: 20, alignItems: 'center', padding: 15 }]}>
              {uploading ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>SUBMIT PAYMENT</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Bill Card (replaces table rows)
  billCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  actionBtnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Legacy styles still used by modals
  iconBtn: { padding: 8, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  badgeGreen: { backgroundColor: '#dcfce7', borderColor: '#dcfce7' },
  badgeOrange: { backgroundColor: '#ffedd5', borderColor: '#ffedd5' },
  badgeRed: { backgroundColor: '#fee2e2', borderColor: '#fee2e2' },
  badgeGray: { backgroundColor: '#f3f4f6', borderColor: '#f3f4f6' },
  badgeText: { fontSize: 10, fontWeight: 'bold', textTransform: 'capitalize' },
  payBtn: { backgroundColor: '#000', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  payBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  createBtn: { backgroundColor: 'black', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, marginBottom: 10, gap: 10 },
  modalContainer: { flex: 1, padding: 20, backgroundColor: 'white', marginTop: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20, gap: 8, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#f0f0f0' },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f3f4f6' },
  tabActive: { backgroundColor: 'black' },
  tabText: { color: '#666', fontWeight: 'bold', fontSize: 12 },
  tabTextActive: { color: 'white' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 5, marginTop: 15 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16 },
  billSection: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  billSectionTitle: { fontSize: 18, fontWeight: 'bold' },
  paymentCard: { flex: 1, padding: 15, borderWidth: 1, borderColor: '#eee', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 5 },
  paymentCardActive: { backgroundColor: 'black', borderColor: 'black' },
  paymentCardText: { fontSize: 12, fontWeight: 'bold', color: 'black' },
  uploadBtn: { height: 150, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  chip: { padding: 8, borderRadius: 8, backgroundColor: '#eee' },
  chipActive: { backgroundColor: 'black' },
  chipText: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  navCreateBtn: { backgroundColor: 'black', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }
});

