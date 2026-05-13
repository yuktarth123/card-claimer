"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner'; // Import sonner toast

const LOCAL_STORAGE_KEY = 'tcg_background_music_muted';

const BackgroundMusic: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const storedMuted = localStorage.getItem(LOCAL_STORAGE_KEY);
      return storedMuted === 'true';
    }
    return false;
  });
  const [hasInteracted, setHasInteracted] = useState(false); // To track user interaction for autoplay
  const [hasShownPlayToast, setHasShownPlayToast] = useState(false); // To show toast only once

  useEffect(() => {
    audioRef.current = new Audio('/11 - Route 1.mp3');
    audioRef.current.loop = true;
    audioRef.current.volume = 0.3; // Set a default volume

    const handleUserInteraction = () => {
      setHasInteracted(true);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    // Add event listeners to detect first user interaction
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      localStorage.setItem(LOCAL_STORAGE_KEY, String(isMuted));

      // Attempt to play only after user interaction and if not muted
      if (hasInteracted && !isMuted) {
        audioRef.current.play().then(() => {
          if (!hasShownPlayToast) {
            toast.info("Background music playing!", {
              description: "Tap the music icon to mute/unmute.",
              duration: 5000,
            });
            setHasShownPlayToast(true);
          }
        }).catch(error => {
          console.warn("Autoplay prevented:", error);
          // If autoplay is prevented, the user can still unmute manually.
          // The toast won't show if autoplay fails, which is fine.
        });
      } else if (isMuted) {
        audioRef.current.pause();
      }
    }
  }, [isMuted, hasInteracted, hasShownPlayToast]); // Add hasShownPlayToast to dependencies

  const handleToggleMute = () => {
    setIsMuted(prev => !prev);
    // Ensure interaction is marked true if user manually toggles mute
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 z-50"> {/* Changed bottom-4 to bottom-20 */}
      <Button
        variant="outline"
        size="icon"
        onClick={handleToggleMute}
        className={cn(
          "rounded-full shadow-lg transition-colors",
          isMuted ? "bg-muted-foreground/20 text-muted-foreground" : "bg-primary/20 text-primary hover:bg-primary/30"
        )}
        aria-label={isMuted ? "Unmute music" : "Mute music"}
      >
        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </Button>
    </div>
  );
};

export default BackgroundMusic;