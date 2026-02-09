import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

import LoginForm from '../components/auth/LoginForm';
import OtpForm from '../components/auth/OtpForm';
import RegisterForm from '../components/auth/RegisterForm';

export default function AuthScreen() {
  const router = useRouter();
  const [view, setView] = useState<'login' | 'register' | 'otp'>('login');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingMetaData, setPendingMetaData] = useState({});

  // Check if user is already logged in - redirect to dashboard if so
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace('/(tabs)');
        }
      } catch (error) {
        console.log('Session check error:', error);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/(tabs)');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRegisterSuccess = (email: string, metaData: any) => {
    setPendingEmail(email);
    setPendingMetaData(metaData);
    setView('otp');
  };

  // Always show login form - no loading state for this screen
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {view === 'login' ? 'Welcome to TessyNTed' : view === 'register' ? 'Create Account' : 'Verification'}
            </Text>
          </View>

          {view === 'login' && (
            <LoginForm
              loading={loading}
              setLoading={setLoading}
              onSwitchToRegister={() => setView('register')}
            />
          )}

          {view === 'register' && (
            <RegisterForm
              loading={loading}
              setLoading={setLoading}
              onSwitchToLogin={() => setView('login')}
              onRegisterSuccess={handleRegisterSuccess}
            />
          )}

          {view === 'otp' && (
            <OtpForm
              email={pendingEmail}
              metaData={pendingMetaData}
              loading={loading}
              setLoading={setLoading}
              onCancel={() => setView('register')}
            />
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 50, justifyContent: 'center', minHeight: '100%' },
  header: { marginBottom: 30, alignItems: 'center' },
  headerTitle: { fontSize: 32, fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
});