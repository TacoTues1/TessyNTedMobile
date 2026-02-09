import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function OtpForm({ email, metaData, onCancel, loading, setLoading }: any) {
  const [otp, setOtp] = useState('');

  const handleVerify = async () => {
    if (otp.length !== 6) return Alert.alert('Error', 'Please enter a 6-digit code');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup'
      });

      if (error) throw error;

      if (data.user) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!existingProfile) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            first_name: metaData.firstName,
            middle_name: metaData.middleName || 'N/A',
            last_name: metaData.lastName,
            role: 'tenant',
            email: email,
            phone: metaData.phone, // Save the phone number
            birthday: metaData.birthday,
            gender: metaData.gender
          });

          if (profileError && profileError.code !== '23505') {
             throw new Error('Email verified but profile setup failed. Please contact support.');
          }
        }

        Alert.alert('Success', 'Email verified successfully! Please sign in.');
        if (onCancel) onCancel(); 
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Enter the code sent to {email}</Text>
      <TextInput
        style={styles.otpInput}
        value={otp}
        onChangeText={setOtp}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />
      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify Code'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={styles.cancelLink}>
        <Text style={styles.cancelText}>Back to Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: 'center' },
  subtitle: { fontSize: 16, color: 'gray', marginBottom: 30 },
  otpInput: { fontSize: 30, letterSpacing: 10, borderBottomWidth: 2, borderBottomColor: 'black', width: '80%', textAlign: 'center', marginBottom: 30 },
  button: { backgroundColor: 'black', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cancelLink: { marginTop: 20 },
  cancelText: { textDecorationLine: 'underline', color: 'blue' },
});