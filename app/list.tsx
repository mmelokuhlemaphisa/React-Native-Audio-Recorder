import { Audio } from "expo-av";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

  // 🔥 reload when coming back from detail screen
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

  /* ---------------- RENDER ITEM ---------------- */
  const renderItem = ({ item }: { item: VoiceNote }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/note/${item.id}`)}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.date}</Text>
          </View>

          {/* ▶ PLAY BUTTON */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation(); // ❗ prevent navigation
              togglePlay(item);
            }}
            style={styles.playButton}
          >
            <Text style={styles.playButtonText}>
              {playingId === item.id ? "⏸" : "▶"}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  /* ---------------- UI ---------------- */
  return (
    <View style={styles.container}>
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
  title: { fontSize: 26, fontWeight: "bold", textAlign: "center" },
  search: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginVertical: 12,
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
  meta: { fontSize: 12, color: "#666", marginTop: 2 },
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
});
