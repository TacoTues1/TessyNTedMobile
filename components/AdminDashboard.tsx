import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  Dimensions,
  TextInput,
  FlatList
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, properties: 0, bookings: 0, revenue: 0 });
  const [users, setUsers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [usersRes, propsRes, bookingsRes, paymentsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('is_deleted', false),
        supabase.from('properties').select('*').eq('is_deleted', false),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('payment_requests').select('rent_amount, water_bill, electrical_bill, other_bills').in('status', ['paid', 'completed', 'confirmed'])
      ]);

      const totalRevenue = paymentsRes.data?.reduce((sum, p) => {
        return sum + (p.rent_amount || 0) + (p.water_bill || 0) + (p.electrical_bill || 0) + (p.other_bills || 0);
      }, 0) || 0;

      setStats({
        users: usersRes.data?.length || 0,
        properties: propsRes.data?.length || 0,
        bookings: bookingsRes.count || 0,
        revenue: totalRevenue
      });

      setUsers(usersRes.data || []);
      setProperties(propsRes.data || []);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Business Overview</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Users" value={stats.users} icon="people" color="#3b82f6" />
        <StatCard label="Properties" value={stats.properties} icon="business" color="#a855f7" />
        <StatCard label="Bookings" value={stats.bookings} icon="calendar" color="#f97316" />
        <StatCard label="Revenue" value={`₱${stats.revenue.toLocaleString()}`} icon="cash" color="#22c55e" />
      </View>
      
      <TouchableOpacity 
        style={styles.actionButton}
        onPress={() => Alert.alert("Automation", "Triggering monthly statements...")}
      >
        <Ionicons name="mail-outline" size={20} color="white" />
        <Text style={styles.actionButtonText}>Send Monthly Statements</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUsers = () => (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>User Management</Text>
      {users.map((user) => (
        <View key={user.id} style={styles.listItem}>
          <View>
            <Text style={styles.itemTitle}>{user.first_name} {user.last_name}</Text>
            <Text style={styles.itemSubtitle}>{user.role.toUpperCase()} • {user.email}</Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert("Edit User", `ID: ${user.id}`)}>
            <Ionicons name="create-outline" size={20} color="black" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderProperties = () => (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Listing Directory</Text>
      {properties.map((prop) => (
        <View key={prop.id} style={styles.listItem}>
          <View>
            <Text style={styles.itemTitle}>{prop.title}</Text>
            <Text style={styles.itemSubtitle}>{prop.city} • ₱{prop.price?.toLocaleString()}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: prop.status === 'available' ? '#dcfce7' : '#fee2e2' }]}>
            <Text style={{ fontSize: 10, color: prop.status === 'available' ? '#166534' : '#991b1b' }}>{prop.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color="black" /></View>;

  return (
    <View style={styles.mainWrapper}>
      {/* Tab Navigation */}
      <View style={styles.topNav}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
          {['overview', 'users', 'properties', 'payments'].map((t) => (
            <TouchableOpacity 
              key={t} 
              onPress={() => setActiveTab(t)}
              style={[styles.tabButton, activeTab === t && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'properties' && renderProperties()}
      </ScrollView>
    </View>
  );
}

// Reusable Components
const StatCard = ({ label, value, icon, color }: any) => (
  <View style={styles.statCard}>
    <View style={[styles.iconCircle, { backgroundColor: color }]}>
      <Ionicons name={icon} size={20} color="white" />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topNav: { backgroundColor: 'black', paddingTop: 50, paddingBottom: 10 },
  tabButton: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  tabButtonActive: { backgroundColor: 'white' },
  tabText: { color: '#9ca3af', fontWeight: 'bold' },
  tabTextActive: { color: 'black' },
  container: { padding: 20 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { 
    backgroundColor: 'white', 
    width: (width - 50) / 2, 
    padding: 15, 
    borderRadius: 20, 
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f3f4f6'
  },
  iconCircle: { width: 35, height: 35, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280' },
  actionButton: { 
    backgroundColor: 'black', 
    flexDirection: 'row', 
    padding: 18, 
    borderRadius: 15, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 20,
    gap: 10 
  },
  actionButtonText: { color: 'white', fontWeight: 'bold' },
  listItem: { 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 15, 
    marginBottom: 10, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6'
  },
  itemTitle: { fontWeight: 'bold', fontSize: 16 },
  itemSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }
});