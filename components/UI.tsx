import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, SafeAreaView, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// --- NAVBAR COMPONENT ---
interface NavbarProps {
  title: string;
  userInitials?: string;
  onLogout?: () => void;
}

export function Navbar({ title, userInitials = 'U', onLogout }: NavbarProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();

  return (
    <View style={styles.navContainer}>
      {/* 1. Header Bar */}
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>{title}</Text>
        
        <TouchableOpacity 
          style={styles.navAvatar} 
          onPress={() => setMenuVisible(true)}
        >
          <Text style={styles.navAvatarText}>{userInitials}</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Responsive "Dropdown" (Modal) */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.dropdownMenu}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Menu</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/(tabs)/profile'); }}>
              <Ionicons name="person-outline" size={20} color="#333" />
              <Text style={styles.menuText}>My Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/(tabs)/notifications'); }}>
              <Ionicons name="notifications-outline" size={20} color="#333" />
              <Text style={styles.menuText}>Notifications</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); onLogout?.(); }}>
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text style={[styles.menuText, { color: '#ef4444' }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Handle notch/status bar
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    zIndex: 100, // Important for stacking
  },
  navBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000',
    textTransform: 'uppercase',
  },
  navAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // --- Modal Dropdown Styles ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)', // Dim background
    justifyContent: 'flex-start',
    alignItems: 'flex-end', // Aligns menu to top-right
  },
  dropdownMenu: {
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 55 : 95, // Position below header
    marginRight: 10,
    width: 200,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10, // Required for Android shadow
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    marginBottom: 5,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#999',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  menuText: {
    fontSize: 15,
    marginLeft: 10,
    fontWeight: '500',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 5,
  }
});