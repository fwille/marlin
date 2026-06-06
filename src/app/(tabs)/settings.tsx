import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeStore, ThemePreference } from '@/store/theme';

const OCEAN_BLUE = '#006994';

const THEMES: { value: ThemePreference; label: string; icon: string; description: string }[] = [
  { value: 'system',  label: 'System default', icon: 'phone-portrait-outline', description: 'Follow device setting' },
  { value: 'light',   label: 'Light',           icon: 'sunny-outline',          description: 'Always light' },
  { value: 'dark',    label: 'Dark',            icon: 'moon-outline',           description: 'Always dark' },
];

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const preference = useThemeStore(s => s.preference);
  const setTheme = useThemeStore(s => s.setTheme);

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>Settings</Text>
      </View>

      {/* Appearance */}
      <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>APPEARANCE</Text>
      <View style={[styles.card, isDark && styles.cardDark]}>
        {THEMES.map((t, i) => {
          const active = preference === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[
                styles.row,
                i < THEMES.length - 1 && [styles.rowBorder, isDark && styles.rowBorderDark],
              ]}
              onPress={() => setTheme(t.value)}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Ionicons
                  name={t.icon as any}
                  size={20}
                  color={active ? '#fff' : (isDark ? '#aaa' : '#555')}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, isDark && styles.textDark]}>{t.label}</Text>
                <Text style={styles.rowSub}>{t.description}</Text>
              </View>
              {active && (
                <Ionicons name="checkmark" size={20} color={OCEAN_BLUE} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>ABOUT</Text>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={[styles.row, styles.rowBorder, isDark && styles.rowBorderDark]}>
          <View style={styles.iconWrap}>
            <Ionicons name="person-outline" size={20} color={isDark ? '#aaa' : '#555'} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, isDark && styles.textDark]}>Developer</Text>
            <Text style={styles.rowSub}>Fiona Wille</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('https://www.inaturalist.org')}>
          <View style={styles.iconWrap}>
            <Ionicons name="leaf-outline" size={20} color={isDark ? '#aaa' : '#555'} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, isDark && styles.textDark]}>Species data</Text>
            <Text style={styles.rowSub}>iNaturalist · © contributors, CC BY-NC</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={isDark ? '#555' : '#bbb'} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  textDark: { color: '#fff' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, paddingHorizontal: 16, marginTop: 24, marginBottom: 6,
  },
  sectionLabelDark: { color: '#556' },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardDark: { backgroundColor: '#112240' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8edf2' },
  rowBorderDark: { borderBottomColor: '#1e3050' },
  iconWrap: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: '#e8f0f8', alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: OCEAN_BLUE },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#111' },
  rowSub: { fontSize: 12, color: '#888', marginTop: 1 },
});
