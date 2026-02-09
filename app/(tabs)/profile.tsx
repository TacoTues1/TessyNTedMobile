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

// ---------------------------------------------------------------------------
// ⚠️ REPLACE THIS WITH YOUR COMPUTER'S LOCAL IP ADDRESS
// ---------------------------------------------------------------------------
const API_URL = 'http://192.168.1.5:3000';

export default function Profile() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- TABS STATE ---
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');

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

  // Verification State
  const [verifying, setVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [dbVerifiedPhone, setDbVerifiedPhone] = useState(''); // Backup to revert if canceled

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

  // --- PHONE HELPER ---
  const isPhoneVerified = () => {
    const normalize = (p: string) => p?.replace(/\D/g, '') || '';
    return normalize(verifiedPhone).length > 0 && normalize(phone) === normalize(verifiedPhone);
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

  // --- PHONE VERIFICATION ---
  const handleSendVerification = async () => {
    if (!phone) return Alert.alert('Error', 'Please enter a phone number.');
    setOtpLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server Error: ${text}`);
      }

      setOtpSent(true);
      Alert.alert('Success', 'Verification code sent!');
    } catch (error: any) {
      Alert.alert('Connection Error', `Failed to connect to backend.\n${error.message}`);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) return Alert.alert('Error', 'Enter 6-digit code');
    setOtpLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          phone,
          code: otp,
          userId: session.user.id
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification failed');

      Alert.alert('Success', 'Phone verified!');
      setVerifying(false);
      setOtpSent(false);
      setOtp('');
      setVerifiedPhone(data.phone);
      setDbVerifiedPhone(data.phone);
      setPhone(data.phone);

      await supabase.from('profiles').update({ phone_verified: true }).eq('id', session.user.id);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setOtpLoading(false);
    }
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

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Profile updated successfully');
    }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) return Alert.alert('Error', "New passwords do not match");
    if (!currentPassword) return Alert.alert('Error', "Please enter your current password");
    if (newPassword.length < 6) return Alert.alert('Error', "Password must be at least 6 characters");

    setSaving(true);

    // 1. Verify credentials
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });

    if (signInError) {
      setSaving(false);
      return Alert.alert("Error", "Incorrect current password");
    }

    // 2. Update password
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Password updated successfully!");
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
    }
    setSaving(false);
  };

  const handleNotificationToggle = async (key: 'email' | 'sms' | 'push') => {
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(newPrefs); // Optimistic update

    const { error } = await supabase
      .from('profiles')
      .update({ notification_preferences: newPrefs })
      .eq('id', session.user.id);

    if (error) {
      console.error('Error updating preferences:', error);
      Alert.alert("Error", "Failed to save preference");
      setNotifPrefs({ ...notifPrefs, [key]: notifPrefs[key] }); // Revert
    }
  };

  const handleSignOut = () => {
    router.replace('/logout');
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="black" /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <Text style={styles.headerSubtitle}>Manage your profile and security.</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {['profile', 'security', 'notifications'].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab as any)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            {tab === 'profile' && <Ionicons name="person-outline" size={18} color={activeTab === tab ? 'white' : 'black'} />}
            {tab === 'security' && <Ionicons name="lock-closed-outline" size={18} color={activeTab === tab ? 'white' : 'black'} />}
            {tab === 'notifications' && <Ionicons name="notifications-outline" size={18} color={activeTab === tab ? 'white' : 'black'} />}
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <View style={styles.section}>
            {/* Avatar */}
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

            {/* Fields */}
            <Text style={styles.label}>First Name</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />

            <Text style={styles.label}>Last Name</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />

            <Text style={styles.label}>Middle Name (Optional)</Text>
            <TextInput style={styles.input} value={middleName === 'N/A' ? '' : middleName} onChangeText={setMiddleName} placeholder="Middle Name" />

            <View style={{ flexDirection: 'row', gap: 10 }}>
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

            {/* Phone */}
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
              {isPhoneVerified() && (
                <TouchableOpacity onPress={() => { setVerifiedPhone(''); setVerifying(true); }} style={[styles.btnSmall, { backgroundColor: 'white', borderWidth: 1, borderColor: 'black' }]}>
                  <Text style={{ color: 'black', fontWeight: 'bold' }}>Change</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Verify OTP Input */}
            {verifying && !isPhoneVerified() && (
              <View style={styles.otpBox}>
                <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Enter Code</Text>
                <TextInput
                  style={styles.otpInput}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={handleVerifyOtp} style={styles.btnSmall}>
                    <Text style={{ color: 'white' }}>Confirm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setVerifying(false)} style={[styles.btnSmall, { backgroundColor: '#eee' }]}>
                    <Text style={{ color: 'black' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* --- SECURITY TAB --- */}
        {activeTab === 'security' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Change Password</Text>

            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="••••••••"
            />

            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="••••••••"
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="••••••••"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handlePasswordChange} disabled={saving}>
              {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* --- NOTIFICATIONS TAB --- */}
        {activeTab === 'notifications' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>

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
        )}

        {/* Sign Out Button (Always Visible at bottom) */}
        {!saving && (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Sign Out</Text>
          </TouchableOpacity>
        )}

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
            <TouchableOpacity onPress={() => setShowGenderModal(false)} style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: 'red' }}>Cancel</Text>
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

  header: {
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    height: 80, // Approximate height to match Home header visual
  },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  headerSubtitle: { color: '#666', fontSize: 14 },

  tabsContainer: { flexDirection: 'row', padding: 10, gap: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  activeTab: { backgroundColor: 'black', borderColor: 'black' },
  tabText: { fontWeight: '600', color: '#666' },
  activeTabText: { color: 'white' },

  section: { backgroundColor: 'white', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },

  label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 5, marginTop: 15, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  selectInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disabled: { backgroundColor: '#f3f4f6', color: '#999' },

  // Avatar
  avatarContainer: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#f3f4f6', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 32, fontWeight: 'bold', color: '#ccc' },
  avatarOverlay: { position: 'absolute', bottom: 0, width: '100%', height: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  // Buttons
  saveBtn: { backgroundColor: 'black', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  btnSmall: { backgroundColor: 'black', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 30, padding: 15, borderRadius: 10, backgroundColor: '#fee2e2' },

  // Verification
  otpBox: { padding: 15, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', marginTop: 10 },
  otpInput: { backgroundColor: 'white', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 18, fontWeight: 'bold', letterSpacing: 5, textAlign: 'center', marginBottom: 10 },

  // Preferences
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f3f4f6' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }
});