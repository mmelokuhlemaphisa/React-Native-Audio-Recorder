import { Audio } from "expo-av";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons"; // Added for better icons
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface VoiceNote {
  id: string;
  uri: string;
  name: string;
  date: string;
  duration: number;
  starred?: boolean;
}

export default function ListScreen() {
  const router = useRouter();
  const isNative = Platform.OS !== "web";

  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [search, setSearch] = useState("");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const [playbackProgresses, setPlaybackProgresses] = useState<
    Record<string, { position: number; duration: number; width?: number }>
  >({});
  const widthsRef = useRef<Record<string, number>>({});
  const seekRaf = useRef<Record<string, number | null>>({});

  const formatMillis = (ms: number) => {
    const s = Math.floor((ms || 0) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const getFileSystem = async () => {
    if (!isNative) return null;
    return await import("expo-file-system/legacy");
  };

  const loadNotes = async () => {
    if (!isNative) return;
    try {
      const FileSystem = await getFileSystem();
      if (!FileSystem) return;
      const file = FileSystem.documentDirectory + "notes.json";
      const info = await FileSystem.getInfoAsync(file);

      if (info.exists) {
        const data = await FileSystem.readAsStringAsync(file);
        setNotes(JSON.parse(data));
      } else {
        setNotes([]);
      }
    } catch (e) {
      console.error("Load notes error", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadNotes();
      return () => {
        sound?.unloadAsync();
        setSound(null);
        setPlayingId(null);
      };
    }, [sound]),
  );

  const togglePlay = async (note: VoiceNote) => {
    try {
      if (playingId === note.id && sound) {
        await sound.pauseAsync();
        setPlayingId(null);
        return;
      }
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      const { sound: playback } = await Audio.Sound.createAsync(
        { uri: note.uri },
        { shouldPlay: true },
      );
      playback.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setPlaybackProgresses((prev) => ({
          ...prev,
          [note.id]: {
            ...prev[note.id],
            position: status.positionMillis || 0,
            duration: status.durationMillis || note.duration || 1,
          },
        }));
        if (status.didJustFinish) {
          setPlayingId(null);
          setSound(null);
        }
      });
      setSound(playback);
      setPlayingId(note.id);
    } catch (err) {
      console.warn("Playback error:", err);
    }
  };

  const seek = (id: string, x: number, isFinal = false) => {
    const w = widthsRef.current[id] || 1;
    const percent = Math.max(0, Math.min(1, x / w));
    const duration =
      playbackProgresses[id]?.duration ||
      notes.find((n) => n.id === id)?.duration ||
      1;
    const position = percent * duration;

    setPlaybackProgresses((prev) => ({
      ...prev,
      [id]: { ...prev[id], position, duration },
    }));

    if (!sound || playingId !== id) return;
    const existing = seekRaf.current[id];
    if (existing) cancelAnimationFrame(existing);

    if (isFinal) {
      sound.setPositionAsync(position).catch(() => {});
      seekRaf.current[id] = null;
      return;
    }

    seekRaf.current[id] = requestAnimationFrame(() => {
      sound.setPositionAsync(position).catch(() => {});
      seekRaf.current[id] = null;
    });
  };

  const renderItem = ({ item }: { item: VoiceNote }) => {
    const isPlaying = playingId === item.id;
    const progress = playbackProgresses[item.id] || {
      position: 0,
      duration: item.duration,
    };
    const percent =
      progress.duration > 0 ? (progress.position / progress.duration) * 100 : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() =>
          router.push({ pathname: "/note/[id]", params: { id: item.id } })
        }
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <Text style={styles.noteName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.noteMeta}>
              {item.date} • {formatMillis(item.duration)}
            </Text>
          </View>
          {item.starred && <Ionicons name="star" size={16} color="#f59e0b" />}
        </View>

        <View style={styles.cardBody}>
          <View
            style={styles.progressBarContainer}
            onLayout={(e) =>
              (widthsRef.current[item.id] = e.nativeEvent.layout.width)
            }
            onStartShouldSetResponder={() => true}
            onResponderMove={(e) => seek(item.id, e.nativeEvent.locationX)}
            onResponderRelease={(e) =>
              seek(item.id, e.nativeEvent.locationX, true)
            }
          >
            <View style={styles.progressBarBackground} />
            <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
            <View style={[styles.progressBarHandle, { left: `${percent}%` }]} />
          </View>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              togglePlay(item);
            }}
            style={[styles.smallPlayButton, isPlaying && styles.playingButton]}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={18}
              color={isPlaying ? "#fff" : "#4f46e5"}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>My Recordings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons
          name="search-outline"
          size={20}
          color="#94a3b8"
          style={styles.searchIcon}
        />
        <TextInput
          placeholder="Search memos..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={notes.filter((n) =>
          n.name.toLowerCase().includes(search.toLowerCase()),
        )}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="mic-off-outline" size={60} color="#cbd5e1" />
            <Text style={styles.emptyText}>No recordings found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 60,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#fff",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  screenTitle: { fontSize: 20, fontWeight: "800", color: "#1e293b" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    paddingHorizontal: 15,
    borderRadius: 15,
    height: 50,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: "#1e293b", fontWeight: "500" },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 15,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardInfo: { flex: 1 },
  noteName: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  noteMeta: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  cardBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressBarContainer: { flex: 1, height: 20, justifyContent: "center" },
  progressBarBackground: {
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    width: "100%",
  },
  progressBarFill: {
    height: 6,
    backgroundColor: "#4f46e5",
    borderRadius: 3,
    position: "absolute",
  },
  progressBarHandle: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4f46e5",
    borderWidth: 2,
    borderColor: "#fff",
    transform: [{ translateX: -6 }],
  },
  smallPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f5f3ff",
    justifyContent: "center",
    alignItems: "center",
  },
  playingButton: { backgroundColor: "#4f46e5" },
  emptyContainer: { alignItems: "center", marginTop: 100 },
  emptyText: {
    marginTop: 15,
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "600",
  },
});
