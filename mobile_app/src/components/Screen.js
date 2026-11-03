import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../config';

export function Screen({ children, scroll = true, style }) {
  const content = scroll
    ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, style]}>{children}</ScrollView>
    : <View style={[styles.content, styles.fill, style]}>{children}</View>;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>{content}</SafeAreaView>;
}

export function PageTitle({ eyebrow, children, detail }) {
  return (
    <View style={styles.titleWrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={styles.title}>{children}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppButton({ title, onPress, secondary = false, disabled = false, style }) {
  return (
    <Text
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton, style]}
    >
      {title}
    </Text>
  );
}

export function Notice({ children, tone = 'info' }) {
  return <View style={[styles.notice, tone === 'warning' && styles.warningNotice, tone === 'error' && styles.errorNotice]}><Text style={styles.noticeText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.canvas },
  content: { padding: 20, gap: 16 },
  fill: { flex: 1 },
  titleWrap: { gap: 6, marginBottom: 4 },
  eyebrow: { color: THEME.accent, fontWeight: '800', fontSize: 11, letterSpacing: 1.2 },
  title: { color: THEME.ink, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  detail: { color: THEME.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: THEME.white, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: THEME.border, gap: 10 },
  button: { overflow: 'hidden', backgroundColor: THEME.navy, color: THEME.white, textAlign: 'center', fontWeight: '800', fontSize: 15, paddingVertical: 15, paddingHorizontal: 18, borderRadius: 13 },
  secondaryButton: { backgroundColor: '#E9EFF6', color: THEME.navy },
  disabledButton: { opacity: 0.48 },
  notice: { backgroundColor: '#EAF3F7', borderColor: '#C5DDE8', borderWidth: 1, padding: 13, borderRadius: 12 },
  warningNotice: { backgroundColor: '#FFF4E5', borderColor: '#F2D2A4' },
  errorNotice: { backgroundColor: '#FEF3F2', borderColor: '#F2B8B5' },
  noticeText: { color: THEME.ink, fontSize: 13, lineHeight: 19 },
});
