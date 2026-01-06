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

      const notesFile = FileSystem.documentDirectory + "notes.json";
      let list: any[] = [];

      const info = await FileSystem.getInfoAsync(notesFile);
      if (info.exists) {
        list = JSON.parse(await FileSystem.readAsStringAsync(notesFile));
      }

      // ✅ RECORDING NUMBER (1, 2, 3...)
      const recordingNumber = list.length + 1;
      const id = Date.now().toString();

      const dir = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const newPath = dir + `voice_${id}.m4a`;
      await FileSystem.moveAsync({ from: uri, to: newPath });

      const note = {
        id,
        uri: newPath,
        name: `Recording ${recordingNumber}`,
        date: new Date().toLocaleString(),
        duration: status.durationMillis || 0,
      };

      list.unshift(note);
      await FileSystem.writeAsStringAsync(notesFile, JSON.stringify(list));

      router.push("/list");
    } catch {
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
      <Text style={styles.title}>🎙 Voice Recorder</Text>

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
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f4f6fb",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 20,
    color: "#111",
  },

  recordBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
    marginRight: 10,
  },
  recordText: {
    color: "#b91c1c",
    fontWeight: "700",
    fontSize: 16,
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },

  recordBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
  },
  stopBtn: {
    backgroundColor: "#ef4444",
  },

  controls: {
    flexDirection: "row",
    marginTop: 20,
    gap: 16,
    alignItems: "center",
  },

  smallBtn: {
    backgroundColor: "#64748b",
    padding: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 4,
  },
  saveBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: "center",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 4,
  },
  saveText: { fontWeight: "700", fontSize: 16, color: "#111" },

  link: {
    marginBottom: 20,
    textAlign: "center",
    color: "#4f46e5",
    fontWeight: "600",
    fontSize: 16,
  },
});
