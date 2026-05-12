"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PwaInstallBannerProps {
  className?: string;
}

const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({ className }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log("beforeinstallprompt event fired!"); // Added for debugging
      // Always show the banner if the prompt is available
      setShowBanner(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowBanner(false);
      toast.success("App installed successfully!", {
        description: "You can now launch the app from your home screen.",
      });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // @ts-ignore - beforeinstallprompt event has a prompt() method
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      // @ts-ignore
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        toast.success("Installing app...");
      } else {
        toast.info("App installation cancelled.");
      }
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  };

  if (!showBanner || !deferredPrompt) {
    return null;
  }

  return (
    <div className={cn("bg-card border-b border-border p-3 flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-3">
        <Download className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <p className="font-semibold text-foreground">Install App</p>
          <p className="text-sm text-muted-foreground">Add to home screen for quick access!</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={handleInstallClick}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex-shrink-0"
          size="sm"
        >
          Install
        </Button>
        <Button
          onClick={() => setShowBanner(false)} // Dismiss for current session
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default PwaInstallBanner;