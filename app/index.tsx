// App.tsx
// Task 3 – React Native Audio Recorder (Lesson 5)

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
} from "react-native";

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

  /* ---------------- FILE SYSTEM ---------------- */
  const getFileSystem = async () => {
    if (!isNative) return null;
    return await import("expo-file-system/legacy");
  };

  /* ---------------- TIMER ---------------- */
  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
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

  /* ---------------- ANIMATION ---------------- */
  useEffect(() => {
    if (recording && !paused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recording, paused]);

  /* ---------------- PERMISSIONS ---------------- */
  const requestPermissions = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Microphone access is needed");
      return false;
    }
    return true;
  };

  /* ---------------- RECORDING ---------------- */
  const startRecording = async () => {
    const ok = await requestPermissions();
    if (!ok) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setRecording(recording);
      setPaused(false);
      setSeconds(0);
      startTimer();
    } catch {
      Alert.alert("Error", "Failed to start recording");
    }
  };

  const pauseRecording = async () => {
    if (!recordingRef.current) return;
    await recordingRef.current.pauseAsync();
    setPaused(true);
    stopTimer();
  };

  const resumeRecording = async () => {
    if (!recordingRef.current) return;
    await recordingRef.current.startAsync();
    setPaused(false);
    startTimer();
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    stopTimer();
    setSaving(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const status = await recordingRef.current.getStatusAsync();

      if (!uri) throw new Error("No URI");

      const FileSystem = await getFileSystem();
      if (!FileSystem) return;

      const id = Date.now().toString();
      const dir = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const newPath = dir + `voice_${id}.m4a`;
      await FileSystem.moveAsync({ from: uri, to: newPath });

      const note = {
        id,
        uri: newPath,
        name: `Recording ${id}`,
        date: new Date().toLocaleString(),
        duration: status.durationMillis || 0,
      };

      const notesFile = FileSystem.documentDirectory + "notes.json";
      let list = [];

      const info = await FileSystem.getInfoAsync(notesFile);
      if (info.exists) {
        list = JSON.parse(await FileSystem.readAsStringAsync(notesFile));
      }

      list.unshift(note);
      await FileSystem.writeAsStringAsync(notesFile, JSON.stringify(list));

      router.push("/list");
    } catch (e) {
      Alert.alert("Error", "Failed to save recording");
    } finally {
      setSaving(false);
      setRecording(null);
      setPaused(false);
      setSeconds(0);
      recordingRef.current = null;
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙 Voice Journal</Text>

      {recording && (
        <View style={styles.recordBanner}>
          <View style={styles.dot} />
          <Text style={styles.recordText}>
            {paused ? "Paused" : "Recording"} • {formatTime(seconds)}
          </Text>
        </View>
      )}

      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.recordBtn, recording && styles.stopBtn]}
            onPress={recording ? stopRecording : startRecording}
          >
            <Ionicons
              name={recording ? "stop" : "mic"}
              size={36}
              color="#fff"
            />
          </TouchableOpacity>
        </Animated.View>

        {recording && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={paused ? resumeRecording : pauseRecording}
            >
              <Ionicons
                name={paused ? "play" : "pause"}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={stopRecording}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity onPress={() => router.push("/list")}>
        <Text style={styles.link}>📄 View Recordings</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f4f6fb" },
  title: { fontSize: 26, fontWeight: "bold", textAlign: "center" },

  recordBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    padding: 8,
    borderRadius: 10,
    marginVertical: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    marginRight: 8,
  },
  recordText: { color: "#b91c1c", fontWeight: "700" },

  center: { alignItems: "center", marginTop: 40 },

  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
  },
  stopBtn: { backgroundColor: "#ef4444" },

  controls: { flexDirection: "row", marginTop: 16, gap: 12 },

  smallBtn: {
    backgroundColor: "#64748b",
    padding: 12,
    borderRadius: 10,
  },
  saveBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 10,
  },
  saveText: { fontWeight: "600" },

  link: {
    marginTop: 40,
    textAlign: "center",
    color: "#4f46e5",
    fontWeight: "600",
  },
});
