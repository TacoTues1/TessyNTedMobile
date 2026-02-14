import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

import LoginForm from '../components/auth/LoginForm';
import OtpForm from '../components/auth/OtpForm';
import RegisterForm from '../components/auth/RegisterForm';

export default function AuthScreen() {
    const router = useRouter();
    const { initialView } = useLocalSearchParams<{ initialView: string }>();
    const [view, setView] = useState<'login' | 'register' | 'otp'>(
        (initialView === 'register' || initialView === 'otp') ? initialView : 'login'
    );
    const [loading, setLoading] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');
    const [pendingMetaData, setPendingMetaData] = useState({});

    // Listen for auth state changes - redirect to dashboard when logged in
    useEffect(() => {
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

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Logo + Branding Header */}
                    <View style={styles.header}>
                        <View style={styles.logoContainer}>
                            <Image
                                source={require('../assets/images/home.png')}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={styles.brandName}>TessyNTed</Text>
                        <Text style={styles.headerSubtitle}>
                            {view === 'login'
                                ? 'Sign in to your account'
                                : view === 'register'
                                    ? 'Create your account'
                                    : 'Verify your email'}
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
    scrollContent: {
        padding: 24, paddingBottom: 50,
        justifyContent: 'center', minHeight: '100%',
    },

    // Header with logo
    header: { marginBottom: 30, alignItems: 'center' },
    logoContainer: {
        width: 85, height: 85,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
    },
    logo: { width: 85, height: 85 },
    brandName: {
        fontSize: 37, fontWeight: '900', color: '#111',
        letterSpacing: -0.5, marginBottom: 6,
    },
    headerSubtitle: {
        fontSize: 14, color: '#9ca3af', fontWeight: '500',
    },
});
