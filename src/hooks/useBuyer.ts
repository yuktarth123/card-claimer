import { useEffect, useState } from "react";

const NAME_KEY = "tcg_buyer_name";
const PHONE_KEY = "tcg_buyer_phone";
const SESSION_KEY = "tcg_buyer_session";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useBuyer() {
  const [name, setNameState] = useState<string>("");
  const [phone, setPhoneState] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    const storedName = localStorage.getItem(NAME_KEY) || "";
    const storedPhone = localStorage.getItem(PHONE_KEY) || "";
    let storedSession = localStorage.getItem(SESSION_KEY);
    if (!storedSession) {
      storedSession = uuid();
      localStorage.setItem(SESSION_KEY, storedSession);
    }
    setNameState(storedName);
    setPhoneState(storedPhone);
    setSessionId(storedSession);
  }, []);

  const setName = (n: string) => {
    const trimmed = n.trim();
    setNameState(trimmed);
    localStorage.setItem(NAME_KEY, trimmed);
  };

  const setPhone = (p: string) => {
    const trimmed = p.trim();
    setPhoneState(trimmed);
    localStorage.setItem(PHONE_KEY, trimmed);
  };

  const setIdentity = (n: string, p: string) => {
    setName(n);
    setPhone(p);
  };

  return { name, phone, sessionId, setName, setPhone, setIdentity };
}