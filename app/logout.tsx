import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LogoutScreen() {
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        const performLogout = async () => {
            try {
                // 1. Sign out from Supabase (clears local session)
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
            } catch (error) {
                console.error("Logout error:", error);
            } finally {
                // 2. Wrap redirect in small timeout to ensure state clears fully in Expo Go
                if (isMounted) {
                    setTimeout(() => {
                        router.replace('/login');
                    }, 500);
                }
            }
        };

        performLogout();

        return () => { isMounted = false; };
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
            <ActivityIndicator size="large" color="black" />
        </View>
    );
}
