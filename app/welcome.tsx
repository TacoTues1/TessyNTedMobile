import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const FULL_TEXT = 'Welcome to TessyNTed - A Rental Management Platform';

export default function WelcomeScreen() {
    const router = useRouter();
    const [displayedText, setDisplayedText] = useState('');
    const [typingDone, setTypingDone] = useState(false);
    const charIndex = useRef(0);

    // Animated values
    const logoScale = useRef(new Animated.Value(0)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const buttonOpacity = useRef(new Animated.Value(0)).current;
    const buttonTranslateY = useRef(new Animated.Value(30)).current;
    const cursorOpacity = useRef(new Animated.Value(1)).current;
    const subtitleOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // 1. Logo entrance animation
        Animated.sequence([
            Animated.parallel([
                Animated.spring(logoScale, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(logoOpacity, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ]),
        ]).start(() => {
            // 2. Start typing animation after logo appears
            startTyping();
        });

        // Blinking cursor
        Animated.loop(
            Animated.sequence([
                Animated.timing(cursorOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(cursorOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const startTyping = () => {
        const interval = setInterval(() => {
            if (charIndex.current < FULL_TEXT.length) {
                setDisplayedText(FULL_TEXT.substring(0, charIndex.current + 1));
                charIndex.current += 1;
            } else {
                clearInterval(interval);
                setTypingDone(true); // Hide cursor
                // 3. Show button after typing finishes
                Animated.parallel([
                    Animated.timing(subtitleOpacity, {
                        toValue: 1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.timing(buttonOpacity, {
                        toValue: 1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.spring(buttonTranslateY, {
                        toValue: 0,
                        friction: 6,
                        useNativeDriver: true,
                    }),
                ]).start();
            }
        }, 20); // Speed of typing (ms per character) — lower = faster, higher = slower
    };

    // Split text for styling: "Welcome to" normal, "TessyNTed" bold, rest normal
    const renderTypedText = () => {
        const parts = displayedText.split(/(TessyNTed)/);
        return parts.map((part, index) => {
            if (part === 'TessyNTed') {
                return (
                    <Text key={index} style={styles.brandText}>{part}</Text>
                );
            }
            return <Text key={index}>{part}</Text>;
        });
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#ffffff', '#f0f0f0', '#e8e8e8']}
                style={styles.gradient}
            >
                <SafeAreaView style={styles.safeArea}>
                    {/* Top spacer */}
                    <View style={styles.topSpacer} />

                    {/* Logo Section */}
                    <Animated.View
                        style={[
                            styles.logoContainer,
                            {
                                opacity: logoOpacity,
                                transform: [{ scale: logoScale }],
                            },
                        ]}
                    >
                        <View style={styles.logoShadow}>
                            <Image
                                source={require('../assets/images/home.png')}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                        </View>
                    </Animated.View>

                    {/* Typing Text Section */}
                    <View style={styles.textContainer}>
                        <Text style={styles.typingText}>
                            {renderTypedText()}
                            {!typingDone && <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>|</Animated.Text>}
                        </Text>

                        {/* Subtitle */}
                        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
                            Simplify your rental management experience
                        </Animated.Text>
                    </View>

                    {/* Bottom Section: Get Started Button */}
                    <Animated.View
                        style={[
                            styles.bottomContainer,
                            {
                                opacity: buttonOpacity,
                                transform: [{ translateY: buttonTranslateY }],
                            },
                        ]}
                    >
                        {/* Feature pills */}
                        <View style={styles.featurePills}>
                            {[
                                { icon: 'home-outline' as const, label: 'Properties' },
                                { icon: 'cash-outline' as const, label: 'Payments' },
                                { icon: 'chatbubble-outline' as const, label: 'Messages' },
                            ].map((item, i) => (
                                <View key={i} style={styles.pill}>
                                    <Ionicons name={item.icon} size={14} color="#333" />
                                    <Text style={styles.pillText}>{item.label}</Text>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={styles.getStartedBtn}
                            onPress={() => router.replace('/login')}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.getStartedText}>Get Started</Text>
                            <View style={styles.arrowCircle}>
                                <Ionicons name="arrow-forward" size={18} color="black" />
                            </View>
                        </TouchableOpacity>

                        <Text style={styles.versionText}>Version 1.0.0</Text>
                    </Animated.View>
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    gradient: { flex: 1 },
    safeArea: { flex: 1, paddingHorizontal: 30 },
    topSpacer: { flex: 0.1 },

    // Logo
    logoContainer: { alignItems: 'center', marginBottom: 0 },
    logoShadow: {
        width: 220, height: 220,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1, shadowRadius: 20,
        elevation: 10,
    },
    logo: { width: 150, height: 150 },

    // Typing Text
    textContainer: { alignItems: 'center', paddingHorizontal: 10, flex: 1, justifyContent: 'flex-start' },
    typingText: {
        fontSize: 28, fontWeight: '700', color: '#111',
        textAlign: 'center', lineHeight: 38, letterSpacing: -0.5,
    },
    brandText: {
        fontWeight: '900', color: '#000',
        fontSize: 30,
    },
    cursor: { fontSize: 28, fontWeight: '300', color: '#999' },
    subtitle: {
        fontSize: 14, color: '#888', marginTop: 16,
        textAlign: 'center', lineHeight: 20,
    },

    // Feature pills
    featurePills: {
        flexDirection: 'row', justifyContent: 'center',
        gap: 10, marginBottom: 24,
    },
    pill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb',
    },
    pillText: { fontSize: 12, fontWeight: '600', color: '#333' },

    // Get Started Button
    bottomContainer: { paddingBottom: 20 },
    getStartedBtn: {
        backgroundColor: '#000', borderRadius: 16,
        paddingVertical: 18, paddingHorizontal: 28,
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
    },
    getStartedText: {
        color: '#fff', fontSize: 17, fontWeight: '800',
        letterSpacing: 0.3,
    },
    arrowCircle: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: '#fff', alignItems: 'center',
        justifyContent: 'center',
    },
    versionText: {
        textAlign: 'center', marginTop: 14,
        fontSize: 12, color: '#bbb', fontWeight: '500',
    },
});
