import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, RotateCcw, Check } from "lucide-react";
import { identifyCardFromImage, CardIdentity } from "@/lib/cardVision";
import { toast } from "sonner";
import { CURRENCY, USD_TO_INR_RATE } from "@/config";

export interface ScannedCard {
  name: string;
  set: string | null;
  number: string | null;
  language: string | null;
  priceSuggestionInr: number | null;
  priceSuggestionLabel: string | null;
  // Only "gemini_search" comes with real cited sources for this exact card.
  // "japanese_proxy" has been observed matching a different, wrong print
  // (e.g. a common instead of a rare parallel) since PokemonPriceTracker has
  // no way to confirm it found the same rarity/parallel -- so the caller
  // treats it as informational only, never pre-filled into the Price field.
  priceSuggestionSource: "gemini_search" | "japanese_proxy" | null;
  photoBlob: Blob;
}

interface CardScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIdentified: (card: ScannedCard) => void;
}

type Stage = "camera" | "identifying" | "confirm" | "uncertain";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Could not read the photo file."));
    reader.readAsDataURL(file);
  });
}

export function CardScanner({ open, onOpenChange, onIdentified }: CardScannerProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("camera");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CardIdentity | null>(null);

  // Opens the phone's own camera app (via the OS photo picker) instead of a
  // getUserMedia live preview -- browser video streams can't match a native
  // camera's autofocus/macro handling, which matters a lot at the close
  // range card scanning needs. This is the same technique the rest of the
  // app already uses for photo capture (Admin's "Take Photo" button).
  const openCamera = () => {
    photoInputRef.current?.click();
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) return;

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the photo.");
      return;
    }

    setCapturedDataUrl(dataUrl);
    setStage("identifying");

    try {
      const result = await identifyCardFromImage(dataUrl);
      setIdentity(result);
      setStage(result.uncertain || !result.name ? "uncertain" : "confirm");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Card identification failed.");
      retake();
    }
  };

  const retake = () => {
    setStage("camera");
    setCapturedDataUrl(null);
    setIdentity(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const confirm = async () => {
    if (!identity?.name || !capturedDataUrl) return;
    const res = await fetch(capturedDataUrl);
    const blob = await res.blob();
    onIdentified({
      name: identity.name,
      set: identity.set,
      number: identity.number,
      language: identity.language,
      priceSuggestionInr: identity.priceSuggestion ? identity.priceSuggestion.amountUsd * USD_TO_INR_RATE : null,
      priceSuggestionLabel: identity.priceSuggestion?.label ?? null,
      priceSuggestionSource: identity.priceSuggestion?.source ?? null,
      photoBlob: blob,
    });
    onOpenChange(false);
    retake();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) retake();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" /> Scan Card
          </DialogTitle>
        </DialogHeader>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />

        {stage === "camera" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Opens your phone's camera app for a sharper, better-focused photo than an in-browser preview can manage.
            </p>
            <Button onClick={openCamera} className="w-full h-11">
              <Camera className="w-4 h-4 mr-2" /> Take Photo
            </Button>
          </div>
        )}

        {stage === "identifying" && (
          <div className="space-y-3">
            {capturedDataUrl && (
              <div className="relative aspect-[3/4] max-w-[280px] mx-auto rounded-xl overflow-hidden border border-border">
                <img src={capturedDataUrl} alt="Captured card" className="w-full h-full object-cover" />
              </div>
            )}
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Identifying card…
            </p>
          </div>
        )}

        {stage === "confirm" && identity && (
          <div className="space-y-3">
            {capturedDataUrl && (
              <div className="relative aspect-[3/4] max-w-[280px] mx-auto rounded-xl overflow-hidden border border-border">
                <img src={capturedDataUrl} alt="Captured card" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="text-sm text-center space-y-0.5">
              <p className="font-semibold">{identity.name}</p>
              <p className="text-muted-foreground">
                {identity.set || "Set unknown"} {identity.number ? `• #${identity.number}` : ""}
              </p>
              {identity.language && identity.language.toLowerCase() !== "english" && (
                <p className="text-xs text-amber-500 font-medium">
                  {identity.language} print — set/card # won't be auto-matched, the TCG database only covers English prints.
                </p>
              )}
              {identity.priceSuggestion && (
                <div className="text-xs bg-muted/50 rounded-lg p-2 mt-1 text-left space-y-1">
                  <p className="font-semibold text-foreground">
                    {identity.priceSuggestion.label}: {CURRENCY}{(identity.priceSuggestion.amountUsd * USD_TO_INR_RATE).toFixed(0)}
                    <span className="text-muted-foreground font-normal"> (${identity.priceSuggestion.amountUsd.toFixed(2)})</span>
                  </p>
                  {identity.priceSuggestion.note && (
                    <p className="text-muted-foreground">{identity.priceSuggestion.note}</p>
                  )}
                  {identity.priceSuggestion.sourceUrls.length > 0 && (
                    <p className="text-muted-foreground truncate">
                      Sources:{" "}
                      {identity.priceSuggestion.sourceUrls.map((u, i) => (
                        <span key={u}>
                          {i > 0 && ", "}
                          <a href={u} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                            {new URL(u).hostname.replace(/^www\./, "")}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="text-amber-500 font-medium">
                    {identity.priceSuggestion.source === "japanese_proxy"
                      ? "Not pre-filled — this proxy has matched the wrong print/rarity before. Reference only."
                      : "Estimate only — verify before publishing."}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-1">Verify against the physical card before using.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={retake} className="flex-1">
                <RotateCcw className="w-4 h-4 mr-2" /> Retake
              </Button>
              <Button onClick={confirm} className="flex-1">
                <Check className="w-4 h-4 mr-2" /> Use this
              </Button>
            </div>
          </div>
        )}

        {stage === "uncertain" && (
          <div className="space-y-3">
            {capturedDataUrl && (
              <div className="relative aspect-[3/4] max-w-[280px] mx-auto rounded-xl overflow-hidden border border-border">
                <img src={capturedDataUrl} alt="Captured card" className="w-full h-full object-cover" />
              </div>
            )}
            <p className="text-sm text-center text-amber-500">
              {identity?.note || "Not confident enough to identify this card."}
            </p>
            <Button variant="outline" onClick={retake} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" /> Retake
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
