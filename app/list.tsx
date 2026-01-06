import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
  missing?: boolean;
}

export default function ListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // State declarations in order of dependency
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackProgresses, setPlaybackProgresses] = useState<
    Record<string, { position: number; duration: number; width?: number }>
  >({});
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [preparingRecording, setPreparingRecording] = useState(false);
  const [loadingPlaybackId, setLoadingPlaybackId] = useState<string | null>(
    null
  );
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isNative = Platform.OS === "ios" || Platform.OS === "android";

  // Memoized filtered notes
  const filteredNotes = React.useMemo(
    () =>
      notes.filter((n) => n.name.toLowerCase().includes(search.toLowerCase())),
    [notes, search]
  );

  // Memoized render item component
  const seekForward = async (id: string) => {
    if (!sound || playingId !== id) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        const newPosition = Math.min(
          status.positionMillis + 10000, // 10 seconds forward
          status.durationMillis || 0
        );
        await sound.setPositionAsync(newPosition);
        setPlaybackProgresses((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            position: newPosition,
          },
        }));
      }
    } catch (error) {
      console.warn("Seek forward failed:", error);
    }
  };

  const seekBackward = async (id: string) => {
    if (!sound || playingId !== id) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        const newPosition = Math.max(
          status.positionMillis - 10000, // 10 seconds backward
          0
        );
        await sound.setPositionAsync(newPosition);
        setPlaybackProgresses((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            position: newPosition,
          },
        }));
      }
    } catch (error) {
      console.warn("Seek backward failed:", error);
    }
  };

  const setSeekPosition = async (id: string, position: number) => {
    if (!sound || playingId !== id) return;
    try {
      await sound.setPositionAsync(position);
      setPlaybackProgresses((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          position,
        },
      }));
    } catch (error) {
      console.warn("Seek failed:", error);
    }
  };

  const formatTime = (millis: number) => {
    if (!millis) return "0:00";
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const NoteItem = React.memo(
    ({ item, onPress }: { item: VoiceNote; onPress: () => void }) => {
      const progress = playbackProgresses[item.id] || {
        position: 0,
        duration: 0,
      };
      const isPlaying = playingId === item.id;
      const progressPercent =
        progress.duration > 0
          ? (progress.position / progress.duration) * 100
          : 0;

      return (
        <View style={styles.card}>
          <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {item.name}
            </Text>
            <Text style={styles.meta}>
              {new Date(item.date).toLocaleString()} •
              {Math.floor((item.duration || 0) / 1000)}s
              {item.starred ? " • ⭐" : ""}
            </Text>
          </TouchableOpacity>

          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={[
                styles.controlButton,
                !isPlaying && styles.controlButtonDisabled,
              ]}
              onPress={() => seekBackward(item.id)}
              disabled={!isPlaying}
            >
              <Text style={styles.controlButtonText}>-10s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={() => togglePlay(item.id, item.uri)}
            >
              <Text style={styles.playButtonText}>{isPlaying ? "⏸" : "▶"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.controlButton,
                !isPlaying && styles.controlButtonDisabled,
              ]}
              onPress={() => seekForward(item.id)}
              disabled={!isPlaying}
            >
              <Text style={styles.controlButtonText}>+10s</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progressPercent}%` }]}
              />
              {isPlaying && (
                <View
                  style={[
                    styles.scrubber,
                    { left: `${Math.min(progressPercent, 98)}%` },
                  ]}
                />
              )}
            </View>
            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>
                {formatTime(progress.position)}
              </Text>
              <Text style={styles.timeText}>
                {formatTime(progress.duration)}
              </Text>
            </View>
          </View>
        </View>
      );
    }
  );

  // Add display name for better debugging
  NoteItem.displayName = "NoteItem";

  // Stable reference for renderItem
  const renderNoteItem = React.useCallback(
    ({ item }: { item: VoiceNote }) => (
      <NoteItem
        item={item}
        onPress={() =>
          router.push({ pathname: "/note/[id]", params: { id: item.id } })
        }
      />
    ),
    [router]
  );

  const getFileSystem = async (): Promise<any | null> => {
    if (!isNative) return null;
    try {
      const fs = await import("expo-file-system/legacy");
      return fs;
    } catch (err) {
      console.warn("getFileSystem: failed to load legacy fs", err);
      return null;
    }
  };

  useEffect(() => {
    loadNotes();
    // If navigated with ?new=1, auto-start recording for quick capture
    if ((params as any).new) {
      startRecording();
    }
    return () => {
      sound?.unloadAsync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestPermissions = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Microphone access is required");
      return false;
    }
    return true;
  };

  useEffect(() => {
    let anim: any = null;
    if (recording) {
      anim = Animated.loop(
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
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
      if (anim) anim.stop();
    }

    return () => {
      if (anim) anim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = async () => {
    // Prevent multiple recording attempts
    if (preparingRecording || recording) {
      console.log("Recording already in progress or preparing");
      return;
    }

    setPreparingRecording(true);

    try {
      const ok = await requestPermissions();
      if (!ok) {
        setPreparingRecording(false);
        return;
      }

      // Stop any currently playing sound
      if (sound) {
        await sound.stopAsync();
        setSound(null);
        setPlayingId(null);
      }

      // Ensure audio mode is set correctly
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });

      // Add a small delay to ensure audio mode is properly set
      await new Promise((resolve) => setTimeout(resolve, 100));

      const maxAttempts = 3;
      let attempts = 0;
      let newRecording: Audio.Recording | null = null;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`Starting recording attempt ${attempts}`);

          // Create a new recording instance
          const { recording: createdRecording } =
            await Audio.Recording.createAsync(
              Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

          newRecording = createdRecording;

          // Successfully started recording
          setRecording(newRecording);
          setRecordingPaused(false);
          console.log("Recording started successfully");
          return; // Exit the function on success
        } catch (error: any) {
          console.warn(`Recording attempt ${attempts} failed:`, error.message);

          // If this was the last attempt, show error
          if (attempts >= maxAttempts) {
            Alert.alert(
              "Recording Error",
              "Failed to start recording. Please try again."
            );
          } else {
            // Wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      }
    } catch (error: any) {
      console.error("Error in startRecording:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred while starting the recording."
      );
    } finally {
      setPreparingRecording(false);
    }
  };

  const pauseRecording = async () => {
    if (!recording) return;
    try {
      await recording.pauseAsync();
      setRecordingPaused(true);
    } catch (err) {
      console.warn("pauseRecording failed", err);
    }
  };

  const resumeRecording = async () => {
    if (!recording) return;
    try {
      await recording.startAsync();
      setRecordingPaused(false);
    } catch (err) {
      console.warn("resumeRecording failed", err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      const statusBefore = await recording.getStatusAsync();
      if ((statusBefore as any).isLoaded) {
        await recording.stopAndUnloadAsync();
      }
    } catch (err: any) {
      console.warn("stopRecording: ignored stop/unload error", err);
    }

    const uri = recording.getURI();
    let duration = 0;
    try {
      const st = await recording.getStatusAsync();
      duration = st.durationMillis || 0;
    } catch {
      duration = 0;
    }

    // 5. Create the note with the saved file
    // Prepare identifiers and paths for saving
    let finalUri = uri;
    const id = `note_${Date.now()}`;

    if (isNative) {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        try {
          setIsSaving(true);
          const newPath = FileSystem.documentDirectory + `voice_${id}.m4a`;
          try {
            await FileSystem.moveAsync({ from: uri, to: newPath });
            finalUri = newPath;
          } catch (moveErr) {
            console.warn("stopRecording: moveAsync failed", moveErr);
            // Try to ensure destination directory exists, then fallback to copy + delete
            try {
              await FileSystem.makeDirectoryAsync(
                FileSystem.documentDirectory,
                { intermediates: true }
              );
            } catch (mkdirErr) {
              // Not fatal; proceed to copy attempt
              console.warn(
                "stopRecording: makeDirectoryAsync failed",
                mkdirErr
              );
            }

            try {
              await FileSystem.copyAsync({ from: uri, to: newPath });
              // remove the original temp file
              try {
                await FileSystem.deleteAsync(uri, { idempotent: true });
              } catch (delErr) {
                console.warn(
                  "stopRecording: delete original after copy failed",
                  delErr
                );
              }
              finalUri = newPath;
            } catch (copyErr) {
              console.warn("stopRecording: copyAsync fallback failed", copyErr);
              // Try Base64 read/write fallback for stubborn devices/filesystems
              try {
                const data = await FileSystem.readAsStringAsync(uri, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                await FileSystem.writeAsStringAsync(newPath, data, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                // attempt to delete original
                try {
                  await FileSystem.deleteAsync(uri, { idempotent: true });
                } catch (delErr) {
                  console.warn(
                    "stopRecording: delete original after base64 write failed",
                    delErr
                  );
                }
                finalUri = newPath;
              } catch (b64Err) {
                console.warn("stopRecording: base64 fallback failed", b64Err);
                // leave finalUri as-is; will be marked missing later
              }
            }
          }
        } catch (err: any) {
          console.warn("stopRecording: unexpected fs error", err);
          Alert.alert("File Error", "Failed to save recording to storage.");
        } finally {
          setIsSaving(false);
        }
      }
    }

    // Verify file exists; if not, mark the note as missing so UI and playback handle it safely.
    let fileExists = true;
    if (isNative) {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        try {
          const info = await FileSystem.getInfoAsync(finalUri);
          fileExists = !!info.exists;
        } catch (err) {
          fileExists = false;
        }
      }
    }

    const note: VoiceNote = {
      id,
      uri: finalUri ?? "",
      name: `Voice Note ${notes.length + 1}`,
      date: new Date().toLocaleString(),
      duration,
      missing: !fileExists,
    };
    const updatedNotes = [note, ...notes];
    setNotes(updatedNotes);

    if (isNative) {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        try {
          setIsSaving(true);
          await FileSystem.writeAsStringAsync(
            FileSystem.documentDirectory + "notes.json",
            JSON.stringify(updatedNotes)
          );
        } catch (err: any) {
          console.warn("stopRecording: writeAsStringAsync failed", err);
        } finally {
          setIsSaving(false);
        }
      }
    }

    setRecording(null);
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
      }
    } catch {}
  };

  const togglePlay = async (id: string, uri: string) => {
    // prevent concurrent toggles
    if (loadingPlaybackId) return;

    // If clicking the same item that's currently playing, toggle pause/play
    if (playingId === id && sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await sound.pauseAsync();
            setPlayingId(null);
          } else {
            await sound.playAsync();
            setPlayingId(id);
          }
          return;
        }
      } catch (error) {
        console.warn("Error toggling play/pause:", error);
      }
    }
    setLoadingPlaybackId(id);
    const createSoundWithRetries = async (uri: string, attempts = 3) => {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) {
            return { error: "ENOENT" };
          }
        } catch (err) {
          console.warn("createSound: file info check failed", err);
        }
      }

      let lastErr: any = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await Audio.Sound.createAsync({ uri });
          const s = res?.sound ?? null;
          if (!s) throw new Error("createAsync returned no sound");
          return { sound: s };
        } catch (err: any) {
          lastErr = err;
          console.warn(`createSound attempt ${i + 1} failed`, {
            message: (err as any)?.message,
            err,
          });
          // small delay before retry
          await new Promise((r) => setTimeout(r, 120));
        }
      }
      return { error: lastErr };
    };
    // Check file exists before attempting to create a sound
    if (isNative) {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) {
            // Offer to delete the missing note
            Alert.alert(
              "File Missing",
              "This recording file could not be found on the device. Remove the note?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deleteNote(id, uri),
                },
              ]
            );
            setLoadingPlaybackId(null);
            return;
          }
        } catch (err) {
          console.warn("togglePlay: file existence check failed", err);
        }
      }
    }
    let playback: Audio.Sound | null = null;
    try {
      // If already playing this item, pause it
      if (playingId === id && sound) {
        const st = await sound.getStatusAsync();
        if ((st as any).isLoaded && (st as any).isPlaying) {
          await sound.pauseAsync();
          setPlayingId(null);
          return;
        }
      }

      // Ensure previous sound is fully unloaded and cleared to avoid internal race states
      if (sound) {
        try {
          await sound.unloadAsync();
        } catch (unloadErr) {
          console.warn("togglePlay: unload previous sound failed", unloadErr);
        }
        setSound(null);
      }

      // slight delay to let native layer settle when rapidly toggling
      await new Promise((r) => setTimeout(r, 50));

      const res = await createSoundWithRetries(uri, 3);
      if ((res as any)?.error) {
        const err = (res as any).error;
        // treat missing file specially
        if (
          err === "ENOENT" ||
          /FileNotFoundException|ENOENT/.test(String(err))
        ) {
          console.warn("togglePlay: file missing for", id, uri);
          // mark note missing
          setNotes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, missing: true } : n))
          );
          Alert.alert(
            "File Missing",
            "Recording file not found. Delete this note?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deleteNote(id, uri),
              },
            ]
          );
          return;
        }
        throw err || new Error("createSound failed");
      }

      playback = (res as any).sound;
      if (!playback) throw new Error("createSound returned no sound");
      await playback.playAsync();

      // Keep track of the playing sound and its progress
      setSound(playback);
      setPlayingId(id);
      try {
        playback.setOnPlaybackStatusUpdate((status: any) => {
          if (!status || !status.isLoaded) return;
          setPlaybackProgresses((prev) => ({
            ...prev,
            [id]: {
              position: status.positionMillis || 0,
              duration: status.durationMillis || prev[id]?.duration || 0,
            },
          }));

          if (status.didJustFinish && !status.isLooping) {
            setPlayingId(null);
            try {
              playback?.setOnPlaybackStatusUpdate(null);
              playback?.unloadAsync();
            } catch (e) {}
            setSound(null);
          }
        });
      } catch (e) {
        // Some native layers may not support status update registration; ignore.
      }
    } catch (err: any) {
      // More context to troubleshoot V8 internal errors
      console.error("togglePlay error", {
        id,
        uri,
        message: err?.message,
        stack: err?.stack,
        err,
      });
      try {
        if (playback) await playback.unloadAsync();
      } catch (cleanupErr) {
        console.warn("togglePlay: cleanup unload failed", cleanupErr);
      }
      setPlayingId(null);
      // suppress noisy repeated alerts but log for diagnostics
    } finally {
      setLoadingPlaybackId(null);
    }
  };

  const deleteNote = async (id: string, uri: string) => {
    const filtered = notes.filter((n) => n.id !== id);
    setNotes(filtered);

    if (isNative) {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        await FileSystem.writeAsStringAsync(
          FileSystem.documentDirectory + "notes.json",
          JSON.stringify(filtered)
        );
      }
    }
  };

  const renameNote = async (id: string, name: string) => {
    // Update the state immediately for instant UI feedback
    setNotes((prevNotes) =>
      prevNotes.map((note) => (note.id === id ? { ...note, name } : note))
    );

    // Save to storage in the background
    if (isNative) {
      try {
        const FileSystem = await getFileSystem();
        if (FileSystem) {
          const filePath = FileSystem.documentDirectory + "notes.json";
          const currentNotes = [...notes]; // Get current notes for saving
          const updatedNotes = currentNotes.map((note) =>
            note.id === id ? { ...note, name } : note
          );

          await FileSystem.writeAsStringAsync(
            filePath,
            JSON.stringify(updatedNotes)
          );
        }
      } catch (error) {
        console.error("Error saving renamed note:", error);
        // Revert the UI if save fails
        setNotes(notes);
        Alert.alert("Error", "Failed to save the renamed note");
      }
    }
  };

  const toggleStar = async (id: string) => {
    const updated = notes.map((n) =>
      n.id === id ? { ...n, starred: !n.starred } : n
    );
    setNotes(updated);
    if (isNative) {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        await FileSystem.writeAsStringAsync(
          FileSystem.documentDirectory + "notes.json",
          JSON.stringify(updated)
        );
      }
    }
  };

  const onSeek = async (id: string, x: number, width: number) => {
    const progress = playbackProgresses[id];
    if (!progress || !sound || playingId !== id) return;
    const pct = Math.max(0, Math.min(1, x / width));
    const newPos = Math.floor(pct * progress.duration);
    try {
      await sound.setPositionAsync(newPos);
      setPlaybackProgresses((p) => ({
        ...p,
        [id]: { ...p[id], position: newPos },
      }));
    } catch (err) {
      console.warn("seek failed", err);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#f4f6fb" },
    title: {
      fontSize: 26,
      fontWeight: "bold",
      marginBottom: 10,
      textAlign: "center",
    },
    pulse: { alignSelf: "center", marginBottom: 12 },
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    link: { color: "#4f46e5" },
    recording: { backgroundColor: "#ef4444" },
    recordRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    smallBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#64748b",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 10,
      elevation: 3,
    },
    saveBtn: {
      marginLeft: 10,
      backgroundColor: "#fff",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#e6e6e6",
    },
    saveText: { color: "#111827", fontSize: 14, fontWeight: "600" },
    webNotice: {
      textAlign: "center",
      color: "#666",
      marginBottom: 8,
      fontSize: 12,
    },
    search: {
      backgroundColor: "#fff",
      padding: 12,
      borderRadius: 12,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    recordBtn: {
      backgroundColor: "#4f46e5",
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
      shadowColor: "#4f46e5",
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 6,
    },
    empty: { textAlign: "center", color: "#777", marginTop: 20 },
    card: {
      backgroundColor: "#fff",
      padding: 14,
      borderRadius: 16,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 2,
      minHeight: 70,
      justifyContent: "center",
    },
    name: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 4,
    },
    meta: {
      color: "#666",
      marginTop: 4,
      fontSize: 12,
    },
    // playback controls
    playbackControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
      marginBottom: 8,
    },
    playButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: "#4f46e5",
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: 15,
      elevation: 3,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
    },
    playButtonText: {
      fontSize: 24,
      color: "white",
      textAlign: "center",
    },
    controlButton: {
      padding: 10,
      backgroundColor: "#e5e7eb",
      borderRadius: 8,
      minWidth: 60,
      alignItems: "center",
      justifyContent: "center",
    },
    controlButtonDisabled: {
      opacity: 0.5,
    },
    controlButtonText: {
      fontSize: 14,
      fontWeight: "bold",
      color: "#4f46e5",
    },
    progressContainer: {
      marginTop: 8,
    },
    progressBar: {
      height: 6,
      backgroundColor: "#eee",
      borderRadius: 6,
      overflow: "hidden",
      position: "relative",
    },
    progressFill: {
      height: "100%",
      backgroundColor: "#4f46e5",
    },
    scrubber: {
      position: "absolute",
      top: -6,
      width: 14,
      height: 14,
      borderRadius: 9,
      backgroundColor: "#fff",
      borderWidth: 2,
      borderColor: "#4f46e5",
      transform: [{ translateX: -7 }],
    },
    timeContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    timeText: {
      fontSize: 12,
      color: "#666",
    },
    progressTime: { fontSize: 11, color: "#666", marginTop: 6 },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 16,
      marginTop: 10,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>◀ Home</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>
      <Text style={styles.title}>🎙 Voice Journal</Text>

      {Platform.OS === "web" && (
        <Text style={styles.webNotice}>
          Web preview uses temporary memory storage only.
        </Text>
      )}

      <TextInput
        placeholder="Search voice notes"
        style={styles.search}
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.recordRow}>
        <Animated.View
          style={[styles.pulse, { transform: [{ scale: pulseAnim }] }]}
        >
          <TouchableOpacity
            style={[styles.recordBtn, recording ? styles.recording : undefined]}
            onPress={async () => {
              if (recording) {
                await stopRecording();
              } else {
                await startRecording();
              }
            }}
            disabled={preparingRecording || isSaving}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {recording ? "■" : "●"}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={styles.smallBtn}
          onPress={() => {
            if (recording) {
              if (recordingPaused) resumeRecording();
              else pauseRecording();
            }
          }}
          disabled={!recording}
        >
          <Text style={{ color: "#fff" }}>{recordingPaused ? "▶" : "⏸"}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={async () => {
            if (recording) await stopRecording();
          }}
        >
          <Text style={styles.saveText}>{isSaving ? "Saving..." : "Save"}</Text>
        </TouchableOpacity>
      </View>

      {filteredNotes.length === 0 ? (
        <Text style={styles.empty}>No voice notes yet.</Text>
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(item) => item.id}
          renderItem={renderNoteItem}
        />
      )}
    </View>
  );
}
