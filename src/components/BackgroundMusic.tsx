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
  const [hasShownPlayToast, setHasShownPlayToast] = useState(false); // To show toast only once for initial autoplay

  useEffect(() => {
    audioRef.current = new Audio('/11 - Route 1.mp3');
    audioRef.current.loop = true;
    audioRef.current.volume = 0.5; // Increased default volume
    audioRef.current.muted = isMuted; // Set initial mute state based on local storage

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
  }, []); // Empty dependency array for initial setup

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      localStorage.setItem(LOCAL_STORAGE_KEY, String(isMuted));

      // Attempt to play only after user interaction and if not muted
      if (!isMuted && hasInteracted) {
        audioRef.current.play().then(() => {
          console.log("Background music started playing.");
          // Only show toast if it hasn't been shown for initial autoplay
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
  }, [isMuted, hasInteracted, hasShownPlayToast]); // Dependencies for playing/pausing

  const handleToggleMute = () => {
    setIsMuted(prev => {
      const newMutedState = !prev;
      localStorage.setItem(LOCAL_STORAGE_KEY, String(newMutedState)); // Update local storage immediately

      if (audioRef.current) {
        audioRef.current.muted = newMutedState;
        if (!newMutedState) { // If unmuting
          audioRef.current.play().then(() => {
            toast.info("Background music playing!", {
              description: "Tap the music icon to mute/unmute.",
              duration: 3000, // Shorter duration for manual toggle
            });
          }).catch(error => {
            console.warn("Manual play prevented:", error);
            toast.error("Could not play music.", {
              description: "Your browser might be blocking autoplay. Please check browser settings.",
              duration: 5000,
            });
          });
        } else { // If muting
          audioRef.current.pause();
          toast.info("Background music muted.");
        }
      }
      // Ensure interaction is marked true if user manually toggles mute
      if (!hasInteracted) {
        setHasInteracted(true);
      }
      return newMutedState;
    });
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