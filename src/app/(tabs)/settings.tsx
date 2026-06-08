import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
  Alert, ScrollView, Share, Modal, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeStore, ThemePreference } from '@/store/theme';
import { useLifelist } from '@/store/lifelist';
import { dbGetAllSightings, dbImportSightings } from '@/db';
import { Sighting } from '@/types';

const OCEAN_BLUE = '#006994';

interface BackupFile {
  version: 1;
  exportedAt: string;
  sightings: Omit<Sighting, 'id'>[];
}

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
  const loadLifelist = useLifelist(s => s.load);

  const [busy, setBusy] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importText, setImportText] = useState('');

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const sightings = dbGetAllSightings();
      if (sightings.length === 0) {
        Alert.alert('Nothing to export', 'Your life list is empty.');
        return;
      }
      const backup: BackupFile = {
        version: 1,
        exportedAt: new Date().toISOString(),
        // Strip local photoUris — file:// paths are device-specific and won't transfer.
        sightings: sightings.map(({ id: _id, photoUris: _photos, ...rest }) => rest),
      };
      await Share.share({
        title: 'Marlin life list backup',
        message: JSON.stringify(backup, null, 2),
      });
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    setImportText('');
    setImportModalVisible(true);
  };

  const confirmImport = () => {
    try {
      const data: BackupFile = JSON.parse(importText.trim());
      if (data.version !== 1 || !Array.isArray(data.sightings)) {
        Alert.alert('Invalid backup', 'This does not look like a Marlin backup.');
        return;
      }
      Alert.alert(
        'Restore life list?',
        `This will replace your current life list with ${data.sightings.length} sighting${data.sightings.length !== 1 ? 's' : ''} from the backup.\n\nExported: ${new Date(data.exportedAt).toLocaleDateString()}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: () => {
              dbImportSightings(data.sightings);
              loadLifelist();
              setImportModalVisible(false);
              Alert.alert('Restored', `${data.sightings.length} sighting${data.sightings.length !== 1 ? 's' : ''} imported.`);
            },
          },
        ]
      );
    } catch {
      Alert.alert('Invalid JSON', 'Could not parse the backup text. Make sure you copied the full export.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView contentContainerStyle={styles.scroll}>
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
                {active && <Ionicons name="checkmark" size={20} color={OCEAN_BLUE} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Data */}
        <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>DATA</Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder, isDark && styles.rowBorderDark]}
            onPress={handleExport}
            disabled={busy}>
            <View style={[styles.iconWrap, { backgroundColor: '#e6f4ea' }]}>
              <Ionicons name="arrow-up-circle-outline" size={20} color="#2e7d32" />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, isDark && styles.textDark]}>Export life list</Text>
              <Text style={styles.rowSub}>Save a backup file to share or store</Text>
            </View>
            <Ionicons name="share-outline" size={18} color={isDark ? '#555' : '#bbb'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, styles.rowBorder, isDark && styles.rowBorderDark]}
            onPress={handleImport}>
            <View style={[styles.iconWrap, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="arrow-down-circle-outline" size={20} color="#e65100" />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, isDark && styles.textDark]}>Import life list</Text>
              <Text style={styles.rowSub}>Paste backup text to restore</Text>
            </View>
            <Ionicons name="arrow-down-circle-outline" size={18} color={isDark ? '#555' : '#bbb'} />
          </TouchableOpacity>
        </View>

        {/* Export coverage info */}
        <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
          <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>What does export cover?</Text>
          <View style={styles.infoRow}>
            <Ionicons name="checkmark-circle" size={15} color="#2e7d32" style={styles.infoIcon} />
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              Sighting records — species, date, location, notes. Included in the exported file.
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="alert-circle" size={15} color="#e65100" style={styles.infoIcon} />
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              Your own sighting photos — not included, since the export is plain text and can't carry image files. Back up your photo gallery separately if you want to keep them.
            </Text>
          </View>
        </View>

        {/* About */}
        <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>ABOUT</Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder, isDark && styles.rowBorderDark]}
            onPress={() => Linking.openURL('https://fwille.github.io/marlin-privacy/')}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark-outline" size={20} color={isDark ? '#aaa' : '#555'} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, isDark && styles.textDark]}>Privacy policy</Text>
              <Text style={styles.rowSub}>How Marlin handles your data</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={isDark ? '#555' : '#bbb'} />
          </TouchableOpacity>
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
      </ScrollView>

      {/* Import paste modal */}
      <Modal
        visible={importModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setImportModalVisible(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.textDark]}>Import backup</Text>
              <TouchableOpacity onPress={() => setImportModalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={isDark ? '#aaa' : '#555'} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Paste your exported backup text below, then tap Restore.
            </Text>
            <TextInput
              style={[styles.pasteInput, isDark && styles.pasteInputDark]}
              multiline
              placeholder="Paste backup JSON here…"
              placeholderTextColor="#888"
              value={importText}
              onChangeText={setImportText}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.restoreBtn, !importText.trim() && styles.restoreBtnDisabled]}
              onPress={confirmImport}
              disabled={!importText.trim()}>
              <Text style={styles.restoreBtnText}>Restore</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  scroll: { paddingBottom: 40 },
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
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 14,
  },
  modalSheetDark: { backgroundColor: '#112240' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  modalHint: { fontSize: 13, color: '#888' },
  pasteInput: {
    borderWidth: 1, borderColor: '#d0dae6', borderRadius: 10,
    padding: 12, fontSize: 12, fontFamily: 'monospace',
    color: '#111', height: 160, textAlignVertical: 'top',
  },
  pasteInputDark: { borderColor: '#1e3050', backgroundColor: '#0a1628', color: '#fff' },
  infoBox: {
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: '#f0f4f8', borderRadius: 12, padding: 14, gap: 8,
  },
  infoBoxDark: { backgroundColor: '#0d1e33' },
  infoTitle: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 2 },
  infoTitleDark: { color: '#8899aa' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoIcon: { marginTop: 1 },
  infoText: { flex: 1, fontSize: 12, color: '#555', lineHeight: 18 },
  infoTextDark: { color: '#8899aa' },
  restoreBtn: {
    backgroundColor: OCEAN_BLUE, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  restoreBtnDisabled: { opacity: 0.4 },
  restoreBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
