import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  targetDate: string; // ISO 8601 string
  onCountdownEnd?: () => void;
  className?: string;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetDate, onCountdownEnd, className }) => {
  const calculateTimeLeft = () => {
    const difference = +new Date(targetDate) - +new Date();
    let timeLeft = {};

    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    }
    return timeLeft;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);
      if (Object.keys(newTimeLeft).length === 0) {
        setIsLive(true);
        onCountdownEnd?.();
      }
    }, 1000);

    return () => clearTimeout(timer);
  });

  const timerComponents: JSX.Element[] = [];

  Object.keys(timeLeft).forEach((interval) => {
    if (timeLeft[interval as keyof typeof timeLeft] !== undefined) {
      timerComponents.push(
        <span key={interval} className="flex flex-col items-center min-w-[40px]">
          <span className="text-xl md:text-2xl font-bold text-primary">
            {String(timeLeft[interval as keyof typeof timeLeft]).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted-foreground uppercase">{interval}</span>
        </span>
      );
    }
  });

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {isLive ? (
        <span className="text-lg md:text-xl font-bold text-success">SALE IS LIVE!</span>
      ) : timerComponents.length ? (
        timerComponents
      ) : (
        <span className="text-lg md:text-xl font-bold text-success">SALE IS LIVE!</span>
      )}
    </div>
  );
};

export default CountdownTimer;