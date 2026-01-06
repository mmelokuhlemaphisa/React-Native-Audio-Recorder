import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Share,
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        {
          rate: speed,
          shouldCorrectPitch: true,
          isLooping: repeat,
          positionMillis: position,
        }
      );
      setSound(newSound);
      setPlaying(true);
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setPosition(status.positionMillis ?? 0);
        setDuration(status.durationMillis ?? note.duration);
        if (status.didJustFinish && !repeat) setPlaying(false);
      });
    } catch (err) {
      Alert.alert("Playback Error", "Unable to play this recording");
      console.warn(err);
    }
  };

  useEffect(() => {
    if (!sound) return;
    sound.setRateAsync(speed, true);
    sound.setIsLoopingAsync(repeat);
  }, [speed, repeat]);

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
    setSettingsOpen(false);
  };

  /* ---------------- SHARE ---------------- */
  const shareNote = async () => {
    if (!note) return;
    try {
      await Share.share({ message: `Voice Note: ${note.name}`, url: note.uri });
    } catch (err) {
      console.warn("Share error:", err);
    }
  };

  if (!note)
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      {/* Header */}
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
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          style={{ marginLeft: 12 }}
        >
          <Ionicons name="ellipsis-vertical" size={22} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={styles.title}>{note.name}</Text>
      <Text style={styles.meta}>{note.date}</Text>

      {/* Playback Controls */}
      {/* Waveform */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          <View
            style={[
              styles.playhead,
              {
                left: `${(position / (duration || note.duration)) * 100}%`,
              },
            ]}
          />
        </View>
        <View style={styles.waveformLabels}>
          {/* Left: show position only if audio is playing */}
          <Text>{playing ? Math.floor(position / 1000) + "s" : "0s"}</Text>
          {/* Right: always show total duration */}
          <Text>{Math.floor((duration || note.duration) / 1000)}s</Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        {/* Back 10s */}
        <TouchableOpacity
          onPress={async () => {
            const newPos = Math.max(0, position - 10000);
            setPosition(newPos);
            try {
              if (sound) await sound.setPositionAsync(newPos);
            } catch (e) {
              console.warn("Back 10s failed", e);
            }
          }}
          style={styles.skipBtn}
        >
          <Ionicons name="play-back" size={28} color="#111" />
          <Text style={styles.skipLabel}>10s</Text>
        </TouchableOpacity>

        {/* Play / Pause */}
        <TouchableOpacity
          style={[styles.playBtn, playing && styles.playing]}
          onPress={togglePlay}
        >
          <Ionicons
            name={playing ? "pause" : "play"}
            size={32}
            color={playing ? "#fff" : "#4f46e5"}
          />
        </TouchableOpacity>

        {/* Forward 10s */}
        <TouchableOpacity
          onPress={async () => {
            const newPos = Math.min(
              duration || note.duration,
              position + 10000
            );
            setPosition(newPos);
            try {
              if (sound) await sound.setPositionAsync(newPos);
            } catch (e) {
              console.warn("Forward 10s failed", e);
            }
          }}
          style={styles.skipBtn}
        >
          <Ionicons name="play-forward" size={28} color="#111" />
          <Text style={styles.skipLabel}>10s</Text>
        </TouchableOpacity>
      </View>

      {/* Settings Modal */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Settings</Text>

            {editing ? (
              <>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={{
                    borderWidth: 1,
                    borderColor: "#ccc",
                    padding: 8,
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                  placeholder="New name"
                />
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: "#4f46e5" }]}
                  onPress={renameNote}
                >
                  <Text style={{ color: "#fff" }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    { backgroundColor: "#ddd", marginTop: 8 },
                  ]}
                  onPress={() => setEditing(false)}
                >
                  <Text>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setEditing(true)}
              >
                <Text>Rename</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() =>
                Alert.alert(
                  "Delete Recording",
                  "Are you sure you want to delete this recording?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: deleteNote,
                    },
                  ]
                )
              }
            >
              <Text>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={shareNote}>
              <Text>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => setRepeat(!repeat)}
            >
              <Text>Repeat: {repeat ? "On" : "Off"}</Text>
            </TouchableOpacity>

            <Text style={{ marginTop: 12 }}>Playback Speed</Text>
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

            <TouchableOpacity
              style={[
                styles.modalBtn,
                { backgroundColor: "#ddd", marginTop: 12 },
              ]}
              onPress={() => setSettingsOpen(false)}
            >
              <Text>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f4f6fb" },
  headerRow: { flexDirection: "row", alignItems: "center" },
  link: { color: "#4f46e5" },
  title: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  meta: { color: "#666", marginTop: 4 },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  playing: { backgroundColor: "#4f46e5" },
  waveformContainer: { marginTop: 30 },
  waveform: {
    height: 60,
    backgroundColor: "#ddd",
    borderRadius: 6,
    position: "relative",
  },
  playhead: {
    position: "absolute",
    width: 2,
    height: "100%",
    backgroundColor: "#f00",
  },
  waveformLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 20,
  },
  skipBtn: { alignItems: "center" },
  skipLabel: { fontSize: 10, color: "#666", textAlign: "center", marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  modalBtn: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  settingItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  speedRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  speedBtn: { padding: 8, borderRadius: 8, backgroundColor: "#fff" },
  speedActive: { backgroundColor: "#4f46e5" },
});
