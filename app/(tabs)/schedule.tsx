import React, { useEffect, useState } from 'react';
import { 
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, 
  Alert, Modal, FlatList, TextInput, Dimensions 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const CELL_SIZE = (width - 60) / COLUMN_COUNT; // Calculate cell width

export default function Schedule() {
  const router = useRouter();
  
  // -- State --
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDateSlots, setSelectedDateSlots] = useState<{[key: string]: string | null}>({});
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchDate, setSearchDate] = useState('');

  // Constants
  const TIME_SLOTS: any = {
    morning: { label: 'Morning (8:00 AM - 11:00 AM)', start: '08:00', end: '11:00' },
    afternoon: { label: 'Afternoon (1:00 PM - 5:30 PM)', start: '13:00', end: '17:30' }
  };

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.replace('/');
    setSession(session);

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    setProfile(profile);

    if (profile?.role !== 'landlord') {
        Alert.alert('Access Denied', 'Only landlords can manage schedules.');
        router.back();
        return;
    }

    loadTimeSlots(session.user.id);
  };

  const loadTimeSlots = async (userId: string) => {
    const { data, error } = await supabase
      .from('available_time_slots')
      .select('*')
      .eq('landlord_id', userId)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    if (error) Alert.alert('Error', error.message);
    else setTimeSlots(data || []);
    setLoading(false);
  };

  // --- LOGIC ---

  const getNextDays = (count = 60) => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < count; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const toggleActiveDate = (dateStr: string) => {
      // Toggle the "active" state of a cell (to show AM/PM buttons)
      setActiveDate(activeDate === dateStr ? null : dateStr);
  };

  const toggleDateTimeSlot = (dateStr: string, slotType: string) => {
      setSelectedDateSlots(prev => ({ ...prev, [dateStr]: slotType }));
      setActiveDate(null); // Close the active state after selection
  };

  const selectAllDates = (slotType: string, filterFn: (d: Date) => boolean) => {
      const dates = getNextDays(60).filter(filterFn);
      const newState: any = { ...selectedDateSlots }; // Keep existing
      dates.forEach(d => {
          newState[d.toISOString().split('T')[0]] = slotType;
      });
      setSelectedDateSlots(newState);
  };

  const addTimeSlots = async () => {
      const selectedDates = Object.keys(selectedDateSlots).filter(d => selectedDateSlots[d]);
      if (selectedDates.length === 0) return Alert.alert('Empty', 'Select at least one date.');

      setSubmitting(true);
      const slotsToCreate = [];

      for (const dateStr of selectedDates) {
          const type = selectedDateSlots[dateStr];
          if (!type) continue;

          const config = TIME_SLOTS[type];
          const date = new Date(dateStr);

          // Start Time
          const [sH, sM] = config.start.split(':');
          const start = new Date(date);
          start.setHours(parseInt(sH), parseInt(sM), 0, 0);

          // End Time
          const [eH, eM] = config.end.split(':');
          const end = new Date(date);
          end.setHours(parseInt(eH), parseInt(eM), 0, 0);

          if (start < new Date()) continue; // Skip past

          slotsToCreate.push({
              property_id: null,
              landlord_id: session.user.id,
              start_time: start.toISOString(),
              end_time: end.toISOString(),
              is_booked: false
          });
      }

      const { error } = await supabase.from('available_time_slots').insert(slotsToCreate);
      
      setSubmitting(false);
      if (error) {
          Alert.alert('Error', error.message);
      } else {
          Alert.alert('Success', `${slotsToCreate.length} slots added.`);
          setShowAddModal(false);
          setSelectedDateSlots({});
          loadTimeSlots(session.user.id);
      }
  };

  const deleteSlot = async (id: string) => {
      Alert.alert('Delete', 'Remove this availability?', [
          { text: 'Cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
              const { error } = await supabase.from('available_time_slots').delete().eq('id', id);
              if (!error) loadTimeSlots(session.user.id);
          }}
      ]);
  };

  // --- RENDER HELPERS ---

  const renderGridItem = ({ item }: { item: Date }) => {
      const dateStr = item.toISOString().split('T')[0];
      const selected = selectedDateSlots[dateStr];
      const isActive = activeDate === dateStr;
      
      const dayName = item.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = item.getDate();
      const month = item.toLocaleDateString('en-US', { month: 'short' });

      return (
          <View style={[styles.gridCell, selected ? styles.cellSelected : styles.cellDefault, isActive && styles.cellActiveBorder]}>
              <TouchableOpacity style={styles.cellContent} onPress={() => toggleActiveDate(dateStr)}>
                  <Text style={[styles.cellDay, selected ? {color:'#ccc'} : {color:'#999'}]}>{dayName}</Text>
                  <Text style={[styles.cellNum, selected ? {color:'white'} : {color:'black'}]}>{dayNum}</Text>
                  
                  {selected ? (
                      <View style={styles.slotBadge}>
                          <Text style={styles.slotBadgeText}>{selected === 'morning' ? 'AM' : 'PM'}</Text>
                      </View>
                  ) : (
                      <Text style={styles.cellMonth}>{month}</Text>
                  )}
              </TouchableOpacity>

              {/* Overlay for selection */}
              {isActive && (
                  <View style={styles.cellOverlay}>
                      <TouchableOpacity onPress={() => toggleDateTimeSlot(dateStr, 'morning')} style={[styles.overlayBtn, selected==='morning' && styles.overlayBtnActive]}>
                          <Text style={[styles.overlayBtnText, selected==='morning' && {color:'white'}]}>AM</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleDateTimeSlot(dateStr, 'afternoon')} style={[styles.overlayBtn, selected==='afternoon' && styles.overlayBtnActive]}>
                          <Text style={[styles.overlayBtnText, selected==='afternoon' && {color:'white'}]}>PM</Text>
                      </TouchableOpacity>
                  </View>
              )}
          </View>
      );
  };

  const renderSlotItem = ({ item }: { item: any }) => {
      const date = new Date(item.start_time);
      const isMorning = date.getHours() === 8;
      return (
          <View style={[styles.slotCard, item.is_booked ? styles.slotBooked : null]}>
              <View>
                  <Text style={styles.slotDate}>{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                      <View style={[styles.pill, {borderColor: 'black'}]}>
                          <Text style={{fontSize: 10, fontWeight: 'bold'}}>{isMorning ? 'MORNING' : 'AFTERNOON'}</Text>
                      </View>
                      <Text style={{fontSize: 12, marginLeft: 8, color: '#666'}}>
                          {isMorning ? '8:00 AM - 11:00 AM' : '1:00 PM - 5:30 PM'}
                      </Text>
                  </View>
              </View>
              {!item.is_booked ? (
                  <TouchableOpacity onPress={() => deleteSlot(item.id)}>
                      <Ionicons name="trash-outline" size={20} color="#ccc" />
                  </TouchableOpacity>
              ) : (
                  <View style={styles.bookedBadge}><Text style={{color:'white', fontSize: 10, fontWeight: 'bold'}}>BOOKED</Text></View>
              )}
          </View>
      );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="black" /></View>;

  return (
    <SafeAreaView style={styles.container}>
       {/* Header */}
       <View style={styles.header}>
           <View>
               <Text style={styles.headerTitle}>Availability</Text>
               <Text style={styles.headerSub}>Manage viewing times</Text>
           </View>
           <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
               <Ionicons name="add" size={20} color="white" />
               <Text style={{color:'white', fontWeight:'bold', marginLeft: 5}}>Add Times</Text>
           </TouchableOpacity>
       </View>

       {/* Search Filter */}
       {timeSlots.length > 0 && (
           <View style={styles.filterContainer}>
               <TextInput 
                  placeholder="YYYY-MM-DD" 
                  style={styles.filterInput} 
                  value={searchDate} 
                  onChangeText={setSearchDate} 
               />
               <Text style={{fontSize: 12, color: '#999'}}>{timeSlots.filter(s => !searchDate || s.start_time.includes(searchDate)).length} slots found</Text>
           </View>
       )}

       {/* Main List */}
       <FlatList 
          data={timeSlots.filter(s => !searchDate || s.start_time.includes(searchDate))}
          keyExtractor={item => item.id}
          renderItem={renderSlotItem}
          contentContainerStyle={{padding: 20}}
          ListEmptyComponent={
              <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-outline" size={50} color="#eee" />
                  <Text style={{color: '#999', marginTop: 10}}>No availability set.</Text>
              </View>
          }
       />

       {/* ADD MODAL */}
       <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
           <View style={styles.modalContainer}>
               <View style={styles.modalHeader}>
                   <Text style={styles.modalTitle}>Select Dates</Text>
                   <TouchableOpacity onPress={() => setShowAddModal(false)}>
                       <Text style={{color: 'blue', fontSize: 16}}>Done</Text>
                   </TouchableOpacity>
               </View>

               {/* Quick Select Chips */}
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxHeight: 50, marginBottom: 10}}>
                   {[
                       {l: 'Weekdays AM', type: 'morning', fn: (d:Date) => d.getDay()!==0 && d.getDay()!==6},
                       {l: 'Weekdays PM', type: 'afternoon', fn: (d:Date) => d.getDay()!==0 && d.getDay()!==6},
                       {l: 'Weekends AM', type: 'morning', fn: (d:Date) => d.getDay()===0 || d.getDay()===6},
                       {l: 'Weekends PM', type: 'afternoon', fn: (d:Date) => d.getDay()===0 || d.getDay()===6},
                       {l: 'Clear All', type: 'clear', fn: () => true},
                   ].map((opt, i) => (
                       <TouchableOpacity 
                         key={i} 
                         style={[styles.chip, opt.type === 'clear' && {borderColor: 'red'}]}
                         onPress={() => opt.type === 'clear' ? setSelectedDateSlots({}) : selectAllDates(opt.type, opt.fn)}
                       >
                           <Text style={[styles.chipText, opt.type === 'clear' && {color: 'red'}]}>{opt.l}</Text>
                       </TouchableOpacity>
                   ))}
               </ScrollView>

               {/* Date Grid */}
               <FlatList 
                  data={getNextDays(60)}
                  keyExtractor={item => item.toISOString()}
                  renderItem={renderGridItem}
                  numColumns={COLUMN_COUNT}
                  contentContainerStyle={{paddingBottom: 100}}
               />

               {/* Bottom Footer */}
               <View style={styles.modalFooter}>
                   <Text style={{fontSize: 12, color: '#666'}}>
                       {Object.keys(selectedDateSlots).filter(k => selectedDateSlots[k]).length} dates selected
                   </Text>
                   <TouchableOpacity style={styles.confirmBtn} onPress={addTimeSlots} disabled={submitting}>
                       <Text style={{color:'white', fontWeight:'bold'}}>{submitting ? 'Saving...' : 'Confirm Slots'}</Text>
                   </TouchableOpacity>
               </View>
           </View>
       </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  headerSub: { fontSize: 14, color: '#666' },
  addBtn: { flexDirection: 'row', backgroundColor: 'black', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  
  filterContainer: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  filterInput: { borderWidth: 1, borderColor: '#eee', padding: 8, borderRadius: 8, width: 120, fontSize: 12 },

  slotCard: { padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#eee', marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotBooked: { backgroundColor: '#f9f9f9', borderColor: '#f9f9f9' },
  slotDate: { fontWeight: 'bold', fontSize: 16 },
  pill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  bookedBadge: { backgroundColor: 'black', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },

  // Grid Styles
  gridCell: { width: CELL_SIZE, height: CELL_SIZE, margin: 5, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  cellDefault: { backgroundColor: 'white', borderColor: '#eee' },
  cellSelected: { backgroundColor: 'black', borderColor: 'black' },
  cellActiveBorder: { borderColor: 'black', borderWidth: 2 },
  
  cellContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cellDay: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  cellNum: { fontSize: 28, fontWeight: 'bold' },
  cellMonth: { fontSize: 10, color: '#999' },
  
  slotBadge: { marginTop: 2, backgroundColor: 'white', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  slotBadgeText: { fontSize: 8, fontWeight: 'bold', color: 'black' },

  cellOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.95)', flexDirection: 'row', padding: 2, gap: 2 },
  overlayBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  overlayBtnActive: { backgroundColor: 'black', borderColor: 'black' },
  overlayBtnText: { fontWeight: 'bold', fontSize: 12 },

  // Modal
  modalContainer: { flex: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#eee', marginRight: 8 },
  chipText: { fontSize: 12, fontWeight: 'bold', color: '#666' },

  modalFooter: { position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  confirmBtn: { backgroundColor: 'black', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }
});