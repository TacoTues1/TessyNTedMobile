import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function EntryScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Already logged in -> go to dashboard
          router.replace('/(tabs)');
        } else {
          // Not logged in -> show welcome screen
          router.replace('/welcome');
        }
      } catch (error) {
        console.log('Session check error:', error);
        router.replace('/welcome');
      } finally {
        setChecking(false);
      }
    };

    checkSession();
  }, []);

  // Show a brief loading spinner while checking session
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});