import React from 'react';
import { Button } from '@/components/ui/button';
import { Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrossPromoBannerProps {
  className?: string;
}

const HOT_WHEELS_SITE_URL = "https://card-claimer-main.vercel.app";

const CrossPromoBanner: React.FC<CrossPromoBannerProps> = ({ className }) => {
  return (
    <div className={cn("bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left", className)}>
      <div className="flex items-center gap-3">
        <Car className="w-6 h-6 text-primary flex-shrink-0" />
        <div>
          <p className="font-semibold text-foreground">Also collect diecast cars?</p>
          <p className="text-sm text-muted-foreground">Check out Yanks Diecast for Hot Wheels, Matchbox & more.</p>
        </div>
      </div>
      <Button asChild variant="outline" className="font-bold flex-shrink-0">
        <a href={HOT_WHEELS_SITE_URL} target="_blank" rel="noopener noreferrer">
          Visit Yanks Diecast
        </a>
      </Button>
    </div>
  );
};

export default CrossPromoBanner;
