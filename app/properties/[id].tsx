import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { 
  ActivityIndicator, Alert, Dimensions, Image, Modal, ScrollView, 
  StyleSheet, Text, TextInput, TouchableOpacity, View, Platform 
} from 'react-native';
import { createNotification } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';

// ⚠️ REPLACE WITH YOUR LOCAL IP (Same as your other files)
const API_URL = 'http://192.168.1.5:3000'; 

const { width, height } = Dimensions.get('window');

export default function PropertyDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // -- STATE --
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [landlordProfile, setLandlordProfile] = useState<any>(null);
  const [hasActiveOccupancy, setHasActiveOccupancy] = useState(false);
  const [occupiedPropertyTitle, setOccupiedPropertyTitle] = useState('');

  // Data State
  const [reviews, setReviews] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [showBookingOptions, setShowBookingOptions] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [bookingNote, setBookingNote] = useState('');

  // Modals
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllAmenities, setShowAllAmenities] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        loadProfile(session.user.id);
      }
    });
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      if (data.role === 'tenant') {
        checkActiveOccupancy(userId);
      }
    }
  };

  const checkActiveOccupancy = async (userId: string) => {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select('*, property:properties(title)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (data) {
      setHasActiveOccupancy(true);
      setOccupiedPropertyTitle(data.property?.title || 'a property');
    }
  };

  useEffect(() => {
    if (id) {
      loadProperty();
      loadReviews();
    }
  }, [id]);

  useEffect(() => {
    if (property?.landlord) {
      loadTimeSlots(property.landlord);
    }
  }, [property]);

  const loadProperty = async () => {
    setLoading(true);
    const { data: propertyData, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error || !propertyData) {
      setLoading(false);
      return;
    }

    setProperty(propertyData);
    if (propertyData.landlord) {
      const { data: landlordData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', propertyData.landlord)
        .maybeSingle();
      if (landlordData) setLandlordProfile(landlordData);
    }
    setLoading(false);
  };

  const loadReviews = async () => {
    const { data } = await supabase
      .from('reviews')
      .select('*, tenant:profiles!reviews_user_id_fkey(first_name, last_name, avatar_url)')
      .eq('property_id', id)
      .order('created_at', { ascending: false });
    if (data) setReviews(data);
  };

  const loadTimeSlots = async (landlordId: string) => {
    const { data } = await supabase
      .from('available_time_slots')
      .select('*')
      .eq('landlord_id', landlordId)
      .eq('is_booked', false)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });
    if (data) setTimeSlots(data);
  };

  // --- HELPER: Extract Coordinates (Ported from Next.js) ---
  const extractCoordinates = (link: string) => {
    if (!link) return null;
    const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const qMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    const placeMatch = link.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);

    const match = atMatch || qMatch || placeMatch;
    if (match) {
      return { lat: match[1], lng: match[2] };
    }
    return null;
  };

  // --- ACTIONS ---

  const handleOpenBooking = () => {
    if (!session) {
      Alert.alert('Login Required', 'You need to login first.', [{ text: 'OK', onPress: () => router.push('/') }]);
      return;
    }
    setShowBookingOptions(true);
  };

  const handleCancelBooking = () => {
    setShowBookingOptions(false);
    setSelectedSlotId('');
    setBookingNote('');
    setTermsAccepted(false);
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlotId) return Alert.alert('Error', 'Please select a viewing time.');
    setSubmitting(true);

    // 1. Check Active Occupancy
    const { data: activeOcc } = await supabase
      .from('tenant_occupancies')
      .select('id')
      .eq('property_id', id)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .maybeSingle();

    if (activeOcc) {
      setSubmitting(false);
      return Alert.alert('Error', 'You are currently occupying this property.');
    }

    // 2. Check Existing Booking
    const { data: globalActive } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant', session.user.id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted'])
      .maybeSingle();

    if (globalActive) {
      setSubmitting(false);
      return Alert.alert('Limit Reached', 'You already have an active viewing request. Cancel it first.');
    }

    // 3. Create Booking
    const slot = timeSlots.find(s => s.id === selectedSlotId);
    if (!slot) return;

    const { data: newBooking, error } = await supabase.from('bookings').insert({
      property_id: id,
      tenant: session.user.id,
      landlord: property.landlord,
      start_time: slot.start_time,
      end_time: slot.end_time,
      booking_date: slot.start_time,
      time_slot_id: slot.id,
      status: 'pending',
      notes: bookingNote || 'No message provided'
    }).select().single();

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      // 4. Update Slot
      await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', slot.id);

      // 5. Notifications (Supabase + API/SMS)
      if (property.landlord) {
        // In-App (Supabase)
        await createNotification(
          property.landlord,
          'new_booking',
          `${profile?.first_name || 'A tenant'} requested a viewing for ${property.title}.`,
          { actor: session.user.id }
        );

        // Notify API (Email/System)
        try {
          fetch(`${API_URL}/api/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'booking_new',
              recordId: newBooking.id,
              actorId: session.user.id
            })
          });
        } catch (e) { console.log('Notify API Error:', e); }

        // SMS Notification (Ported from Next.js)
        if (landlordProfile?.phone) {
          try {
            fetch(`${API_URL}/api/send-sms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: landlordProfile.phone,
                message: `EaseRent Alert: New viewing request from ${profile?.first_name || 'A Tenant'} for "${property.title}". Log in to review.`
              })
            });
          } catch (smsError) {
            console.log("Failed to send SMS:", smsError);
          }
        }
      }

      Alert.alert('Success', 'Viewing request sent successfully!');
      handleCancelBooking();
      router.push('/bookings');
    }
    setSubmitting(false);
  };

  const handleDirections = () => {
    if (!property) return;
    
    // Attempt to get coordinates from the location link (better accuracy)
    const coords = extractCoordinates(property.location_link);
    
    router.push({
      pathname: '/getDirections',
      params: {
        to: property.address + ', ' + property.city,
        lat: coords ? coords.lat : property.latitude || '',
        lng: coords ? coords.lng : property.longitude || '',
        auto: 'true'
      }
    } as any);
  };

  const openTerms = () => {
    const link = property.terms_conditions && property.terms_conditions.startsWith('http') 
      ? property.terms_conditions 
      : `${API_URL}/terms`; // Fallback
    Linking.openURL(link);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="black" /></View>;
  if (!property) return <View style={styles.center}><Text>Property not found</Text></View>;

  const images = property.images && property.images.length > 0 ? property.images : ['https://via.placeholder.com/600x400'];
  const isOwner = profile?.id === property.landlord;
  const isLandlordRole = profile?.role === 'landlord';

  // Stats calculation
  const avgRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : 'New';
  const cleanliness = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + (r.cleanliness_rating || r.rating), 0) / reviews.length).toFixed(1) : '-';
  const communication = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + (r.communication_rating || r.rating), 0) / reviews.length).toFixed(1) : '-';
  const locationRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + (r.location_rating || r.rating), 0) / reviews.length).toFixed(1) : '-';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* IMAGE CAROUSEL */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentImageIndex(idx);
            }}
          >
            {images.map((img: string, i: number) => (
              <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => setShowGalleryModal(true)}>
                <Image source={{ uri: img }} style={{ width, height: 350 }} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Overlay Back Button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>

          {/* Image Counter */}
          <View style={styles.imageCounter}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>{currentImageIndex + 1} / {images.length}</Text>
          </View>
        </View>

        <View style={styles.content}>

          {/* HEADER */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{property.title}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.statusBadge,
                property.status === 'available' ? { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' } :
                  property.status === 'occupied' ? { backgroundColor: '#eff6ff', borderColor: '#dbeafe' } :
                    { backgroundColor: '#fef2f2', borderColor: '#fee2e2' }
                ]}>
                  <View style={[styles.statusDot,
                  property.status === 'available' ? { backgroundColor: '#10b981' } :
                    property.status === 'occupied' ? { backgroundColor: '#3b82f6' } : { backgroundColor: '#ef4444' }
                  ]} />
                  <Text style={[styles.statusText,
                  property.status === 'available' ? { color: '#047857' } :
                    property.status === 'occupied' ? { color: '#1d4ed8' } : { color: '#b91c1c' }
                  ]}>
                    {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.price}>₱{Number(property.price).toLocaleString()}</Text>
              <Text style={styles.perMonth}>/mo</Text>
            </View>
          </View>

          <Text style={styles.address}>{property.address}, {property.city} {property.zip}</Text>

          {/* SPECS */}
          <View style={styles.specsContainer}>
            <View style={styles.specItem}>
              <Ionicons name="bed-outline" size={20} color="#333" />
              <View>
                <Text style={styles.specValue}>{property.bedrooms}</Text>
                <Text style={styles.specLabel}>Bedrooms</Text>
              </View>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specItem}>
              <Ionicons name="water-outline" size={20} color="#333" />
              <View>
                <Text style={styles.specValue}>{property.bathrooms}</Text>
                <Text style={styles.specLabel}>Bathrooms</Text>
              </View>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specItem}>
              <Ionicons name="resize-outline" size={20} color="#333" />
              <View>
                <Text style={styles.specValue}>{property.area_sqft}</Text>
                <Text style={styles.specLabel}>Sq. Ft.</Text>
              </View>
            </View>
          </View>

          {/* DESCRIPTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this property</Text>
            <Text style={styles.description}>{property.description || 'No description provided.'}</Text>
          </View>

          {/* REVIEWS SUMMARY */}
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Reviews <Text style={{ fontWeight: 'normal', fontSize: 14, color: '#666' }}>({reviews.length})</Text></Text>
            </View>

            {reviews.length > 0 ? (
              <View style={styles.ratingCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.bigRatingBox}>
                    <Ionicons name="star" size={24} color="#facc15" />
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={styles.bigRatingValue}>{avgRating}</Text>
                        <Text style={styles.bigRatingTotal}>/5</Text>
                      </View>
                      <Text style={styles.ratingLabel}>Overall</Text>
                    </View>
                  </View>
                  <View style={styles.catRatings}>
                    <View style={styles.catItem}>
                      <Ionicons name="sparkles-outline" size={14} color="#2563eb" />
                      <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{cleanliness}</Text>
                    </View>
                    <View style={styles.catItem}>
                      <Ionicons name="chatbubble-outline" size={14} color="#16a34a" />
                      <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{communication}</Text>
                    </View>
                    <View style={styles.catItem}>
                      <Ionicons name="location-outline" size={14} color="#ea580c" />
                      <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{locationRating}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyReviews}>
                <Ionicons name="star-outline" size={32} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 5 }}>No reviews yet</Text>
              </View>
            )}

            {/* REVIEW LIST */}
            {reviews.length > 0 && (
              <View style={{ marginTop: 15 }}>
                {(showAllReviews ? reviews : reviews.slice(0, 2)).map((rev, i) => (
                  <View key={i} style={styles.reviewItem}>
                    <View style={styles.rowBetween}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={styles.reviewAvatar}>
                          <Text style={{ fontWeight: 'bold', color: '#666' }}>{rev.tenant?.first_name?.charAt(0)}</Text>
                        </View>
                        <View>
                          <Text style={styles.reviewerName}>{rev.tenant?.first_name} {rev.tenant?.last_name}</Text>
                          <Text style={styles.reviewDate}>{new Date(rev.created_at).toLocaleDateString()}</Text>
                        </View>
                      </View>
                      <View style={styles.smallRatingBadge}>
                        <Ionicons name="star" size={10} color="#facc15" />
                        <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{rev.rating}</Text>
                      </View>
                    </View>
                    <Text style={styles.reviewText}>{rev.comment}</Text>
                  </View>
                ))}
                {reviews.length > 2 && (
                  <TouchableOpacity onPress={() => setShowAllReviews(!showAllReviews)} style={styles.showMoreBtn}>
                    <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{showAllReviews ? 'Show Less' : `Show all ${reviews.length} reviews`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* LOCATION PREVIEW */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.mapCard}>
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map" size={40} color="#ccc" />
                <Text style={{ color: '#666', marginTop: 5 }}>Map Preview</Text>
              </View>
              <View style={styles.mapFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="location-sharp" size={16} color="#666" />
                  <TouchableOpacity onPress={handleDirections}>
                    <Text style={styles.linkText}>GET DIRECTIONS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* LANDLORD & BOOKING ACTION */}
          <View style={styles.section}>
            <View style={styles.landlordCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                {landlordProfile?.avatar_url ? (
                  <Image source={{ uri: landlordProfile.avatar_url }} style={styles.landlordAvatar} />
                ) : (
                  <View style={styles.landlordAvatarPlaceholder}>
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>{landlordProfile?.first_name?.charAt(0)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{landlordProfile?.first_name} {landlordProfile?.last_name}</Text>
                  <Text style={{ color: '#666', fontSize: 12 }}>Property Owner</Text>
                </View>
              </View>

              {/* CONTACT INFO */}
              {(property.owner_phone || property.owner_email) && (
                <View style={{ marginBottom: 15, gap: 8 }}>
                  {property.owner_phone && (
                    <View style={styles.contactRow}>
                      <View style={styles.iconCircle}><Ionicons name="call" size={14} color="#666" /></View>
                      <Text onPress={() => Linking.openURL(`tel:${property.owner_phone}`)} style={{ fontWeight: '500' }}>{property.owner_phone}</Text>
                    </View>
                  )}
                  {/* Email Logic */}
                  {property.owner_email && (
                     <View style={styles.contactRow}>
                        <View style={styles.iconCircle}><Ionicons name="mail" size={14} color="#666" /></View>
                        <Text onPress={() => Linking.openURL(`mailto:${property.owner_email}`)} style={{ fontWeight: '500' }}>{property.owner_email}</Text>
                     </View>
                  )}
                </View>
              )}

              {/* ACTION LOGIC */}
              {isOwner ? (
                <View style={{ gap: 10 }}>
                  <View style={styles.infoBoxBlue}><Text style={styles.infoTextBlue}>You own this property.</Text></View>
                  <TouchableOpacity style={styles.btnBlack} onPress={() => router.push(`/properties/edit/${property.id}` as any)}>
                    <Text style={styles.btnTextWhite}>Edit Property</Text>
                  </TouchableOpacity>
                </View>
              ) : isLandlordRole ? (
                <View style={styles.infoBoxGray}><Text style={styles.infoTextGray}>Landlords cannot book viewings.</Text></View>
              ) : activeOccupancyCheck(hasActiveOccupancy, occupiedPropertyTitle) ? (
                <View style={styles.infoBoxYellow}>
                  <Text style={styles.infoTextYellowHeader}>Active Occupancy</Text>
                  <Text style={styles.infoTextYellow}>Assigned to {occupiedPropertyTitle}</Text>
                </View>
              ) : property.status !== 'available' ? (
                <View style={styles.infoBoxGray}><Text style={styles.infoTextGray}>Not available for booking.</Text></View>
              ) : (
                <View>
                  {!showBookingOptions ? (
                    <TouchableOpacity style={styles.btnBlack} onPress={handleOpenBooking}>
                      <Ionicons name="calendar" size={18} color="white" style={{ marginRight: 8 }} />
                      <Text style={styles.btnTextWhite}>Book Viewing</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.bookingForm}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.label}>SELECT SCHEDULE</Text>
                        <TouchableOpacity onPress={handleCancelBooking}><Ionicons name="close-circle" size={24} color="#ccc" /></TouchableOpacity>
                      </View>

                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
                        {timeSlots.length > 0 ? timeSlots.map(slot => (
                          <TouchableOpacity
                            key={slot.id}
                            style={[styles.slotCard, selectedSlotId === slot.id && styles.slotCardActive]}
                            onPress={() => setSelectedSlotId(slot.id)}
                          >
                            <Text style={[styles.slotDate, selectedSlotId === slot.id && { color: 'white' }]}>
                              {new Date(slot.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </Text>
                            <Text style={[styles.slotTime, selectedSlotId === slot.id && { color: 'white' }]}>
                              {new Date(slot.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </Text>
                          </TouchableOpacity>
                        )) : (
                          <Text style={{ color: 'red', fontSize: 12 }}>No slots available.</Text>
                        )}
                      </ScrollView>

                      <Text style={[styles.label, { marginTop: 10 }]}>MESSAGE (OPTIONAL)</Text>
                      <TextInput
                        style={styles.textArea}
                        multiline
                        numberOfLines={3}
                        placeholder="Any requests?"
                        value={bookingNote}
                        onChangeText={setBookingNote}
                      />

                      <TouchableOpacity style={styles.checkboxRow} onPress={() => setTermsAccepted(!termsAccepted)}>
                        <Ionicons name={termsAccepted ? "checkbox" : "square-outline"} size={20} color="black" />
                        <View style={{flexDirection:'row', flexWrap:'wrap'}}>
                            <Text style={{ fontSize: 12, marginLeft: 8 }}>I agree to </Text>
                            <TouchableOpacity onPress={openTerms}>
                                <Text style={{fontSize: 12, fontWeight: 'bold', textDecorationLine: 'underline'}}>Terms & Conditions</Text>
                            </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.btnBlack, (!termsAccepted || !selectedSlotId) && { backgroundColor: '#ccc' }]}
                        disabled={!termsAccepted || !selectedSlotId || submitting}
                        onPress={handleConfirmBooking}
                      >
                        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.btnTextWhite}>Confirm Booking</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* AMENITIES */}
          {property.amenities && property.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenities</Text>
              <View style={styles.amenitiesRow}>
                {(showAllAmenities ? property.amenities : property.amenities.slice(0, 6)).map((am: string, i: number) => (
                  <View key={i} style={styles.amenityBadge}>
                    <Text style={{ fontSize: 10, color: '#333' }}>{am}</Text>
                  </View>
                ))}
              </View>
              {property.amenities.length > 6 && (
                <TouchableOpacity onPress={() => setShowAllAmenities(!showAllAmenities)} style={{ marginTop: 5 }}>
                  <Text style={styles.linkText}>{showAllAmenities ? 'Show Less' : `+${property.amenities.length - 6} more`}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ height: 50 }} />
        </View>
      </ScrollView>

      {/* GALLERY MODAL */}
      <Modal visible={showGalleryModal} transparent={true} animationType="fade">
        <View style={styles.galleryModal}>
          <TouchableOpacity style={styles.galleryClose} onPress={() => setShowGalleryModal(false)}>
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <View style={styles.galleryCounter}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>{currentImageIndex + 1} / {images.length}</Text>
          </View>

          <ScrollView
            horizontal pagingEnabled
            onMomentumScrollEnd={(e) => {
              setCurrentImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))
            }}
          >
            {images.map((img: string, i: number) => (
              <View key={i} style={{ width, height, justifyContent: 'center' }}>
                <Image source={{ uri: img }} style={{ width, height: 500 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

function activeOccupancyCheck(hasActive: boolean, title: string) {
  if (hasActive) return true;
  return false;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },

  // Image
  imageContainer: { width: '100%', height: 350, position: 'relative' },
  backBtn: { position: 'absolute', top: 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: 'black', elevation: 5 },
  imageCounter: { position: 'absolute', bottom: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },

  // Header
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111', lineHeight: 28, marginBottom: 5 },
  price: { fontSize: 24, fontWeight: '900', color: '#111' },
  perMonth: { fontSize: 12, color: '#666', textAlign: 'right' },
  address: { fontSize: 14, color: '#666', marginBottom: 20 },

  badgeRow: { flexDirection: 'row', gap: 5, marginTop: 5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },

  // Specs
  specsContainer: { flexDirection: 'row', backgroundColor: 'white', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#eee', justifyContent: 'space-around', marginBottom: 20 },
  specItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specValue: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  specLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase' },
  specDivider: { width: 1, height: '100%', backgroundColor: '#eee' },

  // Section
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', color: '#111', marginBottom: 10, letterSpacing: 0.5 },
  description: { fontSize: 14, lineHeight: 22, color: '#444' },

  // Reviews
  ratingCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  bigRatingBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bigRatingValue: { fontSize: 28, fontWeight: '900', color: '#111' },
  bigRatingTotal: { fontSize: 16, color: '#ccc' },
  ratingLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase' },
  catRatings: { flexDirection: 'row', gap: 15 },
  catItem: { alignItems: 'center', gap: 2 },
  emptyReviews: { alignItems: 'center', padding: 20, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  reviewItem: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  reviewerName: { fontSize: 12, fontWeight: 'bold' },
  reviewDate: { fontSize: 10, color: '#999' },
  smallRatingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fefce8', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, gap: 2 },
  reviewText: { fontSize: 12, color: '#444', marginTop: 8, lineHeight: 18 },
  showMoreBtn: { alignSelf: 'center', padding: 10, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 10, width: '100%', alignItems: 'center', backgroundColor: 'white' },

  // Map
  mapCard: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
  mapPlaceholder: { height: 150, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' },
  mapFooter: { padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  linkText: { fontSize: 10, fontWeight: 'bold', textDecorationLine: 'underline' },

  // Landlord & Booking
  landlordCard: { backgroundColor: 'white', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  landlordAvatar: { width: 40, height: 40, borderRadius: 20 },
  landlordAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },

  infoBoxBlue: { backgroundColor: '#eff6ff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe', marginBottom: 10 },
  infoTextBlue: { color: '#1e40af', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  infoBoxGray: { backgroundColor: '#f3f4f6', padding: 10, borderRadius: 8, marginBottom: 10 },
  infoTextGray: { color: '#666', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  infoBoxYellow: { backgroundColor: '#fefce8', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fef9c3', marginBottom: 10 },
  infoTextYellowHeader: { color: '#854d0e', fontSize: 12, fontWeight: 'bold' },
  infoTextYellow: { color: '#a16207', fontSize: 12 },

  btnBlack: { backgroundColor: 'black', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnTextWhite: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  bookingForm: { backgroundColor: '#f9fafb', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  slotCard: { backgroundColor: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eee', marginRight: 8, minWidth: 100 },
  slotCardActive: { backgroundColor: 'black', borderColor: 'black' },
  slotDate: { fontSize: 10, fontWeight: 'bold', color: '#666' },
  slotTime: { fontSize: 12, fontWeight: 'bold', color: '#333' },
  label: { fontSize: 10, fontWeight: 'bold', color: '#666', letterSpacing: 0.5 },
  textArea: { backgroundColor: 'white', borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, height: 80, marginVertical: 10, textAlignVertical: 'top' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },

  // Amenities
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenityBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },

  // Gallery Modal
  galleryModal: { flex: 1, backgroundColor: 'black' },
  galleryClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  galleryCounter: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
});