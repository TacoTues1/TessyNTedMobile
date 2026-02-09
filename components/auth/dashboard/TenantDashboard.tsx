import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions, 
  Alert, 
  Modal, 
  TextInput,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase'; 
import { Ionicons } from '@expo/vector-icons';
import { createNotification } from '../../../lib/notifications'; 
import { LinearGradient } from 'expo-linear-gradient'; 

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.7; 

export default function TenantDashboard({ session, profile }: any) {
  const router = useRouter();
  
  // --- EXISTING REACT NATIVE STATE ---
  const [properties, setProperties] = useState<any[]>([]);
  const [guestFavorites, setGuestFavorites] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [comparisonList, setComparisonList] = useState<any[]>([]);
  const [occupancy, setOccupancy] = useState<any>(null);
  const [propertyStats, setPropertyStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- NEW STATE PORTED FROM NEXT.JS ---
  const [tenantBalance, setTenantBalance] = useState(0);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [nextPaymentDate, setNextPaymentDate] = useState<string>('Loading...');
  const [lastRentPeriod, setLastRentPeriod] = useState<string>('N/A');
  const [lastPayment, setLastPayment] = useState<any>(null);
  
  // Renewal & Deposit State
  const [daysUntilContractEnd, setDaysUntilContractEnd] = useState<number | null>(null);
  const [canRenew, setCanRenew] = useState(false);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [renewalMeetingDate, setRenewalMeetingDate] = useState('');
  const [securityDepositPaid, setSecurityDepositPaid] = useState(false);

  // Modal States (Kept from your RN version)
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

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

  // Re-run calc when payments or occupancy change
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

  // --- DATA LOADING FUNCTIONS ---

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

      // Filter Favorites & Top Rated (Preserved your logic)
      const favs = (allProps || [])
        .filter((p: any) => (statsMap[p.id]?.favorite_count || 0) >= 1)
        .sort((a: any, b: any) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
        .slice(0, 8);
      
      const rated = (allProps || [])
        .filter((p: any) => (statsMap[p.id]?.review_count || 0) > 0)
        .sort((a: any, b: any) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
        .slice(0, 8);
      
      setGuestFavorites(favs);
      setTopRated(rated);

      if (session?.user) {
        const { data: userFavs } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id);
        if (userFavs) setFavorites(userFavs.map((f:any) => f.property_id));
      }
    } catch (err) { console.error(err); }
  };

  const loadOccupancyData = async () => {
    if (!session?.user) return;
    
    // 1. Get Occupancy
    const { data: occ } = await supabase.from('tenant_occupancies')
      .select('*, property:properties(*), landlord:profiles!tenant_occupancies_landlord_id_fkey(*)')
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .maybeSingle();
      
    setOccupancy(occ);

    if (occ) {
        // 2. Renewal Logic (Ported from Next.js)
        if (occ.contract_end_date) {
            const endDate = new Date(occ.contract_end_date);
            const today = new Date();
            const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            setDaysUntilContractEnd(diffDays);
            // Can renew if > 29 days remaining and not already requested
            setCanRenew(diffDays > 29 && !occ.renewal_requested);
        }

        // 3. Load Financials (Ported)
        await loadFinancials(occ.id);
        
        // 4. Check Last Month Deposit Logic (Ported)
        checkLastMonthDepositLogic(occ);
    }
  };

  const loadFinancials = async (occupancyId: string) => {
      // Pending Payments
      const { data: pending } = await supabase.from('payment_requests')
        .select('*')
        .eq('tenant', session.user.id)
        .neq('status', 'paid')
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true });
      setPendingPayments(pending || []);

      // Payment History
      const { data: history } = await supabase.from('payment_requests')
        .select('*')
        .eq('tenant', session.user.id)
        .eq('status', 'paid')
        .order('due_date', { ascending: true });
      setPaymentHistory(history || []);

      // Tenant Balance
      const { data: balance } = await supabase.from('tenant_balances')
        .select('amount')
        .eq('tenant_id', session.user.id)
        .eq('occupancy_id', occupancyId)
        .maybeSingle();
      setTenantBalance(balance?.amount || 0);

      // Last Payment
      const last = history?.filter((h:any) => h.rent_amount > 0).pop();
      setLastPayment(last);

      // Security Deposit Paid Check
      const depositPaid = history?.some((h:any) => h.security_deposit_amount > 0);
      setSecurityDepositPaid(!!depositPaid);
  };

  const checkPendingReviews = async () => {
     if (!session?.user) return;
     const { data: ended } = await supabase.from('tenant_occupancies').select('*, property:properties(title, id)').eq('tenant_id', session.user.id).eq('status', 'ended');
     const { data: reviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', session.user.id);
     
     const reviewedIds = reviews?.map((r:any) => r.occupancy_id) || [];
     const unreviewed = ended?.find((o:any) => !reviewedIds.includes(o.id));
     
     if (unreviewed) {
         setReviewTarget(unreviewed);
         setReviewModalVisible(true);
     }
  };

  // --- CORE LOGIC PORTED FROM NEXT.JS ---

  // 1. Automatic Deposit Deduction for Last Month
  const checkLastMonthDepositLogic = async (occupancy: any) => {
      if (!occupancy.contract_end_date) return;
      const endDate = new Date(occupancy.contract_end_date);
      const today = new Date();
      endDate.setHours(0,0,0,0); today.setHours(0,0,0,0);
      
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const renewalActive = occupancy.renewal_requested || occupancy.renewal_status === 'pending' || occupancy.renewal_status === 'approved';

      // Only if within last 28 days and NO renewal active
      if (diffDays <= 28 && diffDays > 0 && !renewalActive) {
          // Check if bill already exists locally to avoid spamming DB
          const rentAmount = Number(occupancy.property?.price || 0);
          const depositUsed = Number(occupancy.security_deposit_used || 0);
          const availableDeposit = Number(occupancy.security_deposit || 0) - depositUsed;

          // Check for existing "Last Month" bills in pendingPayments
          const existingBill = pendingPayments.find(p => p.rent_amount > 0 && new Date(p.due_date) >= new Date(new Date().setDate(new Date().getDate() - 5)));
          if (existingBill) return;

          // If available deposit covers rent, pay it automatically
          if (availableDeposit >= rentAmount) {
              const { error } = await supabase.from('payment_requests').insert({
                  tenant: session.user.id,
                  property_id: occupancy.property_id,
                  occupancy_id: occupancy.id,
                  rent_amount: rentAmount,
                  status: 'paid', // Auto-paid
                  due_date: new Date().toISOString(),
                  bills_description: 'Last Month Rent (Paid via Security Deposit)',
              });

              if(!error) {
                  await supabase.from('tenant_occupancies').update({ security_deposit_used: depositUsed + rentAmount }).eq('id', occupancy.id);
                  Alert.alert('Info', 'Your last month rent was automatically paid using your Security Deposit.');
                  loadFinancials(occupancy.id); // Reload
              }
          }
      }
  };

  // 2. Complex Next Bill Date Calculation
  const calculateNextPayment = async (occupancyId: string, currentOccupancy: any) => {
     // Check for Pending Bills FIRST
     const pendingBill = pendingPayments.find(b => {
         // Match occupancy or property logic
         return (b.occupancy_id === occupancyId || (!b.occupancy_id && b.property_id === currentOccupancy.property_id)) && b.rent_amount > 0;
     });

     if (pendingBill) {
         setNextPaymentDate(new Date(pendingBill.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
         setLastRentPeriod("N/A");
         return;
     }

     // Use History if no pending
     const paidBills = paymentHistory.filter(b => b.occupancy_id === occupancyId && b.rent_amount > 0);
     // Find latest bill
     const lastBill = paidBills[paidBills.length - 1];

     if (lastBill) {
         const rent = parseFloat(lastBill.rent_amount || 0);
         const advance = parseFloat(lastBill.advance_amount || 0);
         let monthsCovered = 1;
         
         // If renewal/advance included
         if (rent > 0 && advance > 0) {
             monthsCovered = 1 + Math.floor(advance / rent);
         }

         const nextDue = new Date(lastBill.due_date);
         nextDue.setMonth(nextDue.getMonth() + monthsCovered);
         
         // Check Contract End
         if (currentOccupancy.contract_end_date) {
             const endDate = new Date(currentOccupancy.contract_end_date);
             const paidUntil = new Date(lastBill.due_date);
             paidUntil.setMonth(paidUntil.getMonth() + monthsCovered);
             
             // If paid period covers contract end, show "All Paid"
             if (paidUntil >= endDate) {
                 setNextPaymentDate("All Paid - Contract Ending");
                 setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString());
                 return;
             }
         }
         
         setNextPaymentDate(nextDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
         setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString());

     } else {
         // No history, use Start Date
         setNextPaymentDate(new Date(currentOccupancy.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
         setLastRentPeriod("N/A");
     }
  };

  // 3. Renewal Request Logic
  const requestContractRenewal = async () => {
    if (!renewalMeetingDate) return Alert.alert('Error', 'Please select a signing date.');
    
    const { error } = await supabase.from('tenant_occupancies')
        .update({
            renewal_requested: true,
            renewal_requested_at: new Date().toISOString(),
            renewal_status: 'pending',
            renewal_meeting_date: renewalMeetingDate
        }).eq('id', occupancy.id);

    if (!error) {
        await createNotification(
            occupancy.landlord_id, 
            'contract_renewal_request', 
            `${profile.first_name} requested renewal. Meeting Date: ${renewalMeetingDate}`, 
            {actor: session.user.id}
        );
        Alert.alert('Success', 'Renewal request sent!');
        setShowRenewalModal(false);
        loadOccupancyData();
    } else {
        Alert.alert('Error', error.message);
    }
  };

  // --- UI ACTIONS (Existing) ---

  const toggleFavorite = async (id: string) => {
    if (!session) { Alert.alert('Please login'); return; }
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
        if (prev.length >= 3) { Alert.alert('Limit Reached', 'You can only compare up to 3 properties.'); return prev; }
        return [...prev, prop];
    });
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    setSubmittingReview(true);
    const { error } = await supabase.from('reviews').insert({
        property_id: reviewTarget.property_id,
        user_id: session.user.id,
        tenant_id: session.user.id,
        occupancy_id: reviewTarget.id,
        rating: reviewRating,
        comment: reviewComment,
        created_at: new Date().toISOString()
    });
    setSubmittingReview(false);
    if (!error) {
        Alert.alert('Success', 'Review submitted!');
        setReviewModalVisible(false);
        checkPendingReviews();
    }
  };

  const requestEndOccupancy = async () => {
      if (!occupancy || !endRequestDate || !endRequestReason) return Alert.alert('Missing Fields', 'Fill all fields');
      setSubmittingEndRequest(true);
      const { error } = await supabase.from('tenant_occupancies').update({
          status: 'pending_end',
          end_requested_at: new Date().toISOString(),
          end_request_reason: endRequestReason.trim(),
          end_request_date: endRequestDate,
          end_request_status: 'pending'
      }).eq('id', occupancy.id);
      
      if (!error) {
          await createNotification(occupancy.landlord_id, 'end_occupancy_request', `${profile?.first_name} requested to end occupancy on ${endRequestDate}.`, { actor: session.user.id });
          Alert.alert('Submitted', 'Landlord notified.');
          setEndRequestModalVisible(false);
          loadOccupancyData();
      }
      setSubmittingEndRequest(false);
  };

  // --- RENDER COMPONENTS (Preserved your exact Card styles) ---

  const renderCard = (item: any) => {
    const isFav = favorites.includes(item.id);
    const isCompare = comparisonList.some(c => c.id === item.id);
    const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 };
    const imageUri = item.images?.[0] || 'https://via.placeholder.com/400';

    return (
        <TouchableOpacity 
            key={item.id} 
            style={styles.card} 
            activeOpacity={0.9}
            onPress={() => router.push(`/properties/${item.id}` as any)}
        >
            <View style={styles.cardImageContainer}>
                <Image source={{ uri: imageUri }} style={styles.cardImage} />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.cardGradient} />
                
                <View style={styles.cardHeader}>
                    <View style={[styles.badge, item.status === 'available' ? styles.badgeAvailable : styles.badgeOccupied]}>
                        <Text style={[styles.badgeText, item.status === 'available' ? styles.textDark : styles.textWhite]}>
                            {item.status === 'available' ? 'Available' : 'Occupied'}
                        </Text>
                    </View>
                    {stats.favorite_count >= 1 && (
                        <View style={[styles.badge, styles.badgeFav]}>
                             <Ionicons name="heart" size={10} color="white" />
                             <Text style={[styles.badgeText, styles.textWhite, {marginLeft: 2}]}>{stats.favorite_count}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.cardActions}>
                    <TouchableOpacity onPress={(e) => {e.stopPropagation(); toggleFavorite(item.id)}} style={styles.actionBtn}>
                        <Ionicons name={isFav ? "heart" : "heart-outline"} size={18} color={isFav ? "#ef4444" : "#666"} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={(e) => {e.stopPropagation(); toggleCompare(item)}} style={[styles.actionBtn, {marginTop: 8}, isCompare && styles.actionBtnActive]}>
                         <Ionicons name={isCompare ? "checkmark" : "add"} size={18} color={isCompare ? "white" : "#666"} />
                    </TouchableOpacity>
                </View>
                <View style={styles.priceOverlay}>
                    <Text style={styles.priceText}>₱{Number(item.price).toLocaleString()}</Text>
                    <Text style={styles.priceSub}>/mo</Text>
                </View>
            </View>
            <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {stats.review_count > 0 && (
                        <View style={styles.ratingContainer}>
                            <Ionicons name="star" size={12} color="#fbbf24" />
                            <Text style={styles.ratingText}>{stats.avg_rating.toFixed(1)}</Text>
                            <Text style={styles.reviewCount}>({stats.review_count})</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.cardLocation} numberOfLines={1}>{item.city}, Philippines</Text>
                <View style={styles.featureRow}>
                    <View style={styles.featureItem}><Ionicons name="bed-outline" size={14} color="#666"/><Text style={styles.featureText}>{item.bedrooms}</Text></View>
                    <View style={styles.divider} />
                    <View style={styles.featureItem}><Ionicons name="water-outline" size={14} color="#666"/><Text style={styles.featureText}>{item.bathrooms}</Text></View>
                    <View style={styles.divider} />
                    <View style={styles.featureItem}><Ionicons name="resize-outline" size={14} color="#666"/><Text style={styles.featureText}>{item.area_sqft} sqm</Text></View>
                </View>
            </View>
        </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        
        {/* --- ACTIVE PROPERTY SECTION (Updated with Logic) --- */}
        {occupancy && (
          <View style={styles.section}>
             <View style={styles.occupancyCard}>
                <View style={styles.occImageContainer}>
                   <Image source={{ uri: occupancy.property?.images?.[0] }} style={styles.occImage} />
                </View>
                <View style={styles.occContent}>
                    <View style={styles.occHeader}>
                        <Text style={styles.occTitle} numberOfLines={1}>{occupancy.property?.title}</Text>
                        <View style={[styles.statusPill, occupancy.status === 'pending_end' ? styles.pillPending : styles.pillActive]}>
                            <Text style={[styles.statusPillText, occupancy.status === 'pending_end' ? styles.textPending : styles.textActive]}>
                                {occupancy.status === 'pending_end' ? 'Moving Out' : 'Active'}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.occAddress} numberOfLines={1}>{occupancy.property?.address}</Text>
                    
                    {/* UPDATED: Real Calculated Data */}
                    <View style={styles.occDetails}>
                        <View>
                            <Text style={styles.occLabel}>NEXT BILL</Text>
                            <Text style={[styles.occValue, nextPaymentDate.includes('All Paid') && {color:'green'}]}>
                                {nextPaymentDate}
                            </Text>
                        </View>
                        <View>
                            <Text style={styles.occLabel}>BALANCE</Text>
                            <Text style={styles.occValue}>
                                ₱{pendingPayments.reduce((acc, curr) => acc + (Number(curr.rent_amount) || 0) + (Number(curr.water_bill) || 0) + (Number(curr.electrical_bill) || 0) + (Number(curr.wifi_bill) || 0) + (Number(curr.other_bills) || 0) + (Number(curr.security_deposit_amount) || 0), 0).toLocaleString()}
                            </Text>
                        </View>
                    </View>

                    {/* NEW: Utility Reminders (Ported) */}
                    <View style={{flexDirection:'row', gap:8, marginTop:10}}>
                        {occupancy.wifi_due_day && (
                            <View style={styles.utilityTag}>
                                <Ionicons name="wifi" size={10} color="#2563eb" />
                                <Text style={{fontSize:9, color:'#2563eb', fontWeight:'bold'}}>Due {occupancy.wifi_due_day}th</Text>
                            </View>
                        )}
                        <View style={[styles.utilityTag, {backgroundColor:'#fefce8'}]}>
                            <Ionicons name="flash" size={10} color="#ca8a04" />
                            <Text style={{fontSize:9, color:'#ca8a04', fontWeight:'bold'}}>Week 1</Text>
                        </View>
                    </View>

                    {/* NEW: Deposit Warning (Ported) */}
                    {securityDepositPaid && daysUntilContractEnd !== null && daysUntilContractEnd <= 30 && daysUntilContractEnd > 0 && (
                        <View style={{marginTop:8, backgroundColor:'#f3f4f6', padding:4, borderRadius:4}}>
                            <Text style={{fontSize:9, color:'#4b5563'}}>💡 Deposit may cover last month rent.</Text>
                        </View>
                    )}

                    <View style={{flexDirection:'row', gap:10, marginTop: 12}}>
                        {/* NEW: Renewal Button */}
                        {canRenew && (
                            <TouchableOpacity style={styles.renewBtn} onPress={() => setShowRenewalModal(true)}>
                                <Text style={styles.renewText}>Renew</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.endContractBtn} onPress={() => setEndRequestModalVisible(true)}>
                             <Text style={styles.endContractText}>End Contract</Text>
                        </TouchableOpacity>
                    </View>
                </View>
             </View>
          </View>
        )}

        {/* --- LISTS (Preserved) --- */}
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>All Properties</Text>
                <TouchableOpacity onPress={() => router.push('/properties' as any)}><Text style={styles.seeMore}>See More</Text></TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color="black"/> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
                    {properties.slice(0, 8).map(renderCard)}
                </ScrollView>
            )}
        </View>

        {guestFavorites.length > 0 && (
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, {marginLeft: 20}]}>Tenant Favorites</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
                    {guestFavorites.map(renderCard)}
                </ScrollView>
            </View>
        )}

        {topRated.length > 0 && (
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, {marginLeft: 20}]}>Top Rated</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
                    {topRated.map(renderCard)}
                </ScrollView>
            </View>
        )}

      </ScrollView>

      {/* Compare Floating Button (Preserved) */}
      {comparisonList.length > 0 && (
          <TouchableOpacity 
            style={styles.compareBtn} 
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/compare', params: { ids: comparisonList.map((c: any)=>c.id).join(',') } })}
          >
              <View style={styles.compareBadge}><Text style={styles.compareBadgeText}>{comparisonList.length}</Text></View>
              <Ionicons name="git-compare-outline" size={20} color="white" style={{marginRight: 8}}/>
              <Text style={styles.compareText}>COMPARE SELECTED</Text>
          </TouchableOpacity>
      )}

      {/* --- MODALS (Updated with Renewal) --- */}

      {/* NEW: Renewal Modal */}
      <Modal visible={showRenewalModal} transparent animationType="slide">
         <View style={styles.modalOverlay}>
             <View style={styles.modalContent}>
                 <View style={styles.modalIconContainer}><Ionicons name="calendar" size={30} color="#4338ca" /></View>
                 <Text style={styles.modalTitle}>Renew Contract</Text>
                 <Text style={styles.modalSubtitle}>Request to extend your stay at {occupancy?.property?.title}</Text>
                 
                 <Text style={styles.inputLabel}>Select Signing Date *</Text>
                 <TextInput 
                    style={styles.input} 
                    value={renewalMeetingDate} 
                    onChangeText={setRenewalMeetingDate} 
                    placeholder="YYYY-MM-DD" 
                 />
                 <Text style={{fontSize:10, color:'#666', marginBottom:15}}>
                    Proposed date to meet landlord for signing new contract.
                 </Text>

                 <View style={styles.modalActions}>
                     <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRenewalModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                     <TouchableOpacity style={[styles.confirmBtn, {backgroundColor: '#4338ca'}]} onPress={requestContractRenewal}>
                        <Text style={styles.confirmBtnText}>Submit Request</Text>
                     </TouchableOpacity>
                 </View>
             </View>
         </View>
      </Modal>

      {/* Review Modal (Preserved) */}
      <Modal visible={reviewModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={styles.modalIconContainer}>
                      <Ionicons name="star" size={30} color="#ca8a04" />
                  </View>
                  <Text style={styles.modalTitle}>How was your stay?</Text>
                  <Text style={styles.modalSubtitle}>Rate your experience at {reviewTarget?.property?.title}</Text>
                  <View style={styles.starsContainer}>
                      {[1,2,3,4,5].map(n => (
                          <TouchableOpacity key={n} onPress={() => setReviewRating(n)} style={{padding: 4}}>
                              <Ionicons name="star" size={32} color={n <= reviewRating ? "#facc15" : "#e5e7eb"} />
                          </TouchableOpacity>
                      ))}
                  </View>
                  <TextInput style={styles.textArea} placeholder="Write your experience..." multiline value={reviewComment} onChangeText={setReviewComment} textAlignVertical="top"/>
                  <TouchableOpacity style={styles.submitBtn} onPress={submitReview} disabled={submittingReview}>
                      <Text style={styles.submitBtnText}>{submittingReview ? 'Submitting...' : 'Submit Review'}</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* End Request Modal (Preserved) */}
      <Modal visible={endRequestModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Request to Leave</Text>
                  <Text style={styles.modalSubtitle}>Provide details for move out.</Text>
                  <Text style={styles.inputLabel}>Date * (YYYY-MM-DD)</Text>
                  <TextInput style={styles.input} placeholder="2024-12-31" value={endRequestDate} onChangeText={setEndRequestDate} />
                  <Text style={styles.inputLabel}>Reason *</Text>
                  <TextInput style={[styles.input, styles.textAreaSmall]} placeholder="Reason..." multiline value={endRequestReason} onChangeText={setEndRequestReason} textAlignVertical="top"/>
                  <View style={styles.modalActions}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => setEndRequestModalVisible(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.confirmBtn} onPress={requestEndOccupancy} disabled={submittingEndRequest}>
                          {submittingEndRequest ? <ActivityIndicator color="white"/> : <Text style={styles.confirmBtnText}>Submit</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </View>
  );
}

// --- STYLES (Preserved + New Utility Styles) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  section: { marginTop: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12, alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111', textTransform: 'uppercase' },
  seeMore: { fontSize: 14, color: '#333', fontWeight: '600' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 10 },

  // Occupancy Card
  occupancyCard: {
      marginHorizontal: 20, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb',
      flexDirection: 'row', overflow: 'hidden', padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
  },
  occImageContainer: { width: 90, height: 110, borderRadius: 12, overflow: 'hidden', marginRight: 12 },
  occImage: { width: '100%', height: '100%' },
  occContent: { flex: 1, justifyContent: 'space-between' },
  occHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  occTitle: { fontSize: 15, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  pillActive: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  pillPending: { backgroundColor: '#fefce8', borderColor: '#fde047' },
  statusPillText: { fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase' },
  textActive: { color: '#047857' },
  textPending: { color: '#854d0e' },
  occAddress: { fontSize: 11, color: '#666', marginTop: 2, marginBottom: 8 },
  occDetails: { flexDirection: 'row', gap: 16 },
  occLabel: { fontSize: 9, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase' },
  occValue: { fontSize: 11, color: '#111', fontWeight: '600' },
  
  // New Utility & Button Styles
  utilityTag: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#eff6ff', paddingHorizontal:6, paddingVertical:3, borderRadius:4 },
  renewBtn: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' },
  renewText: { color: '#4338ca', fontSize: 11, fontWeight: 'bold' },
  endContractBtn: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fee2e2', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' },
  endContractText: { color: '#dc2626', fontSize: 11, fontWeight: 'bold' },

  // Property Card (Preserved)
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
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  ratingContainer: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { fontSize: 12, fontWeight: 'bold', color: '#111', marginLeft: 2 },
  reviewCount: { fontSize: 12, color: '#9ca3af', marginLeft: 2 },
  cardLocation: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center' },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featureText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  divider: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginHorizontal: 8 },

  // Compare Floater
  compareBtn: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  compareText: { color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
  compareBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#111' },
  compareBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  modalIconContainer: { width: 60, height: 60, backgroundColor: '#fef9c3', borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20 },
  starsContainer: { flexDirection: 'row', marginBottom: 20 },
  textArea: { width: '100%', height: 100, backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 20, fontSize: 14 },
  textAreaSmall: { height: 80 },
  input: { width: '100%', backgroundColor: '#f9fafb', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16, fontSize: 14 },
  inputLabel: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginLeft: 4 },
  submitBtn: { width: '100%', backgroundColor: '#111', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 10 },
  cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { color: '#374151', fontWeight: 'bold' },
  confirmBtn: { flex: 1, backgroundColor: '#111', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: 'white', fontWeight: 'bold' }
});