import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginForm({ loading, setLoading, onSwitchToRegister }: any) {
  const router = useRouter(); // Initialize router
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Login Failed', error.message);
    } else if (data?.session) {
      router.replace('/(tabs)');
    }
  };

  const performOAuth = async (provider: 'google' | 'facebook') => {
    try {
      // ⚠️ USE THE MAGIC PATH (/--/)
      // This tells Expo Go "Open the app, don't stay in browser"
      const redirectUrl = "exp://10.145.81.27:8081/--/";

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        // Open browser and listen for the Magic Path
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        // If successful, the browser will close automatically
        if (result.type === 'success') {
          console.log('Deep link success!');
        }
      }
    } catch (err: any) {
      Alert.alert('Login Error', err.message);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Email Address</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={styles.label}>Password</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput} // Note: Use passwordInput, not input
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Ionicons name={showPassword ? "eye" : "eye-off"} size={20} color="#666" />
        </TouchableOpacity>
      </View>


      <TouchableOpacity style={[styles.loginBtn, loading && styles.disabled]} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Sign In</Text>}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={onSwitchToRegister}><Text style={styles.link}>Sign Up</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  passwordContainer: {
    flexDirection: 'row',       // Places input and icon side-by-side
    alignItems: 'center',       // Centers them vertically
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    marginBottom: 20,
    paddingRight: 15,           // Space for the icon on the right
  },
  passwordInput: {
    flex: 1,                    // Takes up all available width
    padding: 15,
    fontSize: 16,
    color: '#333',
  },
  form: { width: '100%' },
  label: { fontWeight: '600', marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, marginBottom: 20, fontSize: 16, backgroundColor: '#f9f9f9' },
  loginBtn: { backgroundColor: 'black', padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 25 },
  disabled: { opacity: 0.7 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  line: { flex: 1, height: 1, backgroundColor: '#eee' },
  orText: { marginHorizontal: 10, color: '#999', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, gap: 10 },
  socialText: { fontWeight: '600', color: '#333' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  footerText: { color: '#666' },
  link: { color: 'black', fontWeight: 'bold' }
});