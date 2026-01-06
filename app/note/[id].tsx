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

export default function NoteDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = (params as any).id as string;

  const [note, setNote] = useState<any | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [repeat, setRepeat] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    loadNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const getFileSystem = async (): Promise<any | null> => {
    try {
      const fs = await import("expo-file-system/legacy");
      return fs;
    } catch (err) {
      console.warn("getFileSystem note: failed", err);
      return null;
    }
  };

  const loadNote = async () => {
    const FileSystem = await getFileSystem();
    if (!FileSystem) return;
    const file = FileSystem.documentDirectory + "notes.json";
    try {
      const info = await FileSystem.getInfoAsync(file);
      if (info.exists) {
        const data = await FileSystem.readAsStringAsync(file);
        const list = JSON.parse(data);
        const found = list.find((n: any) => n.id === id);
        if (found) {
          setNote(found);
          setName(found.name || "");
        } else {
          Alert.alert("Not found", "Note not found");
          router.back();
        }
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const toggleStar = async () => {
    const FileSystem = await getFileSystem();
    if (!FileSystem || !note) return;
    try {
      const data = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + "notes.json"
      );
      const list = JSON.parse(data);
      const updated = list.map((n: any) =>
        n.id === id ? { ...n, starred: !n.starred } : n
      );
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + "notes.json",
        JSON.stringify(updated)
      );
      setNote((prev: any) => ({ ...prev, starred: !prev.starred }));
    } catch (err) {
      console.warn(err);
    }
  };

  const togglePlay = async () => {
    if (!note) return;

    const createSoundWithRetries = async (uri: string, attempts = 3) => {
      const FileSystem = await getFileSystem();
      if (FileSystem) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) return { error: 'ENOENT' };
        } catch (err) {
          console.warn('note createSound: file info check failed', err);
        }
      }

      let lastErr: any = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await Audio.Sound.createAsync({ uri });
          const s = res?.sound ?? null;
          if (!s) throw new Error('createAsync returned no sound');
          return { sound: s };
        } catch (err: any) {
          lastErr = err;
          console.warn(`note createSound attempt ${i + 1} failed`, (err as any)?.message || err);
          await new Promise((r) => setTimeout(r, 120));
        }
      }
      return { error: lastErr };
    };
    try {
      // If there's a sound playing, try pausing it first
      if (sound) {
        const st = await sound.getStatusAsync();
        if ((st as any).isLoaded && (st as any).isPlaying) {
          await sound.pauseAsync();
          setPlaying(false);
          return;
        }
        // unload existing to avoid conflicting native state
        try {
          await sound.unloadAsync();
        } catch (e) {
          console.warn("note togglePlay: unload existing failed", e);
        }
        setSound(null);
        await new Promise((r) => setTimeout(r, 50));
      }

      const res = await createSoundWithRetries(note.uri, 3);
      if ((res as any)?.error) {
        const err = (res as any).error;
        if (err === 'ENOENT' || /FileNotFoundException|ENOENT/.test(String(err))) {
          Alert.alert('File Missing', 'Recording file not found. Delete this note?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: doDelete },
          ]);
          setNote((prev: any) => (prev ? { ...prev, missing: true } : prev));
          return;
        }
        console.warn('note togglePlay: createSound ultimately failed', err);
        return;
      }

      const s = (res as any).sound;
      setSound(s);
      setPlaying(true);

      // Ensure rate & looping are set and play
      try {
        await s.setRateAsync(speed, true);
      } catch (err) {
        console.warn('note togglePlay: setRate failed', err);
      }
      try {
        await s.playAsync();
      } catch (err) {
        console.warn('note togglePlay: playAsync failed', err);
      }

      s.setOnPlaybackStatusUpdate((status: any) => {
        if (!status) return;
        const s2: any = status;
        if (s2.isLoaded) {
          setPosition(s2.positionMillis || 0);
          setDuration(s2.durationMillis || 0);
        }
        if (s2.didJustFinish) {
          if (repeat) {
            s.setPositionAsync(0);
            s.playAsync();
          } else {
            setPlaying(false);
          }
        }
      });
    } catch (err) {
      console.warn("togglePlay failed", err);
      // keep failures quiet in UI; developer log visible for diagnostics
    }
  };

  useEffect(() => {
    // update rate and looping if sound exists
    (async () => {
      if (!sound) return;
      try {
        await sound.setRateAsync(speed, true);
        await sound.setIsLoopingAsync(repeat);
      } catch (err) {
        console.warn("update sound settings failed", err);
      }
    })();
  }, [sound, speed, repeat]);

  useEffect(() => {
    return () => {
      (async () => {
        try {
          if (sound) await sound.unloadAsync();
        } catch {}
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound]);

  const doDelete = async () => {
    const FileSystem = await getFileSystem();
    if (!FileSystem || !note) return;
    try {
      const data = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + "notes.json"
      );
      const list = JSON.parse(data);
      const filtered = list.filter((n: any) => n.id !== id);
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + "notes.json",
        JSON.stringify(filtered)
      );
      // delete file
      await FileSystem.deleteAsync(note.uri, { idempotent: true });
      router.push("/list");
    } catch (err) {
      console.warn(err);
    }
  };

  const rename = async () => {
    if (!name) return;
    const FileSystem = await getFileSystem();
    if (!FileSystem || !note) return;
    try {
      const data = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + "notes.json"
      );
      const list = JSON.parse(data);
      const updated = list.map((n: any) => (n.id === id ? { ...n, name } : n));
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + "notes.json",
        JSON.stringify(updated)
      );
      setNote((prev: any) => ({ ...prev, name }));
      setEditing(false);
    } catch (err) {
      console.warn(err);
    }
  };

  if (!note) return null;

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
          <TouchableOpacity onPress={rename} style={styles.btn}>
            <Text style={styles.btnText}>Save</Text>
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
                  style={[
                    styles.speedBtn,
                    speed === s ? styles.speedActive : null,
                  ]}
                  onPress={() => setSpeed(s as number)}
                >
                  <Text
                    style={speed === s ? styles.speedActiveText : undefined}
                  >
                    {s}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.controlsRow}>
            <Text>Repeat</Text>
            <TouchableOpacity
              style={[styles.smallBtn, repeat ? styles.smallBtnActive : null]}
              onPress={() => setRepeat((r) => !r)}
            >
              <Text style={{ color: repeat ? "#fff" : "#111" }}>
                {repeat ? "On" : "Off"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: "center", marginTop: 18 }}>
            <TouchableOpacity
              onPress={togglePlay}
              style={[styles.playBtn, playing ? styles.playing : null]}
            >
              <Ionicons
                name={playing ? "pause" : "play"}
                size={26}
                color={playing ? "#fff" : "#4f46e5"}
              />
            </TouchableOpacity>
            <Text style={{ color: "#666", marginTop: 8 }}>
              {Math.floor(position / 1000)}s /{" "}
              {Math.floor((duration || note.duration) / 1000)}s
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => setEditing(true)}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Delete", "Delete this note?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: doDelete },
                ]);
              }}
              style={[styles.btn, styles.danger]}
            >
              <Text style={styles.btnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

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
  speedActiveText: { color: "#fff" },
  smallBtn: {
    marginLeft: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  smallBtnActive: { backgroundColor: "#4f46e5" },
  actionsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  playBtn: {
    marginTop: 6,
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  playing: { backgroundColor: "#4f46e5" },
  btn: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnText: { color: "#111" },
  danger: { backgroundColor: "#fee2e2" },
  input: { backgroundColor: "#fff", padding: 8, borderRadius: 8, marginTop: 8 },
});
