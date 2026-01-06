// App.tsx
// Task 3 – React Native Audio Recorder (Lesson 5)
// Updated to use expo-audio instead of expo-av

import { Ionicons } from "@expo/vector-icons";
import { Audio } from 'expo-av';
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

// ---------------------------------------------------------------
// IMPORTANT ARCHITECTURAL NOTE
// ---------------------------------------------------------------
// ❌ NO static import
// ❌ NO require() at module scope
// ✅ Dynamic import ONLY inside async functions on native platforms
// This guarantees the web bundler NEVER tries to fetch expo-file-system.
// ---------------------------------------------------------------

interface VoiceNote {
  id: string;
  uri: string;
  name: string;
  date: string;
  duration: number;
}

export default function App() {
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isNative = Platform.OS === "ios" || Platform.OS === "android";
  const [preparingRecording, setPreparingRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

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

  const requestPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission Required", "Microphone access is required");
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting audio permissions:', error);
      return false;
    }
  };

  const startRecording = async () => {
    if (preparingRecording) return;
    setPreparingRecording(true);
    
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setPreparingRecording(false);
        return;
      }

      // Stop any existing recording
      await stopRecording();

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });

        const { recording: newRecording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );

        recordingRef.current = newRecording;
        setRecording(newRecording);
        setRecordingPaused(false);
      } catch (error) {
        console.error('Failed to start recording:', error);
        Alert.alert('Error', 'Failed to start recording. Please try again.');
      }
    } catch (error) {
      console.error('Unexpected error in startRecording:', error);
      Alert.alert('Error', 'An unexpected error occurred while starting recording');
    } finally {
      setPreparingRecording(false);
    }
  };

  const pauseRecording = async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.pauseAsync();
      setRecordingPaused(true);
    } catch (error) {
      console.error('Error pausing recording:', error);
      Alert.alert('Error', 'Failed to pause recording');
    }
  };

  const resumeRecording = async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.startAsync();
      setRecordingPaused(false);
    } catch (error) {
      console.error('Error resuming recording:', error);
      Alert.alert('Error', 'Failed to resume recording');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return null;

    let uri = '';
    let duration = 0;
    const recordingToStop = recordingRef.current;
    recordingRef.current = null;

    try {
      // Get the recording status and stop if needed
      try {
        const status = await recordingToStop.getStatusAsync();
        if (status.isRecording) {
          await recordingToStop.stopAndUnloadAsync();
        }
        
        // Get the URI and duration
        uri = recordingToStop.getURI() || '';
        duration = status.durationMillis || 0;
      } catch (statusError) {
        console.warn('Error getting recording status:', statusError);
        return null;
      }

      // Ensure we have a valid URI before proceeding
      if (!uri) {
        console.warn('No recording URI available');
        setRecording(null);
        setRecordingPaused(false);
        return null;
      }

      const id = Date.now().toString();
      let finalUri = uri;

      if (isNative) {
        const FileSystem = await getFileSystem();
        if (FileSystem) {
          try {
            setIsSaving(true);
            
            // Create a recordings directory if it doesn't exist
            const recordingsDir = FileSystem.documentDirectory + 'recordings/';
            await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
            
            const newPath = recordingsDir + `voice_${id}.m4a`;
            
            // Check if source file exists
            const fileInfo = await FileSystem.getInfoAsync(uri);
            if (!fileInfo.exists) {
              console.warn('Source file does not exist:', uri);
              return null;
            }
            
            // Try to move the file first (more efficient)
            try {
              await FileSystem.moveAsync({
                from: uri,
                to: newPath
              });
              finalUri = newPath;
            } catch (moveError) {
              console.warn('Move failed, trying copy:', moveError);
              
              // If move fails, try to copy
              try {
                await FileSystem.copyAsync({
                  from: uri,
                  to: newPath
                });
                finalUri = newPath;
                
                // Try to delete the original after successful copy
                try {
                  await FileSystem.deleteAsync(uri, { idempotent: true });
                } catch (delError) {
                  console.warn('Failed to delete original file:', delError);
                }
              } catch (copyError) {
                console.error('Failed to copy file:', copyError);
                throw new Error('Failed to save recording');
              }
            }
            // Save recording metadata - using notes.json to match list.tsx
            const notesFile = FileSystem.documentDirectory + 'notes.json';
            let recordings = [];
            
            try {
              // Read existing recordings if the file exists
              const fileInfo = await FileSystem.getInfoAsync(notesFile);
              if (fileInfo.exists) {
                const content = await FileSystem.readAsStringAsync(notesFile);
                try {
                  recordings = JSON.parse(content);
                } catch (parseError) {
                  console.warn('Error parsing recordings file, starting fresh');
                  recordings = [];
                }
              }
              
              // Add new recording
              const note = {
                id,
                uri: finalUri,
                name: `Recording ${recordings.length + 1}`,
                date: new Date().toISOString(),
                duration
              };
              
              // Add to beginning of array (newest first)
              recordings.unshift(note);
              
              // Save back to file
              await FileSystem.writeAsStringAsync(
                notesFile, 
                JSON.stringify(recordings),
                { encoding: FileSystem.EncodingType.UTF8 }
              );
              
            } catch (metadataError) {
              console.error('Error handling recording metadata:', metadataError);
              // Don't fail the whole operation if metadata save fails
            }
            
            // Return the final URI and duration
            return { uri: finalUri, duration };
            
          } catch (error) {
            console.error('Error in file operations:', error);
            Alert.alert('Error', 'Failed to save recording');
            return null;
          } finally {
            setIsSaving(false);
          }
        }
      }
      
      // For non-native platforms, just return the original URI
      return { uri: finalUri, duration };
      
    } catch (error) {
      console.error('Error in stopRecording:', error);
      Alert.alert('Error', 'Failed to process recording');
      return null;
    } finally {
      setRecording(null);
      setRecordingPaused(false);
      
      // Navigate to list view after a short delay to ensure UI updates
      setTimeout(() => {
        router.push("/list");
      }, 100);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙 Voice Journal</Text>

      {recording && (
        <View style={styles.recordBanner}>
          <View style={styles.recordDot} />
          <Text style={styles.recordingText}>Recording…</Text>
        </View>
      )}

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>New Voice Notes</Text>
        <Text style={styles.heroSub}>
          Quickly capture voice thoughts and memos.
        </Text>
      </View>

      {/* Primary record control on Home */}
      <View style={styles.homeRecordRow}>
        <Animated.View
          style={[styles.pulse, { transform: [{ scale: pulseAnim }] }]}
        >
          <TouchableOpacity
            style={[styles.recordBtn, recording ? styles.recording : null]}
            onPress={recording ? stopRecording : startRecording}
          >
            <Ionicons
              name={recording ? "stop" : "mic"}
              size={32}
              color="#fff"
            />
          </TouchableOpacity>
        </Animated.View>

        {recording && (
          <View style={styles.homeControls}>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={recordingPaused ? resumeRecording : pauseRecording}
            >
              <Ionicons
                name={recordingPaused ? "play" : "pause"}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={stopRecording}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#111827" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.linkRow}
        onPress={() => router.push("/list")}
      >
        <Text style={styles.linkText}>📄 Lists</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------
// BASIC TEST CASES (MANUAL / ASSESSMENT-READY)
// ---------------------------------------------------------------
// 1. Record audio → stop → item appears in list
// 2. Close app → reopen → audio still present (native only)
// 3. Rename note → close app → name persists
// 4. Search by renamed title → correct note appears
// 5. Delete note → file removed and list updates
// 6. Web preview → app loads without build errors
// ---------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f4f6fb",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  hero: {
    marginTop: 24,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
  },
  heroTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  heroSub: { color: "#666", marginBottom: 12 },
  heroBtn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  heroBtnText: { color: "#fff", fontWeight: "700" },
  linkRow: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#4f46e5", fontWeight: "600" },
  pulse: {
    alignSelf: "center",
    marginBottom: 12,
  },
  recording: {
    backgroundColor: "#ef4444",
  },
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
  saveText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
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
  homeRecordRow: { alignItems: "center", marginVertical: 18 },
  homeControls: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  recordBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    marginRight: 8,
  },
  recordingText: { color: "#b91c1c", fontWeight: "700" },
  empty: {
    textAlign: "center",
    color: "#777",
    marginTop: 20,
  },
  card: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  meta: {
    color: "#666",
    marginTop: 4,
    fontSize: 12,
  },
  progressBar: {
    marginTop: 8,
  },
  progressBg: {
    height: 6,
    backgroundColor: "#eee",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
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
  progressTime: {
    fontSize: 11,
    color: "#666",
    marginTop: 6,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 10,
  },
});
