import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface VoiceNote {
  id: string;
  name: string;
  uri: string;
  date: string;
  duration: number;
  starred?: boolean;
}

export default function NoteDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [note, setNote] = useState<VoiceNote | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [repeat, setRepeat] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  /* ---------------- FILE SYSTEM ---------------- */
  const getFileSystem = async () => {
    const fs = await import("expo-file-system/legacy");
    return fs;
  };

  /* ---------------- LOAD NOTE ---------------- */
  const loadNote = async () => {
    if (!id) return;

    try {
      const FileSystem = await getFileSystem();
      const file = FileSystem.documentDirectory + "notes.json";

      const info = await FileSystem.getInfoAsync(file);
      if (!info.exists) {
        Alert.alert("Error", "Notes file not found");
        router.back();
        return;
      }

      const data = await FileSystem.readAsStringAsync(file);
      const list: VoiceNote[] = JSON.parse(data);

      const found = list.find((n) => n.id === id);
      if (!found) {
        Alert.alert("Error", "Voice note not found");
        router.back();
        return;
      }

      setNote(found);
      setName(found.name);
    } catch (err) {
      console.warn("Load note error:", err);
    }
  };

  useEffect(() => {
    loadNote();
  }, [id]);

  /* ---------------- STAR ---------------- */
  const toggleStar = async () => {
    if (!note) return;

    const FileSystem = await getFileSystem();
    const file = FileSystem.documentDirectory + "notes.json";

    const data = await FileSystem.readAsStringAsync(file);
    const list: VoiceNote[] = JSON.parse(data);

    const updated = list.map((n) =>
      n.id === note.id ? { ...n, starred: !n.starred } : n
    );

    await FileSystem.writeAsStringAsync(file, JSON.stringify(updated));
    setNote({ ...note, starred: !note.starred });
  };

  /* ---------------- PLAY / PAUSE ---------------- */
  const togglePlay = async () => {
    if (!note) return;

    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await sound.pauseAsync();
          setPlaying(false);
          return;
        }
        await sound.unloadAsync();
        setSound(null);
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: note.uri },
        { rate: speed, shouldCorrectPitch: true, isLooping: repeat }
      );

      setSound(newSound);
      setPlaying(true);
      await newSound.playAsync();

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        setPosition(status.positionMillis ?? 0);
        setDuration(status.durationMillis ?? note.duration);

        if (status.didJustFinish && !repeat) {
          setPlaying(false);
        }
      });
    } catch (err) {
      Alert.alert("Playback Error", "Unable to play this recording");
      console.warn(err);
    }
  };

  /* ---------------- UPDATE SPEED / LOOP ---------------- */
  useEffect(() => {
    if (!sound) return;
    sound.setRateAsync(speed, true);
    sound.setIsLoopingAsync(repeat);
  }, [speed, repeat]);

  /* ---------------- CLEANUP ---------------- */
  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

  /* ---------------- DELETE ---------------- */
  const deleteNote = async () => {
    if (!note) return;

    const FileSystem = await getFileSystem();
    const file = FileSystem.documentDirectory + "notes.json";

    const data = await FileSystem.readAsStringAsync(file);
    const list: VoiceNote[] = JSON.parse(data);

    const filtered = list.filter((n) => n.id !== note.id);
    await FileSystem.writeAsStringAsync(file, JSON.stringify(filtered));
    await FileSystem.deleteAsync(note.uri, { idempotent: true });

    router.replace("/list");
  };

  /* ---------------- RENAME ---------------- */
  const renameNote = async () => {
    if (!note || !name.trim()) return;

    const FileSystem = await getFileSystem();
    const file = FileSystem.documentDirectory + "notes.json";

    const data = await FileSystem.readAsStringAsync(file);
    const list: VoiceNote[] = JSON.parse(data);

    const updated = list.map((n) => (n.id === note.id ? { ...n, name } : n));

    await FileSystem.writeAsStringAsync(file, JSON.stringify(updated));
    setNote({ ...note, name });
    setEditing(false);
  };

  if (!note) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  /* ---------------- UI ---------------- */
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>◀ Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={toggleStar}>
          <Ionicons
            name={note.starred ? "star" : "star-outline"}
            size={22}
            color={note.starred ? "#f59e0b" : "#999"}
          />
        </TouchableOpacity>
      </View>

      {editing ? (
        <>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <TouchableOpacity onPress={renameNote} style={styles.btn}>
            <Text>Save</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>{note.name}</Text>
          <Text style={styles.meta}>{note.date}</Text>

          <View style={styles.controlsRow}>
            <Text>Speed</Text>
            <View style={styles.speedRow}>
              {[0.5, 1, 1.5, 2].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.speedBtn, speed === s && styles.speedActive]}
                  onPress={() => setSpeed(s)}
                >
                  <Text style={speed === s && { color: "#fff" }}>{s}x</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.controlsRow}>
            <Text>Repeat</Text>
            <TouchableOpacity
              style={[styles.smallBtn, repeat && styles.smallBtnActive]}
              onPress={() => setRepeat(!repeat)}
            >
              <Text style={{ color: repeat ? "#fff" : "#111" }}>
                {repeat ? "On" : "Off"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: "center", marginTop: 20 }}>
            <TouchableOpacity
              style={[styles.playBtn, playing && styles.playing]}
              onPress={togglePlay}
            >
              <Ionicons
                name={playing ? "pause" : "play"}
                size={26}
                color={playing ? "#fff" : "#4f46e5"}
              />
            </TouchableOpacity>

            <Text style={{ marginTop: 8 }}>
              {Math.floor(position / 1000)}s / {Math.floor(duration / 1000)}s
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => setEditing(true)}
            >
              <Text>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.danger]}
              onPress={() =>
                Alert.alert("Delete", "Delete this note?", [
                  { text: "Cancel" },
                  { text: "Delete", style: "destructive", onPress: deleteNote },
                ])
              }
            >
              <Text>Delete</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f4f6fb" },
  headerRow: { flexDirection: "row", alignItems: "center" },
  link: { color: "#4f46e5" },
  title: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  meta: { color: "#666", marginTop: 4 },
  controlsRow: { marginTop: 18 },
  speedRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  speedBtn: { padding: 8, borderRadius: 8, backgroundColor: "#fff" },
  speedActive: { backgroundColor: "#4f46e5" },
  smallBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#eee",
    marginLeft: 8,
  },
  smallBtnActive: { backgroundColor: "#4f46e5" },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  playing: { backgroundColor: "#4f46e5" },
  actionsRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  btn: { backgroundColor: "#fff", padding: 10, borderRadius: 8 },
  danger: { backgroundColor: "#fee2e2" },
  input: {
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 8,
    marginTop: 12,
  },
});
