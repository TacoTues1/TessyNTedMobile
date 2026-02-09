import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

function NotificationsTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    let channel: any;
    let intervalId: any;

    const setupBadge = async () => {
      // 1. Get User
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      // 2. Define Fetch Function
      const fetchCount = async () => {
        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient', userId)
          .eq('read', false);

        if (!error && isMounted) {
          // console.log("Updated Badge:", count); // Uncomment to debug
          setUnreadCount(count || 0);
        }
      };

      // Initial Fetch
      fetchCount();

      // 3. SET UP INTERVAL (The Backup Plan)
      // This ensures the badge updates every 5 seconds even if Realtime fails
      intervalId = setInterval(fetchCount, 5000);

      // 4. Try Realtime (The Instant Fix)
      channel = supabase
        .channel(`badge-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `recipient=eq.${userId}` },
          () => fetchCount()
        )
        .subscribe();
    };

    setupBadge();

    // 5. Handle App State (Refresh when opening app)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        setupBadge();
      }
      appState.current = nextAppState;
    });

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, []);

  const badgeValue = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons
        name={focused ? 'notifications' : 'notifications-outline'}
        size={26}
        color={color}
      />
      {unreadCount > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -6,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: 'red',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: 'white',
            paddingHorizontal: 3
          }}
        >
          <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>{badgeValue}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: 'black',
        tabBarInactiveTintColor: '#999',
        tabBarShowLabel: true,
        headerShown: false,
        tabBarStyle: { height: 60, borderTopWidth: 1, borderTopColor: '#f0f0f0', elevation: 0 }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={26} color={color} />
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, focused }) => (
            <NotificationsTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={26} color={color} />
        }}
      />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="maintenance" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="applications" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null, tabBarStyle: { display: 'flex' } }} />
      <Tabs.Screen name="allproperties" options={{ href: null, tabBarStyle: { display: 'flex' } }} />
    </Tabs>
  );
}