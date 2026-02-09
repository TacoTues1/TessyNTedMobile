import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LogoutScreen() {
    const router = useRouter();

    useEffect(() => {
        const performLogout = async () => {
            try {
                // 1. Sign out from Supabase (clears local session)
                await supabase.auth.signOut();
            } catch (error) {
                console.error("Logout error:", error);
            } finally {
                // 2. Redirect to Login Screen
                router.replace('/login');
            }
        };

        performLogout();
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
            <ActivityIndicator size="large" color="black" />
        </View>
    );
}
