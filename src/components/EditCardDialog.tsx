import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Upload, X, Loader2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { CURRENCY } from "@/config";

type Card = Database["public"]["Tables"]["cards"]["Row"];

interface EditCardDialogProps {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function EditCardDialog({ card, open, onOpenChange, onSave }: EditCardDialogProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<string>("Near Mint");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (card) {
      setName(card.name);
      setPrice(String(card.price));
      setCondition(card.condition || "Near Mint");
      setPhotoPreview(card.photo_url || card.tcg_image_url || null);
      setVideoPreview(card.video_url || null);
      setPhotoFile(null);
      setVideoFile(null);
    }
  }, [card]);

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
    } else {
      setPhotoPreview(card?.photo_url || card?.tcg_image_url || null);
    }
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setVideoFile(file);
    if (file) {
      setVideoPreview(URL.createObjectURL(file));
    } else {
      setVideoPreview(card?.video_url || null);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoFileRef.current) photoFileRef.current.value = "";
  };

  const handleRemoveVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const handleSave = async () => {
    if (!card) return;
    if (!name.trim() || !price) {
      toast.error("Card name and price are required.");
      return;
    }

    setIsSaving(true);
    let newPhotoUrl = card.photo_url;
    let newVideoUrl = card.video_url;

    // Handle photo upload
    if (photoFile) {
      const photoPath = `card-images/${Date.now()}-${Math.random().toString(36).slice(2)}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("card-images").upload(photoPath, photoFile);
      if (uploadError) {
        toast.error("Failed to upload new photo.");
        setIsSaving(false);
        return;
      }
      const { data } = supabase.storage.from("card-images").getPublicUrl(photoPath);
      newPhotoUrl = data.publicUrl;
    } else if (photoPreview === null && card.photo_url) {
      // If photo was removed and there was an old photo_url
      newPhotoUrl = null;
    }

    // Handle video upload
    if (videoFile) {
      const videoPath = `card-videos/${Date.now()}-${Math.random().toString(36).slice(2)}-${videoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("card-videos").upload(videoPath, videoFile);
      if (uploadError) {
        toast.error("Failed to upload new video.");
        setIsSaving(false);
        return;
      }
      const { data } = supabase.storage.from("card-videos").getPublicUrl(videoPath);
      newVideoUrl = data.publicUrl;
    } else if (videoPreview === null && card.video_url) {
      // If video was removed and there was an old video_url
      newVideoUrl = null;
    }

    const { error } = await supabase
      .from("cards")
      .update({
        name: name.trim(),
        price: Number(price),
        condition: condition,
        photo_url: newPhotoUrl,
        video_url: newVideoUrl,
        // tcg_image_url is not editable here, it comes from TCG search
      })
      .eq("id", card.id);

    if (error) {
      console.error("Error updating card:", error);
      toast.error("Failed to update card details.");
    } else {
      toast.success("Card updated successfully!");
      onSave();
      onOpenChange(false);
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Card: {card?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Card Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price" className="text-right">
              Price ({CURRENCY})
            </Label>
            <Input
              id="price"
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="col-span-3"
            />
          </div>

          {/* Condition */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="condition" className="text-right">
              Condition
            </Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger id="condition" className="col-span-3">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Near Mint">Near Mint</SelectItem>
                <SelectItem value="Lightly Played">Lightly Played</SelectItem>
                <SelectItem value="Moderately Played">Moderately Played</SelectItem>
                <SelectItem value="Heavily Played">Heavily Played</SelectItem>
                <SelectItem value="Damaged">Damaged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Photo Upload */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Photo</Label>
            <div className="col-span-3 space-y-2">
              {photoPreview && (
                <div className="relative w-24 h-24 rounded-md overflow-hidden border border-border">
                  <img src={photoPreview} alt="Photo Preview" className="w-full h-full object-cover" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={handleRemovePhoto}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => photoFileRef.current?.click()}
                className="w-full"
              >
                <Camera className="w-4 h-4 mr-2" /> Change Photo
              </Button>
              <input
                ref={photoFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoFileChange}
              />
            </div>
          </div>

          {/* Video Upload */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Video</Label>
            <div className="col-span-3 space-y-2">
              {videoPreview && (
                <div className="relative w-24 h-24 rounded-md overflow-hidden border border-border bg-black flex items-center justify-center">
                  <video src={videoPreview} controls className="w-full h-full object-contain" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={handleRemoveVideo}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => videoFileRef.current?.click()}
                className="w-full"
              >
                <Video className="w-4 h-4 mr-2" /> Change Video
              </Button>
              <input
                ref={videoFileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoFileChange}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}