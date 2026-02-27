import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  ScrollView, StyleSheet,
  Text, TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

export default function NewProperty() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingTerms, setUploadingTerms] = useState(false); // New: PDF State
  const [showAllAmenities, setShowAllAmenities] = useState(false); // New: Amenities Toggle

  const [form, setForm] = useState({
    title: '',
    description: '',
    building_no: '',
    street: '',
    address: '',
    city: '',
    zip: '',
    location_link: '',
    owner_phone: '',
    owner_email: '',
    price: '',
    utilities_cost: '',
    internet_cost: '',
    association_dues: '',
    bedrooms: '1',
    bathrooms: '1',
    area_sqft: '',
    status: 'available',
    terms_conditions: '',
    amenities: [] as string[],
    images: [] as string[]
  });

  const availableAmenities = [
    'Wifi', 'Air Condition', 'Washing Machine', 'Parking',
    'Hot Shower', 'Bathroom', 'Smoke Alarm', 'Veranda',
    'Fire Extinguisher', 'Outside Garden', 'Furnished',
    'Semi-Furnished', 'Pet Friendly', 'Kitchen', 'Smart TV',
    'Pool', 'Elevator', 'Gym', 'Security', 'Balcony'
  ];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/');
      setSession(session);
    });
  }, []);

  // --- IMAGE UPLOAD ---
  const pickImage = async () => {
    if (form.images.length >= 10) return Alert.alert('Limit Reached', 'Max 10 images allowed');

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadImage(result.assets[0]);
    }
  };

  const uploadImage = async (imageAsset: any) => {
    try {
      setUploading(true);
      const fileExt = imageAsset.uri.split('.').pop();
      const fileName = `${session?.user?.id}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from('property-images')
        .upload(fileName, decode(imageAsset.base64), { contentType: imageAsset.mimeType || 'image/jpeg' });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('property-images').getPublicUrl(fileName);
      setForm(prev => ({ ...prev, images: [...prev.images, publicUrl] }));
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...form.images];
    newImages.splice(index, 1);
    setForm({ ...form, images: newImages });
  };

  // --- PDF UPLOAD (Ported) ---
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        if (file.size && file.size > 10 * 1024 * 1024) {
          Alert.alert('Error', 'File size must be less than 10MB');
          return;
        }
        uploadTerms(file);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const uploadTerms = async (file: any) => {
    try {
      setUploadingTerms(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${session?.user?.id}/terms-${Date.now()}.${fileExt}`;
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });

      const { error } = await supabase.storage
        .from('property-documents')
        .upload(fileName, decode(base64), { contentType: 'application/pdf' });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('property-documents').getPublicUrl(fileName);
      setForm(prev => ({ ...prev, terms_conditions: publicUrl }));
      Alert.alert('Success', 'Terms PDF uploaded!');
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploadingTerms(false);
    }
  };

  // --- SUBMIT ---
  const handleSubmit = async () => {
    if (!form.title || !form.price || !form.street || !form.city) {
      return Alert.alert('Missing Fields', 'Please fill in Title, Price, Street, and City.');
    }

    setLoading(true);
    const sanitize = (val: string) => (val === '' ? 0 : parseFloat(val));

    const payload = {
      ...form,
      landlord: session.user.id,
      price: sanitize(form.price),
      utilities_cost: sanitize(form.utilities_cost),
      internet_cost: sanitize(form.internet_cost),
      association_dues: sanitize(form.association_dues),
      bedrooms: sanitize(form.bedrooms),
      bathrooms: sanitize(form.bathrooms),
      area_sqft: sanitize(form.area_sqft),
      images: form.images.length > 0 ? form.images : null
    };

    const { error } = await supabase.from('properties').insert(payload);

    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('Success', 'Property listed successfully!');
      router.replace('/(tabs)/landlordproperties');
    }
  };

  const toggleAmenity = (amenity: string) => {
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <Text style={styles.header}>New Property</Text>
        <Text style={styles.subHeader}>Create a new listing.</Text>

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.label}>PROPERTY TITLE *</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="e.g. Modern Loft"
            value={form.title}
            onChangeText={t => setForm({ ...form, title: t })}
          />
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 10 }]} placeholder="Bldg No." value={form.building_no} onChangeText={t => setForm({ ...form, building_no: t })} />
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="Street *" value={form.street} onChangeText={t => setForm({ ...form, street: t })} />
          </View>
          <TextInput style={styles.input} placeholder="Barangay/Address *" value={form.address} onChangeText={t => setForm({ ...form, address: t })} />
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 10 }]} placeholder="City *" value={form.city} onChangeText={t => setForm({ ...form, city: t })} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Zip" value={form.zip} onChangeText={t => setForm({ ...form, zip: t })} />
          </View>
          <TextInput style={styles.input} placeholder="Google Map Link" value={form.location_link} onChangeText={t => setForm({ ...form, location_link: t })} />
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Text style={styles.label}>MONTHLY PRICE (₱) *</Text>
          <TextInput style={[styles.input, { fontWeight: 'bold' }]} keyboardType="numeric" value={form.price} onChangeText={t => setForm({ ...form, price: t })} />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.subLabel}>Beds</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={form.bedrooms} onChangeText={t => setForm({ ...form, bedrooms: t })} />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.subLabel}>Baths</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={form.bathrooms} onChangeText={t => setForm({ ...form, bathrooms: t })} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Sq Ft</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={form.area_sqft} onChangeText={t => setForm({ ...form, area_sqft: t })} />
            </View>
          </View>

          <Text style={styles.label}>ADDITIONAL COSTS</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 5 }]} placeholder="Utilities" keyboardType="numeric" value={form.utilities_cost} onChangeText={t => setForm({ ...form, utilities_cost: t })} />
            <TextInput style={[styles.input, { flex: 1, marginRight: 5 }]} placeholder="Internet" keyboardType="numeric" value={form.internet_cost} onChangeText={t => setForm({ ...form, internet_cost: t })} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Assoc." keyboardType="numeric" value={form.association_dues} onChangeText={t => setForm({ ...form, association_dues: t })} />
          </View>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <TextInput style={styles.input} placeholder="Phone *" keyboardType="phone-pad" value={form.owner_phone} onChangeText={t => setForm({ ...form, owner_phone: t })} />
          <TextInput style={styles.input} placeholder="Email *" keyboardType="email-address" autoCapitalize="none" value={form.owner_email} onChangeText={t => setForm({ ...form, owner_email: t })} />
        </View>

        {/* Description & Terms */}
        <View style={styles.section}>
          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} multiline placeholder="Property description..." value={form.description} onChangeText={t => setForm({ ...form, description: t })} />

          <Text style={styles.label}>TERMS & CONDITIONS (PDF)</Text>
          {form.terms_conditions ? (
            <View style={styles.pdfContainer}>
              <TouchableOpacity onPress={() => Linking.openURL(form.terms_conditions)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="document-text" size={20} color="#2563eb" />
                <Text style={{ color: '#2563eb', fontWeight: 'bold', marginLeft: 5, textDecorationLine: 'underline' }}>Terms PDF Uploaded</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setForm(prev => ({ ...prev, terms_conditions: '' }))} style={{ padding: 5 }}>
                <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 10 }}>No custom terms uploaded.</Text>
          )}

          <TouchableOpacity onPress={pickDocument} disabled={uploadingTerms} style={styles.uploadFileBtn}>
            {uploadingTerms ? <ActivityIndicator size="small" color="black" /> : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="black" />
                <Text style={{ fontWeight: 'bold', marginLeft: 8 }}>Upload Terms PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Images */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos ({form.images.length}/10)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginVertical: 10 }}>
            <TouchableOpacity style={styles.addImgBtn} onPress={pickImage} disabled={uploading || form.images.length >= 10}>
              {uploading ? <ActivityIndicator color="gray" /> : <Ionicons name="add" size={30} color="gray" />}
            </TouchableOpacity>
            {form.images.map((img, idx) => (
              <View key={idx} style={styles.imgThumbContainer}>
                <Image source={{ uri: img }} style={styles.imgThumb} />
                <TouchableOpacity onPress={() => removeImage(idx)} style={styles.removeImgBtn}>
                  <Ionicons name="close" size={12} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Amenities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amenities</Text>
          <View style={styles.amenitiesContainer}>
            {(showAllAmenities ? availableAmenities : availableAmenities.slice(0, 10)).map(amenity => (
              <TouchableOpacity
                key={amenity}
                style={[styles.amenityChip, form.amenities.includes(amenity) && styles.amenityChipActive]}
                onPress={() => toggleAmenity(amenity)}
              >
                {form.amenities.includes(amenity) && <Ionicons name="checkmark" size={14} color="white" style={{ marginRight: 4 }} />}
                <Text style={[styles.amenityText, form.amenities.includes(amenity) && { color: 'white' }]}>{amenity}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setShowAllAmenities(!showAllAmenities)} style={{ marginTop: 15 }}>
            <Text style={styles.toggleText}>{showAllAmenities ? 'SHOW LESS' : `SHOW ALL (${availableAmenities.length})`}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit} disabled={loading || uploading || uploadingTerms}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>List Property</Text>}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 30, fontWeight: 'bold', color: '#111827', letterSpacing: -0.5 },
  subHeader: { fontSize: 14, color: '#6B7280', marginBottom: 25, marginTop: 4 },
  section: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#F3F4F6' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  label: { fontSize: 11, fontWeight: 'bold', marginBottom: 8, color: '#9CA3AF', letterSpacing: 1 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 14, backgroundColor: '#FFFFFF' },
  titleInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: 'transparent', padding: 16, borderRadius: 12, fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row' },

  // PDF
  pdfContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#eff6ff', borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#dbeafe' },
  uploadFileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: '#f3f4f6', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed' },

  // Images
  addImgBtn: { width: 85, height: 85, borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: '#F9FAFB' },
  imgThumbContainer: { position: 'relative', marginRight: 10 },
  imgThumb: { width: 85, height: 85, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  removeImgBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 12, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },

  // Amenities
  amenitiesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  amenityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: 'white', flexDirection: 'row', alignItems: 'center' },
  amenityChipActive: { backgroundColor: 'black', borderColor: 'black' },
  amenityText: { fontSize: 12, color: '#4B5563', fontWeight: '500' },
  toggleText: { color: 'black', fontSize: 11, fontWeight: 'bold', textAlign: 'center', textDecorationLine: 'underline' },

  saveBtn: { backgroundColor: 'black', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});