import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";

const { width } = Dimensions.get("window");

export default function App() {
  const router = useRouter();
  const isNative = Platform.OS === "ios" || Platform.OS === "android";

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const getFileSystem = async () => await import("expo-file-system/legacy");

  /* ---------------- TIMER LOGIC ---------------- */
  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  /* ---------------- RECORDING LOGIC ---------------- */
  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission denied");

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Fetch saved quality settings (defaults to High)
      const FileSystem = await getFileSystem();
      const settingsFile = FileSystem.documentDirectory + "settings.json";
      let qualityPreset = Audio.RecordingOptionsPresets.HIGH_QUALITY;

      const settingsInfo = await FileSystem.getInfoAsync(settingsFile);
      if (settingsInfo.exists) {
        const settings = JSON.parse(
          await FileSystem.readAsStringAsync(settingsFile),
        );
        if (settings.quality === "Low")
          qualityPreset = Audio.RecordingOptionsPresets.LOW_QUALITY;
      }

      const { recording } = await Audio.Recording.createAsync(qualityPreset);
      recordingRef.current = recording;
      setRecording(recording);
      setPaused(false);
      setSeconds(0);
      startTimer();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } catch (err) {
      Alert.alert("Error", "Could not start recording");
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    stopTimer();
    setSaving(true);
    pulseAnim.setValue(1);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const status = await recordingRef.current.getStatusAsync();
      const FileSystem = await getFileSystem();

      const notesFile = FileSystem.documentDirectory + "notes.json";
      let list = [];
      const info = await FileSystem.getInfoAsync(notesFile);
      if (info.exists)
        list = JSON.parse(await FileSystem.readAsStringAsync(notesFile));

      const id = Date.now().toString();
      const newPath =
        FileSystem.documentDirectory + `recordings/voice_${id}.m4a`;

      await FileSystem.makeDirectoryAsync(
        FileSystem.documentDirectory + "recordings/",
        { intermediates: true },
      );
      await FileSystem.moveAsync({ from: uri!, to: newPath });

      const note = {
        id,
        uri: newPath,
        name: `New Recording ${list.length + 1}`,
        date: new Date().toLocaleDateString(),
        duration: status.durationMillis || 0,
      };

      list.unshift(note);
      await FileSystem.writeAsStringAsync(notesFile, JSON.stringify(list));
      router.push("/list");
    } catch (err) {
      Alert.alert("Error", "Saving failed");
    } finally {
      setSaving(false);
      setRecording(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Background Decorative Circles */}
      <View style={styles.bgCircle} />

      <View style={styles.header}>
        <Text style={styles.brand}>EchoVault</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push("/list")}
        >
          <Ionicons name="list" size={24} color="#4f46e5" />
        </TouchableOpacity>
      </View>

      <View style={styles.main}>
        <Text style={styles.timer}>{formatTime(seconds)}</Text>
        <Text style={styles.statusText}>
          {recording
            ? paused
              ? "Recording Paused"
              : "Listening..."
            : "Ready to Record"}
        </Text>

        <View style={styles.visualizerContainer}>
          {/* Pulsing Aura */}
          <Animated.View
            style={[
              styles.aura,
              {
                transform: [{ scale: pulseAnim }],
                opacity: recording && !paused ? 0.3 : 0,
              },
            ]}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={recording ? stopRecording : startRecording}
            style={[styles.recordBtn, recording && styles.activeBtn]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={recording ? "stop" : "mic"}
                size={40}
                color="#fff"
              />
            )}
          </TouchableOpacity>
        </View>

        {recording && !saving && (
          <View style={styles.auxControls}>
            <TouchableOpacity
              style={styles.auxBtn}
              onPress={async () => {
                if (paused) {
                  await recordingRef.current?.startAsync();
                  startTimer();
                } else {
                  await recordingRef.current?.pauseAsync();
                  stopTimer();
                }
                setPaused(!paused);
              }}
            >
              <Ionicons
                name={paused ? "play" : "pause"}
                size={24}
                color="#475569"
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.footerLink}
        onPress={() => router.push("/list")}
      >
        <Text style={styles.footerText}>View All Recordings</Text>
        <Ionicons name="chevron-forward" size={16} color="#6366f1" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 25 },
  bgCircle: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#e0e7ff",
    top: -50,
    right: -100,
    opacity: 0.5,
  },
  header: {
    marginTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1e293b",
    letterSpacing: -1,
  },
  iconBtn: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowOpacity: 0.1,
  },
  main: { flex: 1, justifyContent: "center", alignItems: "center" },
  timer: {
    fontSize: 72,
    fontWeight: "300",
    color: "#1e293b",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  statusText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 50,
  },
  visualizerContainer: {
    justifyContent: "center",
    alignItems: "center",
    height: 200,
    width: 200,
  },
  aura: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#4f46e5",
  },
  recordBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#4f46e5",
    shadowOpacity: 0.4,
  },
  activeBtn: { backgroundColor: "#ef4444", shadowColor: "#ef4444" },
  auxControls: { flexDirection: "row", marginTop: 40, gap: 20 },
  auxBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginBottom: 30,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 20,
    elevation: 1,
  },
  footerText: { fontWeight: "700", color: "#6366f1" },
});
