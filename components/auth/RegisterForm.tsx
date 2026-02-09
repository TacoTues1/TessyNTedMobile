import React, { useState } from 'react';
import { 
  Alert, StyleSheet, Text, TouchableOpacity, View, Modal, Platform 
} from 'react-native';
import { supabase } from '../../lib/supabase';
import AuthInput from './AuthInput';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// Import DateTimePicker AND the Android Helper
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

export default function RegisterForm({ onSwitchToLogin, onRegisterSuccess, loading, setLoading }: any) {
  const router = useRouter();
  
  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // -- BIRTHDAY & GENDER --
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [gender, setGender] = useState('');
  
  // UI State
  const [showIOSPicker, setShowIOSPicker] = useState(false); // Only for iOS Modal
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // --- Date Picker Logic (Robust) ---
  
  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      // ANDROID: Use Imperative API
      DateTimePickerAndroid.open({
        value: birthday || new Date(),
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            setBirthday(selectedDate);
          }
        },
        mode: 'date',
        maximumDate: new Date(),
      });
    } else {
      // iOS: Show Modal
      setShowIOSPicker(true);
    }
  };

  const onIOSDateChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      setBirthday(selectedDate);
    }
  };

  const confirmIOSDate = () => {
    setShowIOSPicker(false);
    if (!birthday) setBirthday(new Date());
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password || !phone || !birthday || !gender) {
      return Alert.alert('Missing Fields', 'Please fill in all required fields including birthday and gender.');
    }

    if (!termsAccepted) {
      return Alert.alert('Terms Required', 'You must accept the Terms & Conditions to continue.');
    }

    if (password !== confirmPassword) return Alert.alert('Error', 'Passwords do not match');
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');

    setLoading(true);

    try {
      // Check Duplicate Phone
      const { data: existingPhone } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (existingPhone) {
        setLoading(false);
        return Alert.alert('Error', 'This phone number is already registered.');
      }

      const formattedBirthday = birthday.toISOString().split('T')[0];

      // Sign Up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { 
            first_name: firstName, 
            middle_name: middleName || 'N/A', 
            last_name: lastName,
            birthday: formattedBirthday,
            gender: gender,
            phone: phone
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        setLoading(false);
        onRegisterSuccess(email, { firstName, middleName, lastName, birthday: formattedBirthday, gender, phone });
      }
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Registration Failed', error.message);
    }
  };

  const genderOptions = ["Male", "Female", "Prefer not to say"];

  return (
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 5 }}>
          <AuthInput label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="Juan" />
        </View>
        <View style={{ flex: 1, marginLeft: 5 }}>
          <AuthInput label="Last Name *" value={lastName} onChangeText={setLastName} placeholder="Dela Cruz" />
        </View>
      </View>
      
      <AuthInput label="Middle Name (Optional)" value={middleName} onChangeText={setMiddleName} placeholder="Santos" />
      
      {/* --- BIRTHDAY & GENDER ROW --- */}
      <View style={styles.row}>
        
        {/* Birthday Picker */}
        <View style={{ flex: 1, marginRight: 5, marginBottom: 15 }}>
           <Text style={styles.inputLabel}>Birthday *</Text>
           <TouchableOpacity 
             style={styles.inputLike} 
             onPress={openDatePicker}
           >
             <Text style={birthday ? styles.inputText : styles.placeholderText}>
               {birthday ? birthday.toISOString().split('T')[0] : 'YYYY-MM-DD'}
             </Text>
             <Ionicons name="calendar-outline" size={18} color="#666" />
           </TouchableOpacity>

           {/* iOS ONLY: Modal Picker */}
           {showIOSPicker && (
              <Modal transparent animationType="fade" visible={true}>
                 <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                       <View style={styles.modalHeader}>
                          <Text style={styles.modalTitle}>Select Birthday</Text>
                          <TouchableOpacity onPress={confirmIOSDate}>
                             <Text style={{color: '#2563eb', fontWeight: 'bold', fontSize: 16}}>Done</Text>
                          </TouchableOpacity>
                       </View>
                       <DateTimePicker
                         value={birthday || new Date()}
                         mode="date"
                         display="spinner"
                         onChange={onIOSDateChange}
                         maximumDate={new Date()}
                         textColor="black" // Explicit text color for dark mode
                       />
                    </View>
                 </View>
              </Modal>
           )}
        </View>

        {/* Gender Dropdown */}
        <View style={{ flex: 1, marginLeft: 5, marginBottom: 15 }}>
           <Text style={styles.inputLabel}>Gender *</Text>
           <TouchableOpacity 
             style={styles.inputLike} 
             onPress={() => setShowGenderModal(true)}
           >
             <Text style={gender ? styles.inputText : styles.placeholderText}>
               {gender || 'Select'}
             </Text>
             <Ionicons name="chevron-down" size={18} color="#666" />
           </TouchableOpacity>
        </View>
      </View>

      <AuthInput label="Phone Number *" value={phone} onChangeText={setPhone} placeholder="09123456789" />
      <AuthInput label="Email *" value={email} onChangeText={setEmail} placeholder="john@example.com" />
      
      <AuthInput 
        label="Password *" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry={!showPassword} 
        isPassword 
        showPassword={showPassword} 
        togglePassword={() => setShowPassword(!showPassword)} 
      />
       <AuthInput 
        label="Confirm Password *" 
        value={confirmPassword} 
        onChangeText={setConfirmPassword} 
        secureTextEntry={!showPassword} 
      />

      {/* Terms Checkbox */}
      <View style={styles.termsContainer}>
        <TouchableOpacity 
            style={styles.checkbox} 
            onPress={() => setTermsAccepted(!termsAccepted)}
        >
            <Ionicons 
                name={termsAccepted ? "checkbox" : "square-outline"} 
                size={24} 
                color={termsAccepted ? "black" : "#ccc"} 
            />
        </TouchableOpacity>
        <View style={styles.termsTextContainer}>
            <Text style={styles.termsText}>I accept the </Text>
            <TouchableOpacity onPress={() => router.push('/terms')}>
                <Text style={styles.termsLink}>Terms & Conditions</Text>
            </TouchableOpacity>
            <Text style={styles.termsText}> regarding multiple accounts.</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Sign Up'}</Text>
      </TouchableOpacity>

      <View style={styles.switchContainer}>
        <Text>Already have an account? </Text>
        <TouchableOpacity onPress={onSwitchToLogin}>
          <Text style={styles.linkText}>Sign in</Text>
        </TouchableOpacity>
      </View>

      {/* --- GENDER SELECTION MODAL --- */}
      <Modal visible={showGenderModal} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowGenderModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, {marginBottom: 15}]}>Select Gender</Text>
            {genderOptions.map((option) => (
              <TouchableOpacity 
                key={option} 
                style={styles.modalOption} 
                onPress={() => {
                  setGender(option);
                  setShowGenderModal(false);
                }}
              >
                <Text style={[
                  styles.modalOptionText, 
                  gender === option && { fontWeight: 'bold', color: 'black' }
                ]}>
                  {option}
                </Text>
                {gender === option && <Ionicons name="checkmark" size={18} color="black" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity 
              style={styles.modalCancel} 
              onPress={() => setShowGenderModal(false)}
            >
              <Text style={{color: 'red', fontWeight: 'bold'}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  button: { backgroundColor: 'black', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { fontWeight: 'bold', textDecorationLine: 'underline' },
  
  // Custom Input Styles
  inputLabel: {
    fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: 6, marginLeft: 4
  },
  inputLike: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
  },
  inputText: { color: 'black', fontSize: 14 },
  placeholderText: { color: '#9ca3af', fontSize: 14 },

  // Terms Styles
  termsContainer: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 15 },
  checkbox: { marginRight: 10, paddingTop: 2 },
  termsTextContainer: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  termsText: { fontSize: 14, color: '#666' },
  termsLink: { fontSize: 14, fontWeight: 'bold', color: 'black', textDecorationLine: 'underline' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalOptionText: { fontSize: 16, color: '#333' },
  modalCancel: { marginTop: 15, paddingVertical: 10, alignItems: 'center' }
});