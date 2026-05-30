import { useIptvStore } from "@/store/use-iptv-store";
import { ProfileSelector } from "@/components/auth/profile-selector";
import Dashboard from "./dashboard";

export default function Home() {
  const profile = useIptvStore((state) => state.selectedProfile);

  if (profile) {
    return <Dashboard />;
  }

  return <ProfileSelector />;
}
