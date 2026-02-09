import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function PaymentHistory() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.replace('/');

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    
    let query = supabase.from('payments')
      .select('*, properties(title), tenant:profiles!payments_tenant_fkey(first_name, last_name)')
      .order('paid_at', { ascending: false });

    if (profile?.role === 'landlord') {
       query = query.eq('landlord_id', session.user.id);
    } else {
       query = query.eq('tenant_id', session.user.id);
    }

    const { data } = await query;
    setPayments(data || []);
    
    const total = data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    setTotalPaid(total);
    setLoading(false);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
       <View style={styles.row}>
           <Text style={styles.propTitle}>{item.properties?.title || 'Unknown Property'}</Text>
           <Text style={styles.amount}>₱{item.amount.toLocaleString()}</Text>
       </View>
       <View style={styles.row}>
           <Text style={styles.meta}>{item.tenant?.first_name} {item.tenant?.last_name}</Text>
           <Text style={styles.date}>{new Date(item.paid_at).toLocaleDateString()}</Text>
       </View>
       <View style={styles.footer}>
           <View style={styles.pill}><Text style={styles.pillText}>{item.method.toUpperCase()}</Text></View>
           <Text style={styles.status}>COMPLETED</Text>
       </View>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color="black" /></View>;

  return (
    <SafeAreaView style={styles.container}>
       <View style={styles.header}>
           <TouchableOpacity onPress={() => router.back()} style={{marginRight: 10}}>
               <Ionicons name="arrow-back" size={24} color="black" />
           </TouchableOpacity>
           <Text style={styles.title}>Payment History</Text>
       </View>

       <View style={styles.summary}>
           <Text style={{color: '#888', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase'}}>Total Completed</Text>
           <Text style={{fontSize: 32, fontWeight: 'bold', color: 'black'}}>₱{totalPaid.toLocaleString()}</Text>
       </View>

       <FlatList 
         data={payments}
         renderItem={renderItem}
         keyExtractor={item => item.id}
         contentContainerStyle={{padding: 20}}
         ListEmptyComponent={<Text style={{textAlign: 'center', color: '#999', marginTop: 50}}>No payment history found.</Text>}
       />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 20, fontWeight: 'bold' },
  
  summary: { padding: 20, backgroundColor: 'white', marginBottom: 10, alignItems: 'center' },
  
  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  propTitle: { fontWeight: 'bold', fontSize: 16 },
  amount: { fontWeight: 'bold', fontSize: 16, color: '#166534' },
  meta: { color: '#666', fontSize: 14 },
  date: { color: '#999', fontSize: 12 },
  
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: 10 },
  pill: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  pillText: { fontSize: 10, fontWeight: 'bold', color: '#555' },
  status: { fontSize: 10, fontWeight: 'bold', color: '#166534' }
});