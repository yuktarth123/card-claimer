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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Camera, X, Loader2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { CURRENCY, CARD_CONDITIONS, ITEM_TYPES, PREORDER_MIN_DAYS, PREORDER_MAX_DAYS } from "@/config";
import { AdditionalPhotosField } from "@/components/AdditionalPhotosField";
import { prepareVideoForUpload, isPayloadTooLargeError } from "@/lib/videoUpload";

type Card = Database["public"]["Tables"]["cards"]["Row"];

interface EditCardDialogProps {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function EditCardDialog({ card, open, onOpenChange, onSave }: EditCardDialogProps) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<string>("card");
  const [cardSet, setCardSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [rarity, setRarity] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("English");
  const [isPreorder, setIsPreorder] = useState(false);
  const [isVintage, setIsVintage] = useState(false);
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantityTotal, setQuantityTotal] = useState("1");
  const [condition, setCondition] = useState<string>(CARD_CONDITIONS[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [extraPhotoUrls, setExtraPhotoUrls] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (card) {
      setName(card.name);
      setItemType(card.item_type);
      setCardSet(card.card_set || "");
      setCardNumber(card.card_number || "");
      setRarity(card.rarity || "");
      setCategory(card.category || "");
      setLanguage(card.language || "English");
      setIsPreorder(card.is_preorder);
      setIsVintage(card.is_vintage);
      setPrice(String(card.price));
      setSalePrice(card.sale_price !== null ? String(card.sale_price) : "");
      setQuantityTotal(String(card.quantity_total));
      setCondition(card.condition || CARD_CONDITIONS[0]);
      setPhotoPreview(card.photo_url || null);
      setExistingPhotoUrl(card.photo_url || null);
      setExtraPhotoUrls(card.photo_urls ?? []);
      setVideoPreview(card.video_url || null);
      setPhotoFile(null);
      setVideoFile(null);
    }
  }, [card]);

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    setExistingPhotoUrl(null);
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
    } else {
      setPhotoPreview(card?.photo_url || null);
    }
  };

  const handlePhotoUrlPick = (url: string) => {
    setPhotoFile(null);
    setExistingPhotoUrl(url);
    setPhotoPreview(url);
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setVideoFile(null);
      setVideoPreview(card?.video_url || null);
      return;
    }

    setIsProcessingVideo(true);
    const { file: prepared, error } = await prepareVideoForUpload(file);
    setIsProcessingVideo(false);

    if (error) {
      toast.error(error);
      if (videoFileRef.current) videoFileRef.current.value = "";
      return;
    }

    setVideoFile(prepared);
    setVideoPreview(URL.createObjectURL(prepared!));
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setExistingPhotoUrl(null);
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
      toast.error("Name and price are required.");
      return;
    }

    const parsedPrice = Number(price);
    const parsedSalePrice = salePrice ? Number(salePrice) : null;
    const parsedQuantityTotal = Math.max(0, Math.floor(Number(quantityTotal) || 0));

    if (parsedSalePrice !== null && parsedSalePrice > parsedPrice) {
      toast.error("Sale price cannot be greater than the original price.");
      return;
    }

    // If the total stock changed, shift quantity_available by the same delta
    // (so units already claimed by buyers aren't affected), clamped at 0.
    const quantityDelta = parsedQuantityTotal - card.quantity_total;
    const newQuantityAvailable = Math.max(0, card.quantity_available + quantityDelta);

    setIsSaving(true);
    let newPhotoUrl = existingPhotoUrl;
    let newVideoUrl = card.video_url;

    if (photoFile) {
      const photoPath = `card-images/${Date.now()}-${Math.random().toString(36).slice(2)}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("card-images").upload(photoPath, photoFile, {
        cacheControl: "31536000", // unique timestamped path, never overwritten -- safe to cache for a year
      });
      if (uploadError) {
        toast.error("Failed to upload new photo.");
        setIsSaving(false);
        return;
      }
      const { data } = supabase.storage.from("card-images").getPublicUrl(photoPath);
      newPhotoUrl = data.publicUrl;
    }

    if (videoFile) {
      const videoPath = `card-videos/${Date.now()}-${Math.random().toString(36).slice(2)}-${videoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("card-videos").upload(videoPath, videoFile, {
        cacheControl: "31536000", // unique timestamped path, never overwritten -- safe to cache for a year
      });
      if (uploadError) {
        toast.error(isPayloadTooLargeError(uploadError) ? "Video is too large for upload (max 50MB). Try a shorter clip." : "Failed to upload new video.");
        setIsSaving(false);
        return;
      }
      const { data } = supabase.storage.from("card-videos").getPublicUrl(videoPath);
      newVideoUrl = data.publicUrl;
    } else if (videoPreview === null && card.video_url) {
      newVideoUrl = null;
    }

    const { error } = await supabase
      .from("cards")
      .update({
        name: name.trim(),
        item_type: itemType,
        card_set: cardSet.trim() || null,
        card_number: itemType === "card" ? cardNumber.trim() || null : null,
        rarity: itemType === "card" ? rarity.trim() || null : null,
        category: category.trim() || null,
        language: language.trim() || "English",
        is_preorder: isPreorder,
        is_vintage: isVintage,
        price: parsedPrice,
        sale_price: parsedSalePrice,
        condition,
        quantity_total: parsedQuantityTotal,
        quantity_available: newQuantityAvailable,
        photo_url: newPhotoUrl,
        photo_urls: extraPhotoUrls,
        video_url: newVideoUrl,
      })
      .eq("id", card.id);

    if (error) {
      console.error("Error updating listing:", error);
      toast.error("Failed to update listing details.");
    } else {
      toast.success("Listing updated successfully!");
      onSave();
      onOpenChange(false);
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Listing: {card?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="item-type" className="text-right">Listing Type</Label>
            <Select value={itemType} onValueChange={setItemType}>
              <SelectTrigger id="item-type" className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="card-set" className="text-right">Set</Label>
            <Input id="card-set" value={cardSet} onChange={(e) => setCardSet(e.target.value)} className="col-span-3" placeholder="Obsidian Flames, Base Set..." />
          </div>

          {itemType === "card" && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="card-number" className="text-right">Card #</Label>
                <Input id="card-number" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="col-span-3" placeholder="4/102" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rarity" className="text-right">Rarity</Label>
                <Input id="rarity" value={rarity} onChange={(e) => setRarity(e.target.value)} className="col-span-3" placeholder="Rare Holo" />
              </div>
            </>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">Category</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="col-span-3" placeholder="Booster Box, ETB..." />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="language" className="text-right">Language</Label>
            <Input id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="col-span-3" placeholder="English" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="preorder" className="text-right">Pre-Order</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Switch id="preorder" checked={isPreorder} onCheckedChange={setIsPreorder} />
              <span className="text-xs text-muted-foreground">
                Ships in {PREORDER_MIN_DAYS}-{PREORDER_MAX_DAYS} days
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="vintage" className="text-right">Vintage</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Switch id="vintage" checked={isVintage} onCheckedChange={setIsVintage} />
              <span className="text-xs text-muted-foreground">Older/especially collectible print</span>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price" className="text-right">Price ({CURRENCY})</Label>
            <Input id="price" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sale-price" className="text-right">Sale Price ({CURRENCY})</Label>
            <Input
              id="sale-price"
              type="number"
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="col-span-3"
              placeholder="Optional sale price"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="quantity-total" className="text-right">Total Stock</Label>
            <div className="col-span-3">
              <Input
                id="quantity-total"
                type="number"
                inputMode="numeric"
                min={0}
                value={quantityTotal}
                onChange={(e) => setQuantityTotal(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {card?.quantity_available ?? 0} of {card?.quantity_total ?? 0} currently unclaimed
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="condition" className="text-right">Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger id="condition" className="col-span-3">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                {CARD_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                <Camera className="w-4 h-4 mr-2" /> Take Photo / Choose Photo
              </Button>
              <input
                ref={photoFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoFileChange}
              />
              <div className="flex gap-2">
                <Input
                  value={photoUrlInput}
                  onChange={(e) => setPhotoUrlInput(e.target.value)}
                  placeholder="…or paste an image URL"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && photoUrlInput.trim()) {
                      e.preventDefault();
                      handlePhotoUrlPick(photoUrlInput.trim());
                      setPhotoUrlInput("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!photoUrlInput.trim()) return;
                    handlePhotoUrlPick(photoUrlInput.trim());
                    setPhotoUrlInput("");
                  }}
                >
                  Use URL
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">More Photos</Label>
            <div className="col-span-3">
              <AdditionalPhotosField urls={extraPhotoUrls} onChange={setExtraPhotoUrls} hideLabel />
            </div>
          </div>

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
                disabled={isProcessingVideo}
                className="w-full"
              >
                {isProcessingVideo ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Compressing video…</>
                ) : (
                  <><Video className="w-4 h-4 mr-2" /> Record Video / Choose Video</>
                )}
              </Button>
              <input
                ref={videoFileRef}
                type="file"
                accept="video/*"
                capture="environment"
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
          <Button onClick={handleSave} disabled={isSaving || isProcessingVideo}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
