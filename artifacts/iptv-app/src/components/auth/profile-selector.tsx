import { useState, useRef } from "react";
import { useProfiles, useCreateProfile, useDeleteProfile } from "@/hooks/use-profiles";
import { useIptvStore } from "@/store/use-iptv-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tv,
  Plus,
  Trash2,
  Loader2,
  Upload,
  Link,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export function ProfileSelector() {
  const { data: profiles, isLoading } = useProfiles();
  const setSelectedProfile = useIptvStore((state) => state.setSelectedProfile);
  const deleteProfile = useDeleteProfile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12 z-10"
      >
        <div className="flex flex-col items-center justify-center gap-2 mb-4">
          <Tv className="w-14 h-14 text-primary mb-2" />
          <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white uppercase font-display">
            MARWAN IPTV
          </h1>
          <div className="h-px w-24 bg-primary/50 my-2" />
        </div>
        <p className="text-slate-400 text-sm uppercase tracking-[0.3em] font-light">
          Ultra Pro Max Edition
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-6xl z-10"
      >
        {profiles?.map((profile) => (
          <div key={profile.id} className="relative group">
            <button
              onClick={() => setSelectedProfile(profile)}
              className="w-full h-52 bg-card border border-border rounded-none p-6 flex flex-col items-center justify-center gap-4 hover:border-primary transition-all duration-500 group overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-16 h-16 border border-primary/20 flex items-center justify-center text-2xl font-light text-white group-hover:border-primary group-hover:text-primary transition-all duration-500 z-10">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-center z-10">
                <h3 className="font-display font-medium text-lg text-white tracking-tight">
                  {profile.name}
                </h3>
                <span className="text-[10px] text-primary uppercase tracking-[0.2em]">
                  {profile.m3uContent ? "LOCAL FILE" : profile.mode}
                </span>
                {profile.epgUrl && (
                  <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-1">
                    EPG Active
                  </p>
                )}
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this profile?")) deleteProfile.mutate(profile.id);
              }}
              className="absolute top-3 right-3 p-1.5 text-slate-700 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button className="w-full h-52 border border-dashed border-border bg-card/20 hover:bg-primary/5 hover:border-primary flex flex-col items-center justify-center gap-4 transition-all duration-500 group">
              <div className="w-14 h-14 border border-border flex items-center justify-center group-hover:border-primary transition-all duration-500">
                <Plus className="w-5 h-5 text-slate-500 group-hover:text-primary" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 group-hover:text-white transition-colors">
                Add Profile
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px] bg-background border border-border rounded-none shadow-2xl p-0 overflow-hidden">
            <div className="p-8 border-b border-border bg-card/50">
              <DialogHeader>
                <DialogTitle className="text-3xl font-medium font-display uppercase tracking-tight">
                  New Connection
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="p-8 overflow-y-auto max-h-[70vh]">
              <ProfileForm onSuccess={() => setIsDialogOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
}

function ProfileForm({ onSuccess }: { onSuccess: () => void }) {
  const createProfile = useCreateProfile();
  const { toast } = useToast();
  const [mode, setMode] = useState<"m3u" | "xtream" | "file">("m3u");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadedContent, setUploadedContent] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    m3uUrl: "",
    epgUrl: "",
    serverUrl: "",
    username: "",
    password: "",
  });

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploadState("uploading");
    try {
      const content = await file.text();
      const res = await fetch("/api/upload-m3u", {
        method: "POST",
        body: content,
        headers: { "Content-Type": "text/plain" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setUploadedContent(data.content);
      setEntryCount(data.entryCount);
      setUploadState("done");
    } catch (err: any) {
      setUploadState("error");
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "file" && !uploadedContent) {
      toast({
        title: "No File",
        description: "Please upload an M3U file first.",
        variant: "destructive",
      });
      return;
    }

    createProfile.mutate(
      {
        name: formData.name,
        mode,
        m3uUrl: mode === "m3u" ? formData.m3uUrl : undefined,
        m3uContent: mode === "file" ? uploadedContent : undefined,
        epgUrl: formData.epgUrl || undefined,
        serverUrl: mode === "xtream" ? formData.serverUrl : undefined,
        username: mode === "xtream" ? formData.username : undefined,
        password: mode === "xtream" ? formData.password : undefined,
        favorites: [],
        continueWatching: {},
      },
      { onSuccess }
    );
  };

  const field = (id: keyof typeof formData) => ({
    id,
    value: formData[id],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormData((p) => ({ ...p, [id]: e.target.value })),
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500">Profile Name</Label>
        <Input
          required
          placeholder="E.G. LIVING ROOM"
          className="bg-card border-border rounded-none h-11 text-sm"
          {...field("name")}
        />
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "m3u" | "xtream" | "file")}>
        <TabsList className="grid w-full grid-cols-3 bg-card border border-border h-11 rounded-none p-0.5 gap-0.5">
          <TabsTrigger
            value="m3u"
            className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black text-[10px] uppercase tracking-widest h-full"
          >
            <Link className="w-3 h-3 mr-1.5" />
            M3U URL
          </TabsTrigger>
          <TabsTrigger
            value="xtream"
            className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black text-[10px] uppercase tracking-widest h-full"
          >
            Xtream API
          </TabsTrigger>
          <TabsTrigger
            value="file"
            className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black text-[10px] uppercase tracking-widest h-full"
          >
            <Upload className="w-3 h-3 mr-1.5" />
            File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="m3u" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">
              M3U Playlist URL
            </Label>
            <Input
              required={mode === "m3u"}
              placeholder="http://server.com/playlist.m3u"
              className="bg-card border-border rounded-none h-11 text-xs"
              {...field("m3uUrl")}
            />
          </div>
        </TabsContent>

        <TabsContent value="xtream" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">
              Server URL
            </Label>
            <Input
              required={mode === "xtream"}
              placeholder="http://server.com:8080"
              className="bg-card border-border rounded-none h-11 text-xs"
              {...field("serverUrl")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">
                Username
              </Label>
              <Input
                required={mode === "xtream"}
                className="bg-card border-border rounded-none h-11 text-xs"
                {...field("username")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">
                Password
              </Label>
              <Input
                required={mode === "xtream"}
                type="password"
                className="bg-card border-border rounded-none h-11 text-xs"
                {...field("password")}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="file" className="pt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".m3u,.m3u8,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-32 border border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-3 transition-all duration-300 group"
          >
            {uploadState === "idle" && (
              <>
                <Upload className="w-6 h-6 text-slate-600 group-hover:text-primary transition-colors" />
                <span className="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-white">
                  Click to upload M3U / M3U8 file
                </span>
              </>
            )}
            {uploadState === "uploading" && (
              <>
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <span className="text-[10px] uppercase tracking-widest text-slate-500">
                  Processing file...
                </span>
              </>
            )}
            {uploadState === "done" && (
              <>
                <CheckCircle className="w-6 h-6 text-green-500" />
                <span className="text-[10px] uppercase tracking-widest text-green-400">
                  {entryCount.toLocaleString()} channels loaded
                </span>
                <span className="text-[8px] uppercase tracking-widest text-slate-600">
                  Click to change file
                </span>
              </>
            )}
            {uploadState === "error" && (
              <>
                <AlertCircle className="w-6 h-6 text-red-500" />
                <span className="text-[10px] uppercase tracking-widest text-red-400">
                  Upload failed — click to retry
                </span>
              </>
            )}
          </button>
        </TabsContent>
      </Tabs>

      <div className="space-y-2 border-t border-border pt-4">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500">
          EPG URL <span className="text-slate-600">(Optional)</span>
        </Label>
        <Input
          placeholder="http://epg-server.com/epg.xml"
          className="bg-card border-border rounded-none h-11 text-xs"
          {...field("epgUrl")}
        />
        <p className="text-[9px] text-slate-600 uppercase tracking-wider">
          Electronic Program Guide for channel schedule data
        </p>
      </div>

      <Button
        type="submit"
        disabled={createProfile.isPending}
        className="w-full h-12 rounded-none text-xs font-bold uppercase tracking-[0.3em] bg-primary hover:bg-primary/90 text-black transition-all duration-300"
      >
        {createProfile.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          "Establish Connection"
        )}
      </Button>
    </form>
  );
}
