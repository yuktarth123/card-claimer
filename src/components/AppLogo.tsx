import React, { useState } from 'react';
import { Circle } from 'lucide-react'; // Changed from Pokeball to Circle
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string; // This will be applied to the img or Circle
  alt?: string;
}

const AppLogo: React.FC<AppLogoProps> = ({ className, alt = "App Logo" }) => {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  return imageError ? (
    <Circle className={cn("text-muted-foreground", className)} />
  ) : (
    <img
      src="/yanks-tcg-logo.png"
      alt={alt}
      className={cn("object-contain", className)}
      onError={handleImageError}
    />
  );
};

export default AppLogo;