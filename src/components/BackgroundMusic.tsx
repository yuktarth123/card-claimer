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
  const [hasShownPlayToast, setHasShownPlayToast] = useState(false); // To show toast only once for initial autoplay

  useEffect(() => {
    audioRef.current = new Audio('/11 - Route 1.mp3');
    audioRef.current.loop = true;
    audioRef.current.volume = 0.5; // Increased default volume
    audioRef.current.muted = isMuted; // Set initial mute state based on local storage

    const tryPlayMusic = () => {
      if (audioRef.current && !audioRef.current.muted) {
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
          // Do not show an error toast here, as it's expected for initial autoplay attempts
          // if no interaction has happened yet. The manual unmute will handle the error toast.
        });
      }
    };

    const handleFirstInteraction = () => {
      // This function will be called on the very first click/keydown
      // We try to play music here, as it's a direct user gesture.
      tryPlayMusic();
      // Remove listeners after the first interaction
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    // Add event listeners to detect first user interaction
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    // Also try to play immediately if not muted (e.g., on page refresh after previous interaction)
    if (!isMuted) {
      tryPlayMusic();
    }

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
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
    }
  }, [isMuted]); // Only react to isMuted changes for audio.muted and localStorage

  const handleToggleMute = () => {
    setIsMuted(prev => {
      const newMutedState = !prev;
      // localStorage.setItem(LOCAL_STORAGE_KEY, String(newMutedState)); // This is now handled by the useEffect above

      if (audioRef.current) {
        audioRef.current.muted = newMutedState;
        if (!newMutedState) { // If unmuting
          audioRef.current.play().then(() => {
            toast.info("Background music playing!", {
              description: "Tap the music icon to mute/unmute.",
              duration: 3000, // Shorter duration for manual toggle
            });
            // Ensure hasShownPlayToast is set if manually unmuted and played
            setHasShownPlayToast(true);
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
      return newMutedState;
    });
  };

  return (
    <div className="fixed bottom-20 right-4 z-50">
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