import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Dimensions, Image,
    RefreshControl,
    ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

export default function LandlordProperties() {
    const router = useRouter();

    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [session, setSession] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        checkAuthAndLoad();
    }, []);

    const checkAuthAndLoad = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return router.replace('/');
        setSession(session);
        loadProperties(session.user.id);
    };

    const loadProperties = async (userId: string) => {
        setLoading(true);
        try {
            const { data: props, error } = await supabase
                .from('properties')
                .select('*')
                .eq('landlord', userId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProperties(props || []);
        } catch (err: any) {
            console.error('Error loading properties:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        if (session?.user?.id) loadProperties(session.user.id);
    };

    const getFilteredProperties = () => {
        let filtered = properties;

        if (statusFilter !== 'all') {
            filtered = filtered.filter(p => p.status === statusFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                (p.title || '').toLowerCase().includes(q) ||
                (p.address || '').toLowerCase().includes(q) ||
                (p.city || '').toLowerCase().includes(q)
            );
        }

        return filtered;
    };

    const filteredData = getFilteredProperties();

    const totalCount = properties.length;
    const availableCount = properties.filter(p => p.status === 'available').length;
    const occupiedCount = properties.filter(p => p.status === 'occupied').length;

    const STATUS_FILTERS = ['all', 'available', 'occupied'];

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'available':
                return { bg: '#ecfdf5', color: '#059669', label: 'Available' };
            case 'occupied':
                return { bg: '#fef2f2', color: '#ef4444', label: 'Occupied' };
            default:
                return { bg: '#f3f4f6', color: '#6b7280', label: status?.toUpperCase() || 'Unknown' };
        }
    };

    const renderCard = (item: any) => {
        const statusInfo = getStatusStyle(item.status);

        return (
            <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => router.push(`/properties/${item.id}` as any)}
                activeOpacity={0.9}
            >
                <View style={styles.imageContainer}>
                    <Image source={{ uri: item.images?.[0] || 'https://via.placeholder.com/400' }} style={styles.cardImage} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.gradient} />

                    {/* Status Badge */}
                    <View style={styles.badgeContainer}>
                        <View style={[styles.badge, { backgroundColor: statusInfo.bg }]}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusInfo.color, marginRight: 4 }} />
                            <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                        </View>
                    </View>

                    {/* Price Overlay */}
                    <View style={styles.priceOverlay}>
                        <Text style={styles.priceText}>₱{(item.price || 0).toLocaleString()}</Text>
                        <Text style={styles.periodText}>/mo</Text>
                    </View>
                </View>

                <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={12} color="#9ca3af" />
                        <Text style={styles.cardAddress} numberOfLines={1}>{item.address}, {item.city}</Text>
                    </View>

                    <View style={styles.metaBox}>
                        <Ionicons name="bed-outline" size={14} color="#666" />
                        <Text style={styles.metaText}>{item.bedrooms} Beds</Text>
                        <Text style={{ color: '#ddd' }}>|</Text>
                        <Ionicons name="water-outline" size={14} color="#666" />
                        <Text style={styles.metaText}>{item.bathrooms} Bath</Text>
                        <Text style={{ color: '#ddd' }}>|</Text>
                        <Ionicons name="resize-outline" size={14} color="#666" />
                        <Text style={styles.metaText}>{item.area_sqft} sqm</Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={(e) => { e.stopPropagation(); router.push(`/properties/${item.id}` as any); }}
                        >
                            <Ionicons name="eye-outline" size={14} color="#111" />
                            <Text style={styles.actionBtnText}>View</Text>
                        </TouchableOpacity>

                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {loading ? (
                <ActivityIndicator size="large" color="#111" style={{ marginTop: 50 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={22} color="#111" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>My Properties</Text>
                            <Text style={styles.headerSub}>{totalCount} total properties</Text>
                        </View>
                    </View>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statBox, { borderColor: '#ecfdf5' }]}>
                            <Text style={[styles.statNum, { color: '#059669' }]}>{availableCount}</Text>
                            <Text style={styles.statLabel}>Available</Text>
                        </View>
                        <View style={[styles.statBox, { borderColor: '#fef2f2' }]}>
                            <Text style={[styles.statNum, { color: '#ef4444' }]}>{occupiedCount}</Text>
                            <Text style={styles.statLabel}>Occupied</Text>
                        </View>
                        <View style={[styles.statBox, { borderColor: '#f3f4f6' }]}>
                            <Text style={[styles.statNum, { color: '#111' }]}>{totalCount}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                    </View>

                    {/* Search */}
                    <View style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={18} color="#9ca3af" />
                            <TextInput
                                placeholder="Search your properties..."
                                placeholderTextColor="#c4c4c4"
                                style={styles.searchInput}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={18} color="#ccc" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Filters */}
                    <View style={styles.filterRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center', paddingVertical: 10 }}>
                            {STATUS_FILTERS.map(f => (
                                <TouchableOpacity
                                    key={f}
                                    onPress={() => setStatusFilter(f)}
                                    style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
                                >
                                    <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
                                        {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Property Cards */}
                    {filteredData.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIcon}>
                                <Ionicons name="home-outline" size={40} color="#d1d5db" />
                            </View>
                            <Text style={styles.emptyTitle}>No properties yet</Text>
                            <Text style={styles.emptySubtitle}>Add your first property from the dashboard.</Text>
                        </View>
                    ) : (
                        filteredData.map(renderCard)
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
    headerSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

    statsRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 10, backgroundColor: 'white' },
    statBox: { flex: 1, backgroundColor: '#fafafa', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1.5 },
    statNum: { fontSize: 22, fontWeight: '900' },
    statLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },

    searchContainer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        borderRadius: 14, borderWidth: 1.5, borderColor: '#e5e7eb', paddingHorizontal: 14, height: 44, gap: 8
    },
    searchInput: { flex: 1, fontSize: 14, color: '#111' },

    filterRow: {},
    filterChip: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        marginRight: 8, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: 'white'
    },
    filterChipActive: { backgroundColor: '#111', borderColor: '#111' },
    filterChipText: { fontSize: 12, fontWeight: '700', color: '#666' },
    filterChipTextActive: { color: 'white' },

    scrollContent: { paddingBottom: 20 },

    card: {
        backgroundColor: 'white', borderRadius: 20, overflow: 'hidden',
        marginBottom: 16, marginHorizontal: 20, borderWidth: 1, borderColor: '#f3f4f6',
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
    },
    imageContainer: { width: '100%', height: 180, position: 'relative' },
    cardImage: { width: '100%', height: '100%' },
    gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },

    badgeContainer: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 },
    badge: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
    },
    badgeText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },

    priceOverlay: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'baseline' },
    priceText: { fontSize: 22, fontWeight: '900', color: 'white' },
    periodText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginLeft: 2 },

    cardContent: { padding: 14 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    cardAddress: { fontSize: 12, color: '#9ca3af', flex: 1 },

    metaBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    metaText: { fontSize: 12, color: '#666' },

    actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: 'white'
    },
    actionBtnPrimary: { backgroundColor: '#111', borderColor: '#111' },
    actionBtnText: { fontSize: 12, fontWeight: '700', color: '#111' },
    actionBtnTextPrimary: { color: 'white' },

    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    emptySubtitle: { fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
});
