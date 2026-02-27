import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

export default function Profile() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // --- VIEW STATE ---
  const [currentView, setCurrentView] = useState<'menu' | 'personal' | 'security' | 'notifications'>('menu');

  // --- PROFILE STATE ---
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileRole, setProfileRole] = useState('');
  const [saving, setSaving] = useState(false);

  // Verification State
  const [verifying, setVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [dbVerifiedPhone, setDbVerifiedPhone] = useState('');

  // --- SECURITY STATE ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // --- NOTIFICATIONS STATE ---
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    sms: true,
    push: true
  });

  // --- UI STATE ---
  const [showGenderModal, setShowGenderModal] = useState(false);

  useEffect(() => {
    getProfile();
  }, []);

  const getProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) {
          setFirstName(data.first_name || '');
          setMiddleName(data.middle_name || '');
          setLastName(data.last_name || '');
          setPhone(data.phone || '');
          setBirthday(data.birthday || '');
          setGender(data.gender || '');
          setAvatarUrl(data.avatar_url || '');
          setProfileRole(data.role || 'tenant');

          if (data.phone_verified && data.phone) {
            setVerifiedPhone(data.phone);
            setDbVerifiedPhone(data.phone);
          }

          if (data.notification_preferences) {
            setNotifPrefs({
              email: data.notification_preferences.email ?? true,
              sms: data.notification_preferences.sms ?? true,
              push: data.notification_preferences.push ?? true
            });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // --- AVATAR LOGIC ---
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadAvatar(result.assets[0]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadAvatar = async (imageAsset: ImagePicker.ImagePickerAsset) => {
    if (!session?.user?.id) return;
    setUploadingAvatar(true);

    try {
      const base64 = imageAsset.base64;
      const fileExt = imageAsset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${session.user.id}/avatar-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(base64!), {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      Alert.alert('Success', 'Profile picture updated!');
    } catch (error: any) {
      console.error(error);
      Alert.alert('Upload Failed', error.message || 'Could not upload image');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // --- PHONE HELPER ---
  const isPhoneVerified = () => {
    const normalize = (p: string) => p?.replace(/\D/g, '') || '';
    return normalize(verifiedPhone).length > 0 && normalize(phone) === normalize(verifiedPhone);
  };

  const handleSendVerification = async () => {
    // (Simplified for brevity - kept logic same as original file)
    if (!phone) return Alert.alert('Error', 'Please enter a phone number.');
    setOtpLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone })
      });
      if (!response.ok) throw new Error(await response.text());
      setOtpSent(true);
      Alert.alert('Success', 'Verification code sent!');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setOtpLoading(false); }
  };

  const handleVerifyOtp = async () => {
    // (Simplified logic same as original)
    if (otp.length < 6) return Alert.alert('Error', 'Enter 6-digit code');
    setOtpLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone, code: otp, userId: session.user.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVerifying(false); setOtpSent(false); setOtp(''); setVerifiedPhone(data.phone); setPhone(data.phone);
      await supabase.from('profiles').update({ phone_verified: true }).eq('id', session.user.id);
      Alert.alert('Success', 'Verified!');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setOtpLoading(false); }
  };

  // --- ACTION HANDLERS ---
  const handleUpdateProfile = async () => {
    setSaving(true);
    const updates = {
      first_name: firstName,
      middle_name: middleName || 'N/A',
      last_name: lastName,
      phone: phone,
      birthday: birthday || null,
      gender: gender || null,
      updated_at: new Date(),
    };
    const { error } = await supabase.from('profiles').update(updates).eq('id', session.user.id);
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('Success', 'Profile updated');
      setCurrentView('menu');
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) return Alert.alert('Error', "Mismatch");
    setSaving(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: currentPassword });
    if (signInError) { setSaving(false); return Alert.alert("Error", "Incorrect current password"); }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) Alert.alert("Error", error.message);
    else {
      Alert.alert("Success", "Password updated");
      setCurrentView('menu');
      setNewPassword(''); setCurrentPassword(''); setConfirmPassword('');
    }
  };

  const handleNotificationToggle = async (key: 'email' | 'sms' | 'push') => {
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(newPrefs);
    const { error } = await supabase.from('profiles').update({ notification_preferences: newPrefs }).eq('id', session.user.id);
    if (error) setNotifPrefs({ ...notifPrefs, [key]: notifPrefs[key] });
  };

  const handleSignOut = () => {
    router.replace('/logout');
  };

  // --- RENDER HELPERS ---
  const MenuRow = ({ icon, label, onPress, color = '#333', danger = false }: any) => (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.menuIconBox, danger && { backgroundColor: '#fee2e2' }]}>
          <Ionicons name={icon} size={20} color={danger ? '#ef4444' : color} />
        </View>
        <Text style={[styles.menuLabel, danger && { color: '#ef4444' }]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#ccc" />
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="black" /></View>;

  // --- MAIN RENDER: MENU ---
  if (currentView === 'menu') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Profile</Text>
            <View style={styles.profileCard}>
              <View style={styles.avatarWrapperBig}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitialsBig}>{(firstName?.[0] || 'U').toUpperCase()}</Text>
                )}
              </View>
              <Text style={styles.profileName}>{firstName} {lastName}</Text>
              <TouchableOpacity style={styles.editProfileBtn} onPress={() => setCurrentView('personal')}>
                <Text style={styles.editProfileText}>Edit Profile</Text>
                <Ionicons name="chevron-forward" size={12} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Management Section */}
          <Text style={styles.sectionHeader}>Management</Text>
          <View style={styles.menuSection}>
            <MenuRow icon="business-outline" label="All Properties" onPress={() => router.push('/(tabs)/allproperties')} />
            {profileRole === 'landlord' && (
              <>
                <MenuRow icon="home-outline" label="My Properties" onPress={() => router.push('/(tabs)/landlordproperties')} />
                <MenuRow icon="calendar-outline" label="Schedule" onPress={() => router.push('/(tabs)/schedule')} />
              </>
            )}
            <MenuRow icon="people-outline" label="Bookings" onPress={() => router.push('/(tabs)/bookings')} />
            <MenuRow icon="hammer-outline" label="Maintenance" onPress={() => router.push('/(tabs)/maintenance')} />
            <MenuRow icon="card-outline" label="Payments" onPress={() => router.push('/(tabs)/payments')} />
          </View>

          {/* General Section */}
          <Text style={styles.sectionHeader}>Account</Text>
          <View style={styles.menuSection}>
            <MenuRow icon="person-outline" label="Personal Details" onPress={() => setCurrentView('personal')} />
            <MenuRow icon="lock-closed-outline" label="Security" onPress={() => setCurrentView('security')} />
            <MenuRow icon="notifications-outline" label="Notifications" onPress={() => setCurrentView('notifications')} />
          </View>

          {/* Logout Section */}
          <View style={[styles.menuSection, { marginTop: 20 }]}>
            <MenuRow icon="log-out-outline" label="Sign Out" onPress={handleSignOut} danger />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- SUB-VIEWS wrapper ---
  const SubHeader = ({ title }: any) => (
    <View style={styles.subHeader}>
      <TouchableOpacity onPress={() => setCurrentView('menu')} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="black" />
      </TouchableOpacity>
      <Text style={styles.subHeaderTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // --- PERSONAL DETAILS ---
  if (currentView === 'personal') {
    return (
      <SafeAreaView style={styles.container}>
        <SubHeader title="Personal Details" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>

          {/* Avatar Upload */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={pickImage} disabled={uploadingAvatar}>
              <View style={styles.avatarContainer}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitials}>{(firstName?.[0] || 'U').toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.avatarOverlay}>
                  {uploadingAvatar ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="camera" size={20} color="white" />}
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />

          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />

          <View style={{ flexDirection: 'row', gap: 15 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Birthday</Text>
              <TextInput style={styles.input} value={birthday} onChangeText={setBirthday} placeholder="YYYY-MM-DD" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Gender</Text>
              <TouchableOpacity onPress={() => setShowGenderModal(true)} style={styles.selectInput}>
                <Text>{gender || 'Select'}</Text>
                <Ionicons name="chevron-down" size={16} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.label}>Phone Number</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }, isPhoneVerified() && styles.disabled]}
              value={phone}
              onChangeText={setPhone}
              editable={!isPhoneVerified()}
              keyboardType="phone-pad"
            />
            {!isPhoneVerified() && (
              <TouchableOpacity onPress={() => { setVerifying(true); handleSendVerification(); }} style={styles.btnSmall}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Verify</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* OTP section same as before... */}
          {verifying && !isPhoneVerified() && (
            <View style={styles.otpBox}>
              <TextInput style={styles.otpInput} value={otp} onChangeText={setOtp} placeholder="Code" keyboardType="number-pad" />
              <TouchableOpacity onPress={handleVerifyOtp} style={styles.btnSmall}><Text style={{ color: 'white' }}>Confirm</Text></TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateProfile} disabled={saving}>
            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>

        {/* Gender Modal */}
        <Modal visible={showGenderModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Gender</Text>
              {['Male', 'Female', 'Prefer not to say'].map(opt => (
                <TouchableOpacity key={opt} style={styles.modalOption} onPress={() => { setGender(opt); setShowGenderModal(false); }}>
                  <Text style={{ fontWeight: gender === opt ? 'bold' : 'normal' }}>{opt}</Text>
                  {gender === opt && <Ionicons name="checkmark" size={18} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // --- SECURITY ---
  if (currentView === 'security') {
    return (
      <SafeAreaView style={styles.container}>
        <SubHeader title="Security" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.sectionTitle}>Change Password</Text>

          <Text style={styles.label}>Current Password</Text>
          <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="••••••••" />

          <Text style={styles.label}>New Password</Text>
          <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="••••••••" />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="••••••••" />

          <TouchableOpacity style={styles.saveBtn} onPress={handlePasswordChange} disabled={saving}>
            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- NOTIFICATIONS ---
  if (currentView === 'notifications') {
    return (
      <SafeAreaView style={styles.container}>
        <SubHeader title="Notifications" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.section}>
            {[
              { id: 'email', label: 'Email Notifications', desc: 'Receive updates & bills via email.' },
              { id: 'sms', label: 'SMS Notifications', desc: 'Get urgent alerts via text.' },
              { id: 'push', label: 'Push Notifications', desc: 'Real-time alerts on your device.' }
            ].map((item) => (
              <View key={item.id} style={styles.prefRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.label}</Text>
                  <Text style={{ color: '#666', fontSize: 12 }}>{item.desc}</Text>
                </View>
                <Switch
                  value={notifPrefs[item.id as keyof typeof notifPrefs]}
                  onValueChange={() => handleNotificationToggle(item.id as any)}
                  trackColor={{ false: '#767577', true: 'black' }}
                  thumbColor={'white'}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Helper styles
  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee' },
  backBtn: { padding: 5 },
  subHeaderTitle: { fontSize: 18, fontWeight: 'bold' },

  // Menu Styles
  menuHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 30 },
  menuTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  profileCard: { alignItems: 'center' },
  avatarWrapperBig: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#eee', marginBottom: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarInitialsBig: { fontSize: 36, fontWeight: 'bold', color: '#ccc' },
  profileName: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 10 },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#000000ff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25 },
  editProfileText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#111', marginLeft: 20, marginBottom: 10, marginTop: 10 },
  menuSection: { backgroundColor: 'white', borderRadius: 16, marginHorizontal: 20, paddingVertical: 5, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  menuIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },

  // Form Styles (Reused)
  section: { backgroundColor: 'white', borderRadius: 16, padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 5, marginTop: 15, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  selectInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disabled: { backgroundColor: '#f3f4f6', color: '#999' },

  // Avatars
  avatarContainer: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#f3f4f6', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 32, fontWeight: 'bold', color: '#ccc' },
  avatarOverlay: { position: 'absolute', bottom: 0, width: '100%', height: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  // Buttons
  saveBtn: { backgroundColor: 'black', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  btnSmall: { backgroundColor: 'black', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Prefs
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f3f4f6' },

  // Verification
  otpBox: { padding: 15, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', marginTop: 10 },
  otpInput: { backgroundColor: 'white', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 18, fontWeight: 'bold', letterSpacing: 5, textAlign: 'center', marginBottom: 10 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }
});