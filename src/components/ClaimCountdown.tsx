import React, { useState, useEffect, useRef } from 'react'; // Import useRef
import { cn } from '@/lib/utils';
import { addMinutes, isPast, parseISO } from 'date-fns';
import { Clock } from 'lucide-react';
import { CLAIM_DURATION_MINUTES } from '@/config';

interface ClaimCountdownProps {
  claimedAt: string; // ISO 8601 string
  onExpired: () => void;
  className?: string;
}

const ClaimCountdown: React.FC<ClaimCountdownProps> = ({ claimedAt, onExpired, className }) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Use useRef to store the onExpired callback, preventing re-renders from re-triggering the effect
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    const claimedDate = parseISO(claimedAt);

    if (isNaN(claimedDate.getTime())) {
      console.error("ClaimCountdown received an invalid claimedAt date string:", claimedAt);
      setIsExpired(true);
      setTimeLeft("Invalid Date");
      return;
    }

    const expiryDate = addMinutes(claimedDate, CLAIM_DURATION_MINUTES);
    let timer: NodeJS.Timeout; // Declare timer here to be accessible in cleanup

    const calculateTime = () => {
      if (isPast(expiryDate)) {
        setIsExpired(true);
        setTimeLeft("Expired");
        clearInterval(timer); // Clear the interval immediately
        onExpiredRef.current(); // Call the stored onExpired function
        return;
      }

      const now = new Date();
      const difference = expiryDate.getTime() - now.getTime();

      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    };

    calculateTime(); // Initial calculation
    timer = setInterval(calculateTime, 1000);

    return () => clearInterval(timer); // Cleanup on unmount or dependency change
  }, [claimedAt]); // Removed onExpired from dependencies

  if (!timeLeft) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        isExpired ? "bg-destructive/20 text-destructive border border-destructive/40" : "bg-primary/15 text-primary border border-primary/30",
        className
      )}
    >
      <Clock className="w-3 h-3" />
      <span>{isExpired ? "Claim Expired" : `Expires in ${timeLeft}`}</span>
    </div>
  );
};

export default ClaimCountdown;