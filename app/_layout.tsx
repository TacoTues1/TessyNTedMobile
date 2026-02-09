import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

export default function RootLayout() {
  // --- DEEP LINK LISTENER ---
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      console.log("Deep link received:", event.url);
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="properties/[id]" options={{ headerShown: true, title: 'Property Details', headerBackTitle: 'Back' }} />
      <Stack.Screen name="properties/new" options={{ headerShown: true, title: 'Add Property', headerBackTitle: 'Back' }} />
      <Stack.Screen name="properties/edit/[id]" options={{ headerShown: true, title: 'Edit Property', headerBackTitle: 'Back' }} />
    </Stack>
  );
}