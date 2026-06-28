import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, List, ActivityIndicator, Button, Text } from 'react-native-paper';
import { MapPicker, type MapPickerHandle } from './MapPicker';
import { searchAddress, reverseGeocode, type AddressSuggestion } from '../services/geocoding';
import { DEFAULT_COORDS } from '../services/geolocation';

export interface AddressValue {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  /** Toạ độ khởi tạo cho ghim map (vd vị trí GPS hiện tại). */
  initialCoords?: { lat: number; lng: number } | null;
  /** Giá trị địa chỉ chuẩn hiện tại (do cha quản lý). */
  value: AddressValue | null;
  onChange: (v: AddressValue) => void;
  error?: string;
}

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  error: '#ba1a1a',
};

const SEARCH_DEBOUNCE_MS = 700;
const MIN_QUERY_LEN = 3;

/**
 * Chọn địa chỉ lấy hàng. Luồng CHÍNH: gõ từ khoá → chọn từ danh sách đề xuất
 * (Nominatim). PHƯƠNG ÁN 2: bấm "Tinh chỉnh trên bản đồ" để kéo ghim — khi đó
 * địa chỉ được reverse geocode và GHI ĐÈ ô địa chỉ; toạ độ luôn khớp điểm trên map.
 */
export function AddressPicker({ initialCoords, value, onChange, error }: Props) {
  const [query, setQuery] = useState(value?.address ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [reversing, setReversing] = useState(false);

  const mapRef = useRef<MapPickerHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** true khi query vừa được set do chọn gợi ý / reverse → không tự search lại. */
  const skipSearchRef = useRef(false);

  /** Toạ độ hiện hành dùng khi người dùng gõ tay (không đổi điểm trên map). */
  const currentCoords = value ?? initialCoords ?? DEFAULT_COORDS;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback((q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setNoResults(false);
    searchAddress(q, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setSuggestions(items);
          setNoResults(items.length === 0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  }, []);

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    skipSearchRef.current = false;
    setQuery('');
    setSuggestions([]);
    setNoResults(false);
    setSearching(false);
    onChange({ address: '', lat: currentCoords.lat, lng: currentCoords.lng });
  };

  const onChangeQuery = (text: string) => {
    setQuery(text);
    // Gõ tay vẫn cập nhật địa chỉ (giữ nguyên toạ độ hiện hành).
    onChange({ address: text, lat: currentCoords.lat, lng: currentCoords.lng });

    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_QUERY_LEN) {
      abortRef.current?.abort();
      setSuggestions([]);
      setNoResults(false);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const onSelectSuggestion = (s: AddressSuggestion) => {
    skipSearchRef.current = true;
    setQuery(s.displayName);
    setSuggestions([]);
    setNoResults(false);
    abortRef.current?.abort();
    onChange({ address: s.displayName, lat: s.lat, lng: s.lng });
    if (showMap) mapRef.current?.recenter(s.lat, s.lng);
  };

  const onMapPick = (lat: number, lng: number) => {
    setReversing(true);
    reverseGeocode(lat, lng)
      .then((addr) => {
        const address = addr || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        skipSearchRef.current = true;
        setQuery(address);
        setSuggestions([]);
        setNoResults(false);
        onChange({ address, lat, lng });
      })
      .finally(() => setReversing(false));
  };

  return (
    <View>
      <TextInput
        mode="outlined"
        placeholder="Nhập địa chỉ rồi chọn từ gợi ý (VD: 12 Nguyễn Huệ, Q1)"
        value={query}
        onChangeText={onChangeQuery}
        left={<TextInput.Icon icon="magnify" />}
        right={
          searching ? (
            <TextInput.Icon icon={() => <ActivityIndicator size={18} color={COLORS.primary} />} />
          ) : query.length > 0 ? (
            <TextInput.Icon icon="close-circle" onPress={handleClear} forceTextInputFocus={false} />
          ) : undefined
        }
        outlineColor={COLORS.outline}
        activeOutlineColor={COLORS.primary}
        style={styles.input}
        error={!!error}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {noResults && !searching ? (
        <Text style={styles.noResultText}>Không tìm thấy địa chỉ phù hợp</Text>
      ) : null}

      {suggestions.length > 0 && (
        <View style={styles.suggestBox}>
          {suggestions.map((s, i) => (
            <List.Item
              key={`${s.lat},${s.lng},${i}`}
              title={s.displayName}
              titleNumberOfLines={2}
              titleStyle={styles.suggestText}
              left={(props) => <List.Icon {...props} icon="map-marker-outline" color={COLORS.onSurfaceVariant} />}
              onPress={() => onSelectSuggestion(s)}
              style={styles.suggestItem}
            />
          ))}
        </View>
      )}

      <Button
        mode="text"
        icon={showMap ? 'chevron-up' : 'map-marker-radius'}
        onPress={() => setShowMap((v) => !v)}
        textColor={COLORS.primary}
        compact
        style={styles.mapToggle}
      >
        {showMap ? 'Ẩn bản đồ' : 'Tinh chỉnh trên bản đồ'}
      </Button>

      {showMap && (
        <View>
          <MapPicker
            ref={mapRef}
            initialLat={currentCoords.lat}
            initialLng={currentCoords.lng}
            onPick={onMapPick}
          />
          {reversing && (
            <View style={styles.reversingRow}>
              <ActivityIndicator size={16} color={COLORS.primary} />
              <Text style={styles.reversingText}>Đang xác nhận địa chỉ…</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: COLORS.surface },
  errorText: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  noResultText: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 6, fontStyle: 'italic' },
  suggestBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  suggestItem: { paddingVertical: 0 },
  suggestText: { fontSize: 13, color: COLORS.onSurface },
  mapToggle: { alignSelf: 'flex-start', marginTop: 4 },
  reversingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  reversingText: { fontSize: 12, color: COLORS.onSurfaceVariant },
});
