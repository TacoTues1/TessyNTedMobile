import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// Helper to avoid simultaneous getSession calls during mount which causes token refresh race conditions
let sessionPromise: Promise<any> | null = null;
const getSafeSession = () => {
  if (!sessionPromise) {
    sessionPromise = supabase.auth.getSession().finally(() => {
      setTimeout(() => { sessionPromise = null; }, 2000); // Clear cache after a brief delay
    });
  }
  return sessionPromise;
};

function NotificationsTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    let channel: any;
    let intervalId: any;

    const setupBadge = async () => {
      try {
        const { data: { session }, error } = await getSafeSession();
        if (error || !session) return;
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
      } catch (err) {
        console.warn('NotificationsTabIcon setupBadge error:', err);
      }
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
      try {
        const { data: { session }, error } = await getSafeSession();
        if (error || !session) return;
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
      } catch (err) {
        console.warn('MessagesTabIcon setupBadge error:', err);
      }
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
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons
        name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
        size={22}
        color={color}
      />
      {unreadCount > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -6,
            right: -8,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#FF3B30',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: '#fff',
            paddingHorizontal: 3
          }}
        >
          <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>{badgeValue}</Text>
        </View>
      )}
    </View>
  );
}

const VISIBLE_TABS = ['index', 'allproperties', 'messages', 'profile'];

const CustomTabBar = ({ state, descriptors, navigation }: any) => {
  const router = useRouter();
  const routes = state.routes.filter(
    (route: any) => VISIBLE_TABS.includes(route.name)
  );

  return (
    <View
      style={{
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 34 : 16,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          backgroundColor: '#ffffff',
          borderRadius: 40,
          borderWidth: 1.5,
          borderColor: '#E8E8E8',
          paddingHorizontal: 8,
          height: 60,
          elevation: 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          alignItems: 'center',
        }}
      >
        {routes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === state.routes.indexOf(route);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={{
                flex: isFocused ? 2 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isFocused ? '#F0F1F3' : 'transparent',
                paddingVertical: 10,
                borderRadius: 24,
                marginHorizontal: 3,
              }}
            >
              {options.tabBarIcon
                ? options.tabBarIcon({ focused: isFocused, color: isFocused ? '#000' : '#999', size: 22 })
                : null}
              {isFocused && options.title && (
                <Text
                  style={{ marginLeft: 6, fontWeight: '700', fontSize: 12, color: '#000' }}
                  numberOfLines={1}
                >
                  {options.title}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#000',
          elevation: 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={() => router.push('/properties/new')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
        name="allproperties"
        options={{
          title: 'Properties',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "business" : "business-outline"} size={22} color={color} />
        }}
      />
      <Tabs.Screen name="landlordproperties" options={{ href: null }} />
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
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
        }}
      />

      {/* Hidden Screens */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="maintenance" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="applications" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="assigntenant" options={{ href: null }} />
    </Tabs>
  );
}