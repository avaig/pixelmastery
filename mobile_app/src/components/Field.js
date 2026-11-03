import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { THEME } from '../config';

export default function Field({ label, value, onChangeText, placeholder, keyboardType, maxLength, multiline, autoCapitalize = 'sentences' }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8993A4"
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { color: THEME.ink, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: THEME.border, borderRadius: 11, backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: THEME.ink, fontSize: 15 },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
});
