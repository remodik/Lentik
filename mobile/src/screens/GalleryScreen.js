import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, Alert,
  Modal, Dimensions, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { listGallery, uploadToGallery } from '../api/gallery';
import { useFamily } from '../context/FamilyContext';
import { API_BASE_URL } from '../config';
import { colors, fontSize, spacing, radius, buttonH } from '../theme';

const { width } = Dimensions.get('window');
const COLS = 2;
const ITEM_SIZE = (width - spacing.md * 3) / COLS;

const buildUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL}${url}`;
};

export default function GalleryScreen() {
  const { currentFamily } = useFamily();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null); // полноэкранный просмотр

  const loadGallery = useCallback(async () => {
    try {
      const { data } = await listGallery(currentFamily.family_id);
      setItems(data);
    } catch {
      // Тихая ошибка
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFamily]);

  useEffect(() => { loadGallery(); }, []);

  const onRefresh = () => { setRefreshing(true); loadGallery(); };

  const handleUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Доступ', 'Нужен доступ к галерее для загрузки фото');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';
    setUploading(true);
    try {
      await uploadToGallery(currentFamily.family_id, asset.uri, fileName, mimeType, null);
      await loadGallery();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Ошибка загрузки';
      Alert.alert('Ошибка', String(msg));
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Шапка */}
      <View style={styles.header}>
        <Text style={styles.title}>Галерея</Text>
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <Ionicons name={uploading ? 'hourglass-outline' : 'add-circle'} size={30} color={colors.primary} />
          <Text style={styles.uploadText}>{uploading ? 'Загрузка...' : 'Добавить'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={64} color={colors.primaryLight} />
          <Text style={styles.emptyTitle}>Нет фотографий</Text>
          <Text style={styles.emptyText}>Нажмите «Добавить» чтобы загрузить первое фото</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={handleUpload} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={24} color={colors.white} />
            <Text style={styles.emptyBtnText}>Загрузить фото</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={COLS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.cell}
              onPress={() => setSelected(item)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: buildUrl(item.url) }}
                style={styles.thumb}
                resizeMode="cover"
              />
              {item.uploaded_by_name && (
                <View style={styles.cellFooter}>
                  <Text style={styles.cellAuthor} numberOfLines={1}>{item.uploaded_by_name}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Полноэкранный просмотр */}
      <Modal visible={!!selected} animationType="fade" transparent>
        <View style={styles.fullOverlay}>
          <TouchableOpacity style={styles.fullClose} onPress={() => setSelected(null)}>
            <Ionicons name="close-circle" size={44} color={colors.white} />
          </TouchableOpacity>
          {selected && (
            <Image
              source={{ uri: buildUrl(selected.url) }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
          {selected?.caption && (
            <View style={styles.fullCaption}>
              <Text style={styles.fullCaptionText}>{selected.caption}</Text>
            </View>
          )}
          {selected?.uploaded_by_name && (
            <View style={styles.fullMeta}>
              <Text style={styles.fullMetaText}>Загрузил: {selected.uploaded_by_name}</Text>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.xs },
  uploadText: { fontSize: fontSize.base, fontWeight: '600', color: colors.primary },
  grid: { padding: spacing.md, gap: spacing.md },
  row: { gap: spacing.md },
  cell: {
    width: ITEM_SIZE, height: ITEM_SIZE,
    borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: colors.surfaceWarm,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
  },
  thumb: { width: '100%', height: '100%' },
  cellFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  cellAuthor: { fontSize: fontSize.xs, color: colors.white },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 26 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl, height: buttonH,
    borderRadius: radius.md, marginTop: spacing.xl,
  },
  emptyBtnText: { fontSize: fontSize.base, fontWeight: '700', color: colors.white },
  fullOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  fullClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullImage: { width: width, height: width * 1.2 },
  fullCaption: { position: 'absolute', bottom: 80, paddingHorizontal: spacing.xl },
  fullCaptionText: { fontSize: fontSize.base, color: colors.white, textAlign: 'center' },
  fullMeta: { position: 'absolute', bottom: 40, paddingHorizontal: spacing.xl },
  fullMetaText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
