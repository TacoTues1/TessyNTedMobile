import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text, TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

// Import Dashboards
import LandlordDashboard from '../../components/auth/dashboard/LandlordDashboard';
import TenantDashboard from '../../components/auth/dashboard/TenantDashboard';

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  // Security State
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/');
        return;
      }

      setSession(session);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);

        if (profileData.phone) {
          const { data: duplicates } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', profileData.phone)
            .neq('id', session.user.id);

          if (duplicates && duplicates.length > 0) {
            setIsDuplicate(true);
          }
        }
      }
    } catch (e) {
      console.log('Error checking user:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ LOGOUT - Use dedicated route for clean unmount/remount
  const handleSignOut = () => {
    setMenuVisible(false);
    // Directly navigate to the logout handler screen
    // This forces unmounting of the Dashboard and its state
    router.replace('/logout');
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure? This will permanently delete this duplicate account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await supabase.from('profiles').delete().eq('id', session.user.id);
              handleSignOut(); // Reuse logout logic
            } catch (error: any) {
              Alert.alert("Error", error.message);
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  const MenuOption = ({ icon, label, route, isLogout }: { icon: any; label: string; route?: string; isLogout?: boolean }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        if (isLogout) {
          handleSignOut();
        } else if (route) {
          setMenuVisible(false);
          router.push(route as any);
        }
      }}
    >
      <View style={styles.menuIconBox}>
        <Ionicons name={icon} size={20} color={isLogout ? "black" : "#333"} />
      </View>
      <Text style={[styles.menuText, isLogout && { color: "black", fontWeight: "bold" }]}>
        {label}
      </Text>
      {!isLogout && <Ionicons name="chevron-forward" size={16} color="#ccc" />}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="black" />
      </View>
    );
  }

  // If no session (logged out), show loading - logout function handles navigation
  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="black" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* --- HEADER (Always Visible) --- */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/images/home.png')} style={styles.logoImage} />
          <Text style={styles.brandName}>TessyNTed</Text>
        </View>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          onPress={() => setMenuVisible(true)}
        >
          <View style={styles.profileBtn}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {profile?.first_name?.[0]?.toUpperCase() || "U"}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-down" size={20} color="#333" />
        </TouchableOpacity>
      </View>

      {/* --- BODY CONTENT --- */}
      {isDuplicate ? (
        // --- LOCKED VIEW (Black & White) ---
        <View style={styles.lockedContainer}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="close-circle-outline" size={60} color="black" />
          </View>
          <Text style={styles.lockedTitle}>Restricted Access</Text>
          <Text style={styles.lockedDesc}>
            Duplicate Account Detected
          </Text>
          <Text style={styles.lockedSubDesc}>
            This phone number is already associated with another account. Please delete this account to proceed.
          </Text>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? <ActivityIndicator color="white" /> : <Text style={styles.deleteBtnText}>Delete Account</Text>}
          </TouchableOpacity>

          {/* Added explicit Logout for Duplicate Screen */}
          <TouchableOpacity onPress={handleSignOut} style={{ marginTop: 20 }}>
            <Text style={{ color: '#666', textDecorationLine: 'underline' }}>Log Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // --- NORMAL DASHBOARD ---
        profile?.role === 'landlord' ? (
          <LandlordDashboard session={session} profile={profile} />
        ) : (
          <TenantDashboard session={session} profile={profile} />
        )
      )}

      {/* --- DROPDOWN MENU MODAL --- */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.dropdownMenu}>

              {!isDuplicate && (
                <>
                  <MenuOption icon="search-outline" label="All Properties" route="/allproperties" />
                  {profile?.role === "landlord" && (
                    <>
                      <MenuOption icon="add-circle-outline" label="Add Property" route="/properties/new" />
                      <MenuOption icon="calendar-outline" label="Schedule" route="/schedule" />
                      <MenuOption icon="list-outline" label="Bookings" route="/bookings" />
                    </>
                  )}
                  {profile?.role === "tenant" && (
                    <>
                      <MenuOption icon="list-outline" label="My Applications" route="/applications" />
                      <MenuOption icon="calendar-outline" label="Bookings" route="/bookings" />
                    </>
                  )}
                  <MenuOption icon="chatbubble-ellipses-outline" label="Messages" route="/messages" />
                  <MenuOption icon="hammer-outline" label="Maintenance" route="/maintenance" />
                  <MenuOption icon="card-outline" label="Payments" route="/payments" />
                  <MenuOption icon="person-outline" label="My Profile" route="/profile" />
                  <View style={styles.divider} />
                </>
              )}

              <MenuOption icon="log-out-outline" label="Log Out" isLogout />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header Styles
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  logoImage: { width: 36, height: 36, borderRadius: 10 },
  brandName: { fontSize: 20, fontWeight: '900', color: '#111', letterSpacing: -0.5 },
  greeting: { fontSize: 14, color: "#666" },
  username: { fontSize: 24, fontWeight: "bold" },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
    overflow: 'hidden',
  },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: "white", fontSize: 16, fontWeight: "bold" },

  // Locked View Styles (Black & White)
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#fff',
  },
  lockIconCircle: {
    marginBottom: 25,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lockedTitle: { fontSize: 24, fontWeight: '900', color: 'black', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  lockedDesc: { fontSize: 18, textAlign: 'center', color: '#000', marginBottom: 10, fontWeight: 'bold' },
  lockedSubDesc: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 40, lineHeight: 22 },
  deleteBtn: {
    backgroundColor: 'black', // Black button
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4
  },
  deleteBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 },

  // Dropdown Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)" },
  dropdownMenu: {
    position: "absolute",
    top: 85, // Adjusted to sit right below the header (approx 80 height)
    right: 20,
    width: 220,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
  menuIconBox: { width: 30, alignItems: "center", marginRight: 10 },
  menuText: { flex: 1, fontSize: 15, color: "#333" },
  divider: { height: 1, backgroundColor: "#f0f0f0", marginVertical: 5 },
});