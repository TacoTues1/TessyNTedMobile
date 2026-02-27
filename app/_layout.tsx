import { Pacifico_400Regular, useFonts } from '@expo-google-fonts/pacifico';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Pacifico_400Regular,
  });

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

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="properties/[id]" options={{ headerShown: true, title: 'Property Details', headerBackTitle: 'Back' }} />
      <Stack.Screen name="properties/new" options={{ headerShown: true, title: 'Add Property', headerBackTitle: 'Back' }} />
      <Stack.Screen name="properties/edit/[id]" options={{ headerShown: true, title: 'Edit Property', headerBackTitle: 'Back' }} />
    </Stack>
  );
}