"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import useEmblaCarousel from "embla-carousel-react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaCarouselDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaUrls: string[];
  initialIndex?: number;
}

const MediaCarouselDialog: React.FC<MediaCarouselDialogProps> = ({
  open,
  onOpenChange,
  mediaUrls,
  initialIndex = 0,
}) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    startIndex: initialIndex,
  });
  const [prevBtnDisabled, setPrevBtnDisabled] = useState(true);
  const [nextBtnDisabled, setNextBtnDisabled] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi && emblaApi.scrollTo(index), [emblaApi]);

  const onSelect = useCallback((emblaApi: any) => {
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setPrevBtnDisabled(!emblaApi.canScrollPrev());
    setNextBtnDisabled(!emblaApi.canScrollNext());
  }, []);

  const onInit = useCallback((emblaApi: any) => {
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.scrollTo(initialIndex, false); // Ensure initial index is set on init
  }, [emblaApi, initialIndex]);

  useEffect(() => {
    if (!emblaApi) return;

    onInit(emblaApi); // Call onInit when emblaApi is ready
    onSelect(emblaApi);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("select", onSelect);
    emblaApi.on("init", onInit); // Listen for init event
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
      emblaApi.off("init", onInit);
    };
  }, [emblaApi, onSelect, onInit]);

  // Reset carousel to initial index when dialog opens
  useEffect(() => {
    if (open && emblaApi) {
      emblaApi.scrollTo(initialIndex, false);
      onSelect(emblaApi);
    }
  }, [open, emblaApi, initialIndex, onSelect]);

  if (!mediaUrls || mediaUrls.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 w-screen h-screen p-0 border-none bg-black/80 flex items-center justify-center translate-x-0 translate-y-0 overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">Media viewer</DialogTitle>
        <div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 text-white hover:bg-white/20 hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        <div className="relative flex-1 flex items-center justify-center w-full h-full">
          <div className="overflow-hidden w-full h-full flex items-center justify-center" ref={emblaRef}>
            <div className="flex h-full w-full">
              {mediaUrls.map((url, index) => (
                <div key={index} className="embla__slide flex-none min-w-0 flex items-center justify-center h-full w-full">
                  {url.match(/\.(mp4|webm|ogg)$/i) ? (
                    <video
                      src={url}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    />
                  ) : (
                    <img
                      src={url}
                      alt={`Card media ${index + 1}`}
                      className="w-full h-full max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {mediaUrls.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 hover:text-white"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 hover:text-white"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>

              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
                {scrollSnaps.map((_, index) => (
                  <button
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full bg-white/50 transition-colors",
                      index === selectedIndex && "bg-white"
                    )}
                    onClick={() => scrollTo(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MediaCarouselDialog;