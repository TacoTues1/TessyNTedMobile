import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

function NotificationsTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    let channel: any;
    let intervalId: any;

    const setupBadge = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      const fetchCount = async () => {
        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient', userId)
          .eq('read', false);

        if (!error && isMounted) {
          setUnreadCount(count || 0);
        }
      };

      fetchCount();
      intervalId = setInterval(fetchCount, 5000);

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

function MessagesTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    let channel: any;
    let intervalId: any;

    const setupBadge = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      const fetchCount = async () => {
        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', userId)
          .eq('read', false);

        if (!error && isMounted) {
          setUnreadCount(count || 0);
        }
      };

      fetchCount();
      intervalId = setInterval(fetchCount, 5000);

      channel = supabase
        .channel(`msg-badge-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
          () => fetchCount()
        )
        .subscribe();
    };

    setupBadge();

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
        name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
        size={22}
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

const TAB_STYLE: any = {
  height: 60,
  borderTopWidth: 1,
  borderTopColor: '#f0f0f0',
  backgroundColor: '#fff',
  elevation: 0,
  paddingBottom: Platform.OS === 'ios' ? 8 : 4,
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: 'black',
        tabBarInactiveTintColor: '#999',
        tabBarShowLabel: true,
        headerShown: false,
        tabBarStyle: TAB_STYLE,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, focused }) => (
            <MessagesTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="landlordproperties"
        options={{
          title: '',
          tabBarIcon: ({ color }) => (
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#000',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 10
            }}>
              <Ionicons name="add" size={24} color="white" />
            </View>
          ),
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
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
        }}
      />
      <Tabs.Screen name="maintenance" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
      <Tabs.Screen name="payments" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
      <Tabs.Screen name="schedule" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
      <Tabs.Screen name="bookings" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
      <Tabs.Screen name="applications" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
      <Tabs.Screen name="terms" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="allproperties" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
      <Tabs.Screen name="assigntenant" options={{ href: null, tabBarStyle: { ...TAB_STYLE, display: 'flex' } }} />
    </Tabs>
  );
}