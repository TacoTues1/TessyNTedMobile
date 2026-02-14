import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
    const router = useRouter();

    // Animations
    const headerFade = useRef(new Animated.Value(0)).current;
    const headerTranslate = useRef(new Animated.Value(-50)).current;
    const cardTranslate = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        Animated.sequence([
            // 1. Logo & Name Fade In + Slide Down slightly
            Animated.parallel([
                Animated.timing(headerFade, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.spring(headerTranslate, {
                    toValue: 0,
                    friction: 6,
                    useNativeDriver: true,
                }),
            ]),
            // 2. White Card Slides Up from Bottom
            Animated.delay(300),
            Animated.spring(cardTranslate, {
                toValue: 0,
                friction: 7,
                tension: 20,
                useNativeDriver: true,
            })
        ]).start();
    }, []);

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Background Image (Top Section) */}
            <ImageBackground
                source={require('../assets/images/logo_login.jpg')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                {/* Dark Overlay for contrast */}
                <View style={styles.overlay} />

                {/* Header: Logo + System Name */}
                <Animated.View
                    style={[
                        styles.headerContainer,
                        {
                            opacity: headerFade,
                            transform: [{ translateY: headerTranslate }]
                        }
                    ]}
                >
                    <View style={styles.logoCircle}>
                        {/* Using icon.png for the original full-color logo */}
                        <Image source={require('../assets/images/icon.png')} style={styles.logoIcon} resizeMode="contain" />
                    </View>
                    <Text style={styles.systemName}>TessyNTed</Text>
                </Animated.View>
            </ImageBackground>

            {/* White Bottom Sheet Card */}
            <Animated.View
                style={[
                    styles.bottomCard,
                    { transform: [{ translateY: cardTranslate }] }
                ]}
            >
                {/* Decorative Pill/Handle */}
                {/* <View style={styles.handleContainer}>
                    <View style={styles.handle} />
                    <View style={[styles.handle, { backgroundColor: '#ea580c', width: 20, marginLeft: 4 }]} />
                </View> */}

                <Text style={styles.title}>
                    A <Text style={styles.highlight}>Rental</Text> Management Platform
                </Text>

                <Text style={styles.subtitle}>
                    Streamline your property workflow, track payments, and connect with tenants effortlessly.
                </Text>

                <View style={styles.spacer} />

                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.replace('/login')}
                    activeOpacity={0.8}
                >
                    <Text style={styles.primaryButtonText}>Get Started</Text>
                </TouchableOpacity>

                <View style={styles.loginRow}>
                    <Text style={styles.loginText}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => router.replace('/login')}>
                        <Text style={styles.loginLink}>Log In</Text>
                    </TouchableOpacity>
                </View>

            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        justifyContent: 'center', // Center content vertically
        alignItems: 'center',
        paddingBottom: height * 0.35, // Push content up to center it in the visible area above the card
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)', // Darken image to make text pop
    },
    headerContainer: {
        alignItems: 'center',
        gap: 15,
    },
    logoCircle: {
        width: 120,
        height: 120,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.2)',
        backdropFilter: 'blur(10px)', // Works on some platforms, irrelevant for RN without proper support but adds intent
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    logoIcon: {
        width: 100,
        height: 100,
    },
    systemName: {
        fontSize: 50,
        fontWeight: '800',
        color: 'white',
        letterSpacing: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    },
    bottomCard: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopLeftRadius: 35,
        borderTopRightRadius: 35,
        padding: 30,
        paddingBottom: 50,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: -4,
        },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 20,
        // Adjust this value to change the height of the white bar (0.45 = 45% of screen height)
        height: height * 0.35,
    },
    handleContainer: {
        flexDirection: 'row',
        marginBottom: 25,
    },
    handle: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#e5e5e5',
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: '#111',
        textAlign: 'center',
        marginBottom: 15,
        lineHeight: 34,
    },
    highlight: {
        color: '#ea580c', // Orange-ish to match "Fashion" highlight in ref
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
        maxWidth: '90%',
    },
    spacer: {
        flex: 1,
    },
    primaryButton: {
        width: '100%',
        backgroundColor: '#000000ff', // Match highlight
        paddingVertical: 18,
        borderRadius: 30,
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#000000ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    primaryButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    loginRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    loginText: {
        fontSize: 13,
        color: '#888',
        fontWeight: '600',
    },
    loginLink: {
        fontSize: 13,
        color: '#ea580c',
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
});
