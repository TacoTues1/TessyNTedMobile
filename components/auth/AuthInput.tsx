import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AuthInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  isPassword?: boolean;
  showPassword?: boolean;
  togglePassword?: () => void;
}

export default function AuthInput({ 
  label, 
  value, 
  onChangeText, 
  placeholder, 
  secureTextEntry, 
  isPassword, 
  showPassword, 
  togglePassword 
}: AuthInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
        />
        {isPassword && (
          <TouchableOpacity onPress={togglePassword} style={styles.icon}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="gray" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 5, color: '#333' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
  input: { flex: 1, padding: 12, fontSize: 16 },
  icon: { padding: 10 },
});