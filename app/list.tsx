import { Audio } from "expo-av";
import { useFocusEffect, useRouter } from "expo-router";
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

  // Per-note playback progress: position, duration, optional width
  const [playbackProgresses, setPlaybackProgresses] = useState<
    Record<string, { position: number; duration: number; width?: number }>
  >({});
  const widthsRef = useRef<Record<string, number>>({}); // store per-item layout widths safely

  // Format milliseconds to M:SS
  const formatMillis = (ms: number) => {
    const s = Math.floor((ms || 0) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // preview values while scrubbing so we can show a tooltip
  const [scrubPreview, setScrubPreview] = useState<
    Record<string, number | null>
  >({});

  /* ---------------- FILE SYSTEM ---------------- */
  const getFileSystem = async () => {
    if (!isNative) return null;
    return await import("expo-file-system/legacy");
  };

  /* ---------------- LOAD NOTES ---------------- */
  const loadNotes = async () => {
    if (!isNative) return;
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
  };

  useFocusEffect(
    useCallback(() => {
      loadNotes();
      return () => {
        sound?.unloadAsync();
        setSound(null);
        setPlayingId(null);
      };
    }, [])
  );

  /* ---------------- PLAY / PAUSE ---------------- */
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
        { shouldPlay: true }
      );

      playback.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        setPlaybackProgresses((prev) => ({
          ...prev,
          [note.id]: {
            ...prev[note.id],
            position: status.positionMillis || 0,
            duration:
              status.durationMillis ||
              prev[note.id]?.duration ||
              note.duration ||
              1,
            width: prev[note.id]?.width,
          },
        }));

        if (status.didJustFinish) {
          setPlayingId(null);
          playback.unloadAsync().catch(() => {});
          setSound(null);
        }
      });

      setSound(playback);
      setPlayingId(note.id);
    } catch (err) {
      console.warn("Playback error:", err);
    }
  };

  /* ---------------- SEEK ---------------- */
  // RAF-per-id throttles
  const seekRaf = useRef<Record<string, number | null>>({});

  const seek = (id: string, x: number, isFinal = false) => {
    const w = widthsRef.current[id] || playbackProgresses[id]?.width || 1;
    if (!w) return;
    const percent = Math.max(0, Math.min(1, x / w));
    const duration =
      playbackProgresses[id]?.duration ||
      notes.find((n) => n.id === id)?.duration ||
      1;
    const position = percent * duration;

    // Immediate UI feedback for this note only
    setPlaybackProgresses((prev) => ({
      ...prev,
      [id]: { ...prev[id], position, duration },
    }));

    // If no active sound or different item, don't touch the native player
    if (!sound || playingId !== id) return;

    // Throttle native seeks per-id
    const existing = seekRaf.current[id];
    if (existing) cancelAnimationFrame(existing);

    if (isFinal) {
      // apply immediately
      sound
        .setPositionAsync(position)
        .catch((e) => console.warn("seek final failed", e));
      seekRaf.current[id] = null;
      return;
    }

    seekRaf.current[id] = requestAnimationFrame(() => {
      sound
        .setPositionAsync(position)
        .catch((e) => console.warn("seek setPositionAsync failed", e));
      seekRaf.current[id] = null;
    });
  };

  /* ---------------- RENDER ITEM ---------------- */
  const renderItem = ({ item }: { item: VoiceNote }) => {
    const isPlaying = playingId === item.id;
    const progressFor = playbackProgresses[item.id] || {
      position: 0,
      duration: item.duration,
    };
    const percent =
      progressFor.duration > 0
        ? (progressFor.position / progressFor.duration) * 100
        : 0;
    const preview = scrubPreview[item.id];
    const displayPercent =
      typeof preview === "number" && progressFor.duration
        ? (preview / progressFor.duration) * 100
        : percent;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/note/${item.id}`)}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.date} • {formatMillis(item.duration)}
              {item.starred ? " • ⭐" : ""}
            </Text>

            {/* 🎚 PROGRESS BAR (always visible, supports scrubbing) */}
            <View
              style={styles.progressBar}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                widthsRef.current[item.id] = w;
                setPlaybackProgresses((p) => ({
                  ...p,
                  [item.id]: { ...p[item.id], width: w },
                }));
              }}
              onStartShouldSetResponder={() => true}
              onResponderMove={(e) => seek(item.id, e.nativeEvent.locationX)}
              onResponderGrant={(e) => seek(item.id, e.nativeEvent.locationX)}
              onResponderRelease={(e) =>
                seek(item.id, e.nativeEvent.locationX, true)
              }
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(0, Math.min(100, displayPercent))}%` },
                ]}
              />
              <View
                style={[
                  styles.scrubber,
                  { left: `${Math.max(0, Math.min(100, displayPercent))}%` },
                ]}
              />

              {typeof preview === "number" && (
                <View
                  style={[
                    styles.scrubTooltip,
                    { left: `${Math.max(0, Math.min(95, displayPercent))}%` },
                  ]}
                >
                  <Text style={styles.scrubTooltipText}>
                    {formatMillis(preview)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ▶ PLAY BUTTON */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              togglePlay(item);
            }}
            style={styles.playButton}
          >
            <Text style={styles.playButtonText}>{isPlaying ? "⏸" : "▶"}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  /* ---------------- UI ---------------- */
  return (
    <View style={styles.container}>
      {/* 🔙 BACK BUTTON */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backButtonText}>◀ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🎙 Voice Journal</Text>

      <TextInput
        placeholder="Search notes"
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />

      <FlatList
        data={notes.filter((n) =>
          n.name.toLowerCase().includes(search.toLowerCase())
        )}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 40, color: "#666" }}>
            No voice notes yet
          </Text>
        }
      />
    </View>
  );
}

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f4f6fb" },
  backButton: { marginBottom: 12 },
  backButtonText: { color: "#4f46e5", fontSize: 16 },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  search: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: { fontSize: 16, fontWeight: "700" },
  meta: { fontSize: 12, color: "#666", marginBottom: 6 },
  playButton: {
    backgroundColor: "#4f46e5",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  playButtonText: { color: "#fff", fontSize: 20 },
  scrubTooltip: {
    position: "absolute",
    top: -30,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.8)",
    transform: [{ translateX: -30 }],
    minWidth: 48,
    alignItems: "center",
  },
  scrubTooltipText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  /* 🎚 Progress Bar */
  progressBar: {
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    marginTop: 6,
    position: "relative",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4f46e5",
    borderRadius: 6,
  },
  scrubber: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#4f46e5",
    transform: [{ translateX: -7 }],
  },
});
