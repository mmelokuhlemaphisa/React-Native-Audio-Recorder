import { Stack } from "expo-router";

export default function RootLayout() {
  // Hide the default header (which shows route names like "index") so the
  // app can render its own polished title inside the screen.
  return <Stack screenOptions={{ headerShown: false }} />;
}
