import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions, Image, Modal,
    RefreshControl,
    ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

export default function AllProperties() {
    const router = useRouter();
    const params = useLocalSearchParams();

    // -- STATE --
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [session, setSession] = useState<any>(null);

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [priceRange, setPriceRange] = useState({ min: '', max: '' });
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
    const [minRating, setMinRating] = useState(0); // Ported
    const [filterMostFavorite, setFilterMostFavorite] = useState(false); // Ported
    const [sortBy, setSortBy] = useState('newest'); // newest, price_asc, price_desc, rating

    // Comparison & Favorites
    const [comparisonList, setComparisonList] = useState<any[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [propertyStats, setPropertyStats] = useState<any>({});

    // UI State
    const [showFilterModal, setShowFilterModal] = useState(false);

    const availableAmenities = [
        'Wifi', 'Air Condition', 'Washing Machine', 'Parking',
        'Hot Shower', 'Bathroom', 'Smoke Alarm', 'Veranda',
        'Fire Extinguisher', 'Outside Garden', 'Furnished',
        'Semi-Furnished', 'Pet Friendly', 'Kitchen', 'Smart TV'
    ];

    useEffect(() => {
        checkAuthAndLoad();
    }, []);

    const checkAuthAndLoad = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        loadProperties(session?.user?.id);
    };

    const loadProperties = async (userId?: string) => {
        setLoading(true);
        try {
            // 1. Fetch Properties
            const { data: props, error } = await supabase
                .from('properties')
                .select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)')
                .eq('is_deleted', false)
                .eq('status', 'available'); // Only show available by default? Next.js shows all but badges them.

            if (error) throw error;

            // 2. Fetch Stats (Ratings, Counts)
            const { data: stats } = await supabase.from('property_stats').select('*');
            const statsMap: any = {};
            if (stats) {
                stats.forEach((s: any) => { statsMap[s.property_id] = s; });
            }
            setPropertyStats(statsMap);

            // 3. Fetch User Favorites
            if (userId) {
                const { data: favs } = await supabase.from('favorites').select('property_id').eq('user_id', userId);
                if (favs) setFavorites(favs.map((f: any) => f.property_id));
            }

            setProperties(props || []);

        } catch (err: any) {
            console.error('Error loading properties:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // --- ACTIONS ---

    const toggleFavorite = async (propId: string) => {
        if (!session) return Alert.alert('Sign In Required', 'Please sign in to save favorites.');

        const isFav = favorites.includes(propId);
        let newFavs = [...favorites];

        if (isFav) {
            newFavs = newFavs.filter(id => id !== propId);
            setFavorites(newFavs);
            await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propId);
        } else {
            newFavs.push(propId);
            setFavorites(newFavs);
            await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propId });
        }
    };

    const toggleCompare = (property: any) => {
        setComparisonList(prev => {
            const exists = prev.find(p => p.id === property.id);
            if (exists) {
                return prev.filter(p => p.id !== property.id);
            } else {
                if (prev.length >= 3) {
                    Alert.alert('Limit Reached', 'You can compare up to 3 properties.');
                    return prev;
                }
                return [...prev, property];
            }
        });
    };

    const toggleAmenity = (amenity: string) => {
        setSelectedAmenities(prev =>
            prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
        );
    };

    const clearFilters = () => {
        setPriceRange({ min: '', max: '' });
        setSelectedAmenities([]);
        setMinRating(0);
        setFilterMostFavorite(false);
        setSortBy('newest');
    };

    // --- FILTERING LOGIC (Ported from Next.js) ---
    const getFilteredProperties = () => {
        return properties.filter(item => {
            const stats = propertyStats[item.id] || { avg_rating: 0, review_count: 0, favorite_count: 0 };

            // Search
            const matchSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.city?.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchSearch) return false;

            // Price
            if (priceRange.min && item.price < parseFloat(priceRange.min)) return false;
            if (priceRange.max && item.price > parseFloat(priceRange.max)) return false;

            // Amenities (AND logic)
            if (selectedAmenities.length > 0) {
                const itemAmenities = item.amenities || [];
                const hasAll = selectedAmenities.every(a => itemAmenities.includes(a));
                if (!hasAll) return false;
            }

            // Rating
            if (minRating > 0 && (stats.avg_rating || 0) < minRating) return false;

            // Favorites Filter
            if (filterMostFavorite && (stats.favorite_count || 0) < 1) return false;

            return true;
        }).sort((a, b) => {
            const statsA = propertyStats[a.id] || {};
            const statsB = propertyStats[b.id] || {};

            switch (sortBy) {
                case 'price_asc': return a.price - b.price;
                case 'price_desc': return b.price - a.price;
                case 'rating': return (statsB.avg_rating || 0) - (statsA.avg_rating || 0);
                default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });
    };

    const filteredData = getFilteredProperties();

    // --- RENDERERS ---

    const renderCard = (item: any) => {
        const stats = propertyStats[item.id] || { avg_rating: 0, review_count: 0, favorite_count: 0 };
        const isFav = favorites.includes(item.id);
        const isCompare = comparisonList.some(c => c.id === item.id);

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

                    {/* Badges */}
                    <View style={styles.badgeContainer}>
                        <View style={[styles.badge, { backgroundColor: item.status === 'available' ? 'white' : '#fee2e2' }]}>
                            <Text style={[styles.badgeText, { color: item.status === 'available' ? 'black' : '#ef4444' }]}>
                                {item.status === 'available' ? 'AVAILABLE' : 'OCCUPIED'}
                            </Text>
                        </View>
                        {stats.favorite_count > 0 && (
                            <View style={[styles.badge, { backgroundColor: '#f43f5e', borderWidth: 0 }]}>
                                <Ionicons name="heart" size={10} color="white" />
                                <Text style={[styles.badgeText, { color: 'white', marginLeft: 2 }]}>{stats.favorite_count}</Text>
                            </View>
                        )}
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id); }} style={styles.iconBtn}>
                            <Ionicons name={isFav ? "heart" : "heart-outline"} size={18} color={isFav ? "#ef4444" : "#333"} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); toggleCompare(item); }}
                            style={[styles.iconBtn, isCompare && { backgroundColor: 'black' }]}
                        >
                            <Ionicons name={isCompare ? "checkmark" : "git-compare-outline"} size={18} color={isCompare ? "white" : "#333"} />
                        </TouchableOpacity>
                    </View>

                    {/* Price Overlay */}
                    <View style={styles.priceOverlay}>
                        <Text style={styles.priceText}>₱{item.price.toLocaleString()}</Text>
                        <Text style={styles.periodText}>/mo</Text>
                    </View>
                </View>

                <View style={styles.cardContent}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.cardAddress} numberOfLines={1}>{item.city}</Text>
                        </View>
                        {/* Rating */}
                        {stats.review_count > 0 && (
                            <View style={styles.ratingBox}>
                                <Ionicons name="star" size={12} color="#fbbf24" />
                                <Text style={{ fontSize: 12, fontWeight: 'bold', marginLeft: 2 }}>{stats.avg_rating.toFixed(1)}</Text>
                                <Text style={{ fontSize: 10, color: '#666', marginLeft: 1 }}>({stats.review_count})</Text>
                            </View>
                        )}
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
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header & Search */}
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color="#666" />
                    <TextInput
                        placeholder="Search city, title..."
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
                <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilterModal(true)}>
                    <Ionicons name="options-outline" size={24} color="black" />
                </TouchableOpacity>
            </View>

            {/* Active Filters Horizontal Scroll */}
            {(selectedAmenities.length > 0 || minRating > 0 || filterMostFavorite) && (
                <View style={{ height: 50 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center', gap: 8 }}>
                        {filterMostFavorite && (
                            <View style={styles.activeFilterChip}>
                                <Text style={styles.activeFilterText}>♥ Guest Favorites</Text>
                                <TouchableOpacity onPress={() => setFilterMostFavorite(false)}><Ionicons name="close" size={12} color="white" /></TouchableOpacity>
                            </View>
                        )}
                        {minRating > 0 && (
                            <View style={styles.activeFilterChip}>
                                <Text style={styles.activeFilterText}>★ {minRating}+</Text>
                                <TouchableOpacity onPress={() => setMinRating(0)}><Ionicons name="close" size={12} color="white" /></TouchableOpacity>
                            </View>
                        )}
                        {selectedAmenities.map(a => (
                            <View key={a} style={styles.activeFilterChip}>
                                <Text style={styles.activeFilterText}>{a}</Text>
                                <TouchableOpacity onPress={() => toggleAmenity(a)}><Ionicons name="close" size={12} color="white" /></TouchableOpacity>
                            </View>
                        ))}
                        <TouchableOpacity onPress={clearFilters}>
                            <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: 'bold', marginLeft: 5 }}>Clear All</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* Main Content */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="black" /></View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadProperties(session?.user?.id)} />}
                >
                    <Text style={styles.resultCount}>{filteredData.length} Properties Found</Text>
                    {filteredData.map(renderCard)}
                    {filteredData.length === 0 && (
                        <View style={styles.center}>
                            <Ionicons name="home-outline" size={48} color="#ddd" />
                            <Text style={{ color: '#999', marginTop: 10 }}>No properties match your filters.</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Comparison Floating Button */}
            {comparisonList.length > 0 && (
                <TouchableOpacity
                    style={styles.compareFloatBtn}
                    onPress={() => router.push({ pathname: '/compare', params: { ids: comparisonList.map(c => c.id).join(',') } })}
                >
                    <View style={styles.compareCount}><Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{comparisonList.length}</Text></View>
                    <Ionicons name="git-compare-outline" size={20} color="white" style={{ marginRight: 8 }} />
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Compare Selected</Text>
                </TouchableOpacity>
            )}

            {/* Filter Modal */}
            <Modal visible={showFilterModal} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Filters</Text>
                        <TouchableOpacity onPress={() => setShowFilterModal(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>

                        {/* Sort By */}
                        <Text style={styles.filterLabel}>Sort By</Text>
                        <View style={styles.chipContainer}>
                            {['newest', 'price_asc', 'price_desc', 'rating'].map(opt => (
                                <TouchableOpacity key={opt} onPress={() => setSortBy(opt)} style={[styles.chip, sortBy === opt && styles.chipActive]}>
                                    <Text style={[styles.chipText, sortBy === opt && { color: 'white' }]}>
                                        {opt === 'price_asc' ? 'Price: Low to High' : opt === 'price_desc' ? 'Price: High to Low' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Special Filters */}
                        <Text style={styles.filterLabel}>Special</Text>
                        <View style={styles.chipContainer}>
                            <TouchableOpacity onPress={() => setFilterMostFavorite(!filterMostFavorite)} style={[styles.chip, filterMostFavorite && styles.chipActive]}>
                                <Ionicons name="heart" size={14} color={filterMostFavorite ? 'white' : 'black'} style={{ marginRight: 4 }} />
                                <Text style={[styles.chipText, filterMostFavorite && { color: 'white' }]}>Guest Favorites</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Rating */}
                        <Text style={styles.filterLabel}>Minimum Rating</Text>
                        <View style={styles.chipContainer}>
                            {[0, 3, 4, 4.5].map(r => (
                                <TouchableOpacity key={r} onPress={() => setMinRating(r)} style={[styles.chip, minRating === r && styles.chipActive]}>
                                    <Text style={[styles.chipText, minRating === r && { color: 'white' }]}>{r === 0 ? 'Any' : `${r}+ Stars`}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Price Range */}
                        <Text style={styles.filterLabel}>Price Range (₱)</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                            <TextInput
                                style={styles.input} placeholder="Min" keyboardType="numeric"
                                value={priceRange.min} onChangeText={t => setPriceRange(p => ({ ...p, min: t }))}
                            />
                            <TextInput
                                style={styles.input} placeholder="Max" keyboardType="numeric"
                                value={priceRange.max} onChangeText={t => setPriceRange(p => ({ ...p, max: t }))}
                            />
                        </View>

                        {/* Amenities */}
                        <Text style={styles.filterLabel}>Amenities</Text>
                        <View style={styles.chipContainer}>
                            {availableAmenities.map(a => (
                                <TouchableOpacity key={a} onPress={() => toggleAmenity(a)} style={[styles.chip, selectedAmenities.includes(a) && styles.chipActive]}>
                                    <Text style={[styles.chipText, selectedAmenities.includes(a) && { color: 'white' }]}>{a}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={{ height: 50 }} />
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        <TouchableOpacity onPress={clearFilters} style={{ padding: 15 }}><Text style={{ fontWeight: 'bold', color: '#666' }}>Clear</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowFilterModal(false)} style={styles.applyBtn}>
                            <Text style={{ color: 'white', fontWeight: 'bold' }}>Show {filteredData.length} Homes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: { flexDirection: 'row', padding: 20, gap: 10, alignItems: 'center', backgroundColor: 'white' },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 15, height: 45, borderRadius: 12 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14 },
    filterBtn: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee' },

    resultCount: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 10 },

    activeFilterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'black', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, gap: 5 },
    activeFilterText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    // Card Styles
    card: { backgroundColor: 'white', borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, overflow: 'hidden' },
    imageContainer: { height: 220, position: 'relative' },
    cardImage: { width: '100%', height: '100%' },
    gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },

    badgeContainer: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    badgeText: { fontSize: 10, fontWeight: 'bold' },

    actionsContainer: { position: 'absolute', top: 12, right: 12, flexDirection: 'column', gap: 8 },
    iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },

    priceOverlay: { position: 'absolute', bottom: 12, left: 12 },
    priceText: { color: 'white', fontSize: 20, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
    periodText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 'bold' },

    cardContent: { padding: 15 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
    cardAddress: { fontSize: 12, color: '#666', marginTop: 2 },
    ratingBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },

    metaBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    metaText: { fontSize: 12, color: '#444', fontWeight: '500' },

    // Floating Compare Button
    compareFloatBtn: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, zIndex: 100 },
    compareCount: { backgroundColor: '#ef4444', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -5, right: -5, borderWidth: 2, borderColor: '#111' },

    // Filter Modal
    modalContainer: { flex: 1, backgroundColor: 'white' },
    modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    filterLabel: { fontSize: 12, fontWeight: 'bold', color: '#666', textTransform: 'uppercase', marginBottom: 10, marginTop: 10 },
    chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'white', flexDirection: 'row', alignItems: 'center' },
    chipActive: { backgroundColor: 'black', borderColor: 'black' },
    chipText: { fontSize: 12, fontWeight: 'bold', color: '#333' },
    input: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 10, backgroundColor: '#f9fafb' },

    modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    applyBtn: { backgroundColor: 'black', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
});
