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
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

const { width } = Dimensions.get("window");
// Static bars for a consistent visual aesthetic
const WAVEFORM_BARS = Array.from({ length: 40 }, () => Math.random() * 40 + 10);

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

  // State
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [quality, setQuality] = useState<"High" | "Medium" | "Low">("High");
  const [repeat, setRepeat] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const getFileSystem = async () => await import("expo-file-system/legacy");

  /* ---------------- LOAD DATA ---------------- */
  const loadData = async () => {
    if (!id) return;
    try {
      const FileSystem = await getFileSystem();
      const file = FileSystem.documentDirectory + "notes.json";
      const info = await FileSystem.getInfoAsync(file);
      if (!info.exists) return;

      const data = await FileSystem.readAsStringAsync(file);
      const list: VoiceNote[] = JSON.parse(data);
      const found = list.find((n) => n.id === id);
      if (found) {
        setNote(found);
        setNewName(found.name);
      }
    } catch (err) {
      console.warn("Load error:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  /* ---------------- AUDIO LOGIC ---------------- */
  const togglePlay = async () => {
    if (!note) return;
    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await sound.pauseAsync();
            setPlaying(false);
            return;
          } else {
            await sound.playAsync();
            setPlaying(true);
            return;
          }
        }
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: note.uri },
        {
          rate: speed,
          shouldCorrectPitch: true,
          isLooping: repeat,
          positionMillis: position,
        },
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
      Alert.alert("Error", "Could not play audio");
    }
  };

  const changeSpeed = async (val: number) => {
    setSpeed(val);
    if (sound) await sound.setRateAsync(val, true);
  };

  /* ---------------- ACTIONS ---------------- */
  const handleRename = async () => {
    if (!note || !newName.trim()) return;
    try {
      const FileSystem = await getFileSystem();
      const file = FileSystem.documentDirectory + "notes.json";
      const data = await FileSystem.readAsStringAsync(file);
      const list: VoiceNote[] = JSON.parse(data);
      const updated = list.map((n) =>
        n.id === note.id ? { ...n, name: newName } : n,
      );

      await FileSystem.writeAsStringAsync(file, JSON.stringify(updated));
      setNote({ ...note, name: newName });
      setEditing(false);
      Alert.alert("Success", "Recording renamed");
    } catch (e) {
      Alert.alert("Error", "Could not rename file");
    }
  };

  const toggleStar = async () => {
    if (!note) return;
    const FileSystem = await getFileSystem();
    const file = FileSystem.documentDirectory + "notes.json";
    const data = await FileSystem.readAsStringAsync(file);
    const list: VoiceNote[] = JSON.parse(data);
    const updated = list.map((n) =>
      n.id === note.id ? { ...n, starred: !n.starred } : n,
    );
    await FileSystem.writeAsStringAsync(file, JSON.stringify(updated));
    setNote({ ...note, starred: !note.starred });
  };

  const deleteNote = async () => {
    if (!note) return;
    const FileSystem = await getFileSystem();
    const file = FileSystem.documentDirectory + "notes.json";
    const data = await FileSystem.readAsStringAsync(file);
    const list: VoiceNote[] = JSON.parse(data).filter(
      (n: any) => n.id !== note.id,
    );
    await FileSystem.writeAsStringAsync(file, JSON.stringify(list));
    await FileSystem.deleteAsync(note.uri, { idempotent: true });
    router.replace("/list");
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  if (!note) return null;
  const progressPercent = (position / (duration || note.duration)) * 100;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          style={styles.iconBtn}
        >
          <Ionicons name="options-outline" size={24} color="#111" />
        </TouchableOpacity>
      </View>

      {/* CARD */}
      <View style={styles.card}>
        <View style={styles.albumArt}>
          <Ionicons name="mic-outline" size={80} color="#4f46e5" />
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {note.name}
            </Text>
            <TouchableOpacity onPress={toggleStar}>
              <Ionicons
                name={note.starred ? "star" : "star-outline"}
                size={24}
                color={note.starred ? "#f59e0b" : "#ccc"}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.noteMeta}>{note.date}</Text>
        </View>

        {/* WAVEFORM */}
        <View style={styles.waveformSection}>
          <View style={styles.waveformBars}>
            {WAVEFORM_BARS.map((h, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor:
                      (i / 40) * 100 < progressPercent ? "#4f46e5" : "#e2e8f0",
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>
              {formatTime(duration || note.duration)}
            </Text>
          </View>
        </View>

        {/* CONTROLS */}
        <View style={styles.controlsMain}>
          <TouchableOpacity
            onPress={() =>
              sound?.setPositionAsync(Math.max(0, position - 10000))
            }
          >
            <Ionicons name="play-back-outline" size={30} color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainPlayBtn, playing && styles.activeShadow]}
            onPress={togglePlay}
          >
            <Ionicons
              name={playing ? "pause" : "play"}
              size={36}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              sound?.setPositionAsync(Math.min(duration, position + 10000))
            }
          >
            <Ionicons name="play-forward-outline" size={30} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      {/* FOOTER */}
      <View style={styles.footerRow}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => Share.share({ url: note.uri })}
        >
          <Ionicons name="share-outline" size={20} color="#6366f1" />
          <Text style={styles.footerBtnText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtn, repeat && { backgroundColor: "#e0e7ff" }]}
          onPress={() => setRepeat(!repeat)}
        >
          <Ionicons
            name="repeat-outline"
            size={20}
            color={repeat ? "#4f46e5" : "#6366f1"}
          />
          <Text style={[styles.footerBtnText, repeat && { color: "#4f46e5" }]}>
            Repeat
          </Text>
        </TouchableOpacity>
      </View>

      {/* SETTINGS MODAL */}
      <Modal visible={settingsOpen} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Settings</Text>
                <TouchableOpacity
                  onPress={() => {
                    setSettingsOpen(false);
                    setEditing(false);
                  }}
                >
                  <Ionicons name="close-circle" size={28} color="#cbd5e1" />
                </TouchableOpacity>
              </View>

              {/* RENAME SECTION */}
              <Text style={styles.sectionLabel}>Rename Recording</Text>
              {editing ? (
                <View style={styles.renameBox}>
                  <TextInput
                    style={styles.input}
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleRename}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => setEditing(true)}
                >
                  <Ionicons name="pencil-outline" size={20} color="#475569" />
                  <Text style={styles.settingText}>Change Name</Text>
                </TouchableOpacity>
              )}

              {/* PLAYBACK SPEED */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                Playback Speed
              </Text>
              <View style={styles.optionRow}>
                {[0.5, 1, 1.5, 2].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, speed === s && styles.chipActive]}
                    onPress={() => changeSpeed(s)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        speed === s && styles.chipTextActive,
                      ]}
                    >
                      {s}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* DANGER ZONE */}
              <View style={styles.separator} />
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => {
                  setSettingsOpen(false);
                  Alert.alert("Delete", "Are you sure?", [
                    { text: "Cancel" },
                    {
                      text: "Delete",
                      onPress: deleteNote,
                      style: "destructive",
                    },
                  ]);
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={[styles.settingText, { color: "#ef4444" }]}>
                  Delete Permanentally
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 60,
    marginBottom: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  iconBtn: {
    width: 45,
    height: 45,
    backgroundColor: "#fff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 30,
    padding: 25,
    alignItems: "center",
    elevation: 4,
  },
  albumArt: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f5f3ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  infoContainer: { width: "100%", marginBottom: 30 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  noteTitle: { fontSize: 22, fontWeight: "800", color: "#1e293b", flex: 1 },
  noteMeta: { fontSize: 14, color: "#94a3b8", marginTop: 4 },
  waveformSection: { width: "100%", marginBottom: 30 },
  waveformBars: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 50,
  },
  bar: { width: 4, borderRadius: 2 },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  timeText: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  controlsMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
  },
  mainPlayBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  activeShadow: {
    shadowColor: "#4f46e5",
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 15,
    marginTop: 30,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 15,
    gap: 8,
    elevation: 1,
  },
  footerBtnText: { fontWeight: "700", color: "#6366f1" },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#fff",
    padding: 25,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  renameBox: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 10,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: "#4f46e5",
    padding: 12,
    borderRadius: 10,
    justifyContent: "center",
  },
  optionRow: { flexDirection: "row", gap: 10 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  chipActive: { backgroundColor: "#4f46e5" },
  chipText: { fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#fff" },
  separator: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 15 },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  settingText: { fontSize: 16, fontWeight: "600", color: "#475569" },
});
