import { useEffect, useRef, useState } from "react";
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

export function CardScanner({ open, onOpenChange, onIdentified }: CardScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("camera");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CardIdentity | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }

    setStage("camera");
    setCameraError(null);
    setCapturedDataUrl(null);
    setIdentity(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setCameraError("Couldn't access the camera. Check permissions and try again.");
      });

    return () => stopStream();
  }, [open]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedDataUrl(dataUrl);
    setStage("identifying");
    stopStream();

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
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError("Couldn't access the camera. Check permissions and try again."));
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" /> Scan Card
          </DialogTitle>
        </DialogHeader>

        {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}

        {stage === "camera" && !cameraError && (
          <div className="space-y-3">
            <div className="relative aspect-[3/4] max-w-[280px] mx-auto rounded-xl overflow-hidden border border-border bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <Button onClick={capture} className="w-full h-11">
              <Camera className="w-4 h-4 mr-2" /> Capture
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
